/**
 * Phase 4 tests — deterministic AI-free job matching.
 *
 * Unit describes run everywhere (pure matcher, no DB, no network, no LLM).
 * Integration describes REQUIRE PostgreSQL (DATABASE_URL) and use
 * deterministic fixtures through the real HTTP stack.
 *
 * Isolation: all rows belong to users `p4test-<name>-<ts>`,
 * removed in afterAll (cascades clean children).
 */
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import {
  MATCH_THRESHOLDS,
  MATCH_WEIGHTS,
  MatchResultSchema,
  decisionForScore,
  type CandidateSnapshot,
  type JobSnapshot,
  type MatchResult,
} from "@jobcopilot/shared";
import { createApp } from "../src/app.js";
import {
  extractSkills,
  normalizeCandidateSkills,
  normalizeSkill,
} from "../src/services/skill-normalizer.js";
import {
  scoreEducation,
  scoreExperience,
  scoreLocation,
  scoreRole,
  scoreSalary,
} from "../src/services/match-components.js";
import {
  getMatchProvider,
  matchJob,
  registerMatchProvider,
  type MatchProvider,
} from "../src/services/job-matcher.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const U = (name: string) => `p4test-${name}-${TS}`;
const H = (name: string) => ({ "x-dev-user-id": U(name) });

const app = createApp();

afterAll(async () => {
  if (!DB) return;
  await prisma.user.deleteMany({ where: { id: { startsWith: "p4test-" } } });
  await prisma.$disconnect();
});

// ---------- fixtures ----------

const CANDIDATE: CandidateSnapshot = {
  targetRoles: ["Full Stack Engineer"],
  skills: ["React", "TypeScript", "Node.js", "PostgreSQL"],
  experienceYears: 4,
  preferredLocations: ["Bangalore"],
  remotePreference: "REMOTE",
  minimumSalary: 120000,
  preferredCurrency: "USD",
  education: ["BTech Computer Science"],
  projects: [
    {
      id: "proj-1",
      name: "Shop",
      description: "E-commerce app",
      technologies: ["React", "Node.js"],
      role: "Full Stack Developer",
    },
  ],
};

function job(overrides: Partial<JobSnapshot> = {}): JobSnapshot {
  return {
    id: "job-1",
    title: "Full Stack Developer",
    company: "Acme",
    description:
      "We need a full stack developer with React, TypeScript, Node.js and PostgreSQL. " +
      "3+ years experience required. Bachelor's degree in Computer Science. Remote friendly.",
    employmentType: "FULL_TIME",
    remote: true,
    location: "Remote",
    salaryMin: 130000,
    salaryMax: 160000,
    salaryCurrency: "USD",
    ...overrides,
  };
}

// ---------- skill normalization ----------

describe("skill normalization", () => {
  it("normalizes common aliases to canonical keys", () => {
    expect(normalizeSkill("React.js")).toBe("react");
    expect(normalizeSkill("ReactJS")).toBe("react");
    expect(normalizeSkill("Node.js")).toBe("node");
    expect(normalizeSkill("TS")).toBe("typescript");
    expect(normalizeSkill("JavaScript")).toBe("javascript");
    expect(normalizeSkill("JS")).toBe("javascript");
    expect(normalizeSkill("Postgres")).toBe("postgresql");
    expect(normalizeSkill("k8s")).toBe("kubernetes");
    expect(normalizeSkill("Golang")).toBe("go");
  });

  it("returns null for unknown skills instead of misbucketing", () => {
    expect(normalizeSkill("CobolMainframeX")).toBeNull();
    expect(normalizeSkill("")).toBeNull();
  });

  it("never lets java match javascript (word boundaries)", () => {
    expect(extractSkills("JavaScript developer")).toEqual(["javascript"]);
    expect(extractSkills("Java developer")).toEqual(["java"]);
    expect(extractSkills("Java and JavaScript developer").sort()).toEqual(["java", "javascript"]);
    // Ordinary English must not trigger skills.
    expect(extractSkills("We go the extra mile and rest often")).toEqual([]);
  });

  it("extracts each skill once and maps spring to java", () => {
    expect(extractSkills("React, React.js and reactjs")).toEqual(["react"]);
    expect(extractSkills("Backend with Java and Spring Boot")).toEqual(["java"]);
  });

  it("dedupes candidate skills across alias spellings", () => {
    const { known, unknown } = normalizeCandidateSkills(["React", "react.js", "REACT", "CobolMainframeX"]);
    expect(known).toEqual(["react"]);
    expect(unknown).toEqual(["cobolmainframex"]);
  });
});

// ---------- role matching ----------

describe("role matching", () => {
  it("recognizes equivalent and stack-implied titles", () => {
    expect(scoreRole(["Full Stack Engineer"], "Full Stack Developer").score).toBe(100);
    expect(scoreRole(["Full Stack Engineer"], "Software Engineer - Full Stack").score).toBe(100);
    // React + Node implies full-stack work: meaningful (strong) similarity.
    expect(scoreRole(["Full Stack Engineer"], "React/Node Developer").score).toBeGreaterThanOrEqual(65);
    expect(scoreRole(["Full Stack Engineer"], "Graphic Designer").score).toBe(0);
  });

  it("is unknown when the candidate lists no target roles", () => {
    const out = scoreRole([], "Backend Engineer");
    expect(out.score).toBeNull();
    expect(out.uncertain.length).toBeGreaterThan(0);
  });
});

// ---------- experience ----------

describe("experience matching", () => {
  const desc = "Looking for a developer with 3+ years experience.";
  it("detects met requirements", () => {
    const out = scoreExperience(4, desc);
    expect(out.score).toBe(100);
    expect(out.matched.length).toBeGreaterThan(0);
  });
  it("detects unmet requirements", () => {
    const out = scoreExperience(1, desc);
    expect(out.score).toBe(0);
    expect(out.missing.length).toBeGreaterThan(0);
  });
  it("is unknown when the job states nothing", () => {
    expect(scoreExperience(4, "Great team, apply now.").score).toBeNull();
  });
  it("is unknown when the candidate figure is missing", () => {
    const out = scoreExperience(null, desc);
    expect(out.score).toBeNull();
    expect(out.uncertain.join(" ")).toMatch(/3\+ years/);
  });
});

// ---------- location ----------

describe("location matching", () => {
  it("rewards remote-on-remote", () => {
    expect(scoreLocation("REMOTE", [], true, "Remote").score).toBe(100);
  });
  it("matches preferred locations", () => {
    expect(scoreLocation("ANY", ["Bangalore"], false, "Bangalore, India").score).toBe(100);
  });
  it("penalizes onsite-against-remote-preference", () => {
    const out = scoreLocation("REMOTE", [], false, "New York");
    expect(out.score).toBeLessThan(50);
    expect(out.warnings.length).toBeGreaterThan(0);
  });
  it("is unknown when the job has no location", () => {
    expect(scoreLocation("ANY", [], false, null).score).toBeNull();
  });
});

// ---------- salary ----------

describe("salary matching", () => {
  it("rewards ranges above the candidate minimum", () => {
    expect(scoreSalary(120000, "USD", 130000, 160000, "USD").score).toBe(100);
  });
  it("penalizes ranges below the candidate minimum", () => {
    const out = scoreSalary(120000, "USD", 80000, 100000, "USD");
    expect(out.score).toBeLessThan(50);
    expect(out.warnings.length).toBeGreaterThan(0);
  });
  it("is unknown without job salary or candidate minimum", () => {
    expect(scoreSalary(120000, "USD", null, null, "USD").score).toBeNull();
    expect(scoreSalary(null, "USD", 130000, 160000, "USD").score).toBeNull();
  });
  it("skips comparison on currency mismatch instead of converting", () => {
    const out = scoreSalary(120000, "USD", 130000, 160000, "EUR");
    expect(out.score).toBeNull();
    expect(out.uncertain.join(" ")).toMatch(/Currency differs/);
  });
});

// ---------- education ----------

describe("education matching", () => {
  const desc = "Bachelor's degree in Computer Science or related field required.";
  it("matches covered requirements", () => {
    const out = scoreEducation(["BTech Computer Science"], desc);
    expect(out.score).toBe(100);
  });
  it("is unknown without a stated requirement or candidate data", () => {
    expect(scoreEducation(["BTech"], "Great team, apply now.").score).toBeNull();
    expect(scoreEducation([], desc).score).toBeNull();
  });
});

// ---------- overall engine ----------

describe("matching engine", () => {
  it("scores a strong fit at 100 with full explanations", async () => {
    const result = await matchJob(CANDIDATE, job());
    expect(result).toMatchObject({
      jobId: "job-1",
      overallScore: 100,
      decision: "STRONG_MATCH",
    });
    expect(result.matchedSkills.sort()).toEqual(["Node.js", "PostgreSQL", "React", "TypeScript"]);
    expect(result.missingSkills).toEqual([]);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(MatchResultSchema.safeParse(result).success).toBe(true);
  });

  it("reports missing skills and a low decision for poor fits", async () => {
    const poor = job({
      id: "job-poor",
      title: "Backend Engineer",
      description:
        "Backend role requiring Java, Spring, AWS, Docker and Kubernetes. 5+ years experience. Onsite in New York. Salary $80k-$100k.",
      remote: false,
      location: "New York",
      salaryMin: 80000,
      salaryMax: 100000,
    });
    const result = await matchJob(CANDIDATE, poor);
    expect(result.missingSkills.sort()).toEqual(["AWS", "Docker", "Java", "Kubernetes"]);
    expect(result.matchedSkills).toEqual([]);
    expect(result.breakdown.skillScore).toBe(0);
    expect(result.decision).toBe("LOW_MATCH");
    expect(result.overallScore).toBeLessThan(50);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("handles jobs with no detectable skills, salary, or location gracefully", async () => {
    const bare = job({
      id: "job-bare",
      title: "Mystery Role",
      description: "We are hiring. Great team, apply now.",
      remote: false,
      location: null,
      salaryMin: null,
      salaryMax: null,
    });
    const result = await matchJob(CANDIDATE, bare);
    expect(result.breakdown.skillScore).toBe(50); // neutral, not 100
    expect(result.uncertainRequirements.length).toBeGreaterThan(0);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it("keeps every score within 0–100 as integers", async () => {
    const variants: JobSnapshot[] = [
      job(),
      job({ remote: false, location: null, salaryMin: null, salaryMax: null }),
      job({ title: "", description: "" }),
      job({ title: "Designer", description: "Photoshop expert wanted onsite." }),
    ];
    const candidates: CandidateSnapshot[] = [
      CANDIDATE,
      { targetRoles: [], skills: [], preferredLocations: [], remotePreference: "ANY", preferredCurrency: "USD", education: [], projects: [] },
    ];
    for (const c of candidates) {
      for (const j of variants) {
        const r = await matchJob(c, j);
        const scores = [r.overallScore, ...Object.values(r.breakdown)];
        for (const s of scores) {
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it("applies centralized decision thresholds", () => {
    expect(decisionForScore(100)).toBe("STRONG_MATCH");
    expect(decisionForScore(80)).toBe("STRONG_MATCH");
    expect(decisionForScore(79)).toBe("GOOD_MATCH");
    expect(decisionForScore(65)).toBe("GOOD_MATCH");
    expect(decisionForScore(64)).toBe("PARTIAL_MATCH");
    expect(decisionForScore(50)).toBe("PARTIAL_MATCH");
    expect(decisionForScore(49)).toBe("LOW_MATCH");
    expect(decisionForScore(0)).toBe("LOW_MATCH");
  });

  it("weights sum to 100", () => {
    const total = Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
    expect(MATCH_THRESHOLDS.STRONG_MATCH).toBeGreaterThan(MATCH_THRESHOLDS.GOOD_MATCH);
  });

  it("is deterministic and template-based (no LLM)", async () => {
    const a = await matchJob(CANDIDATE, job());
    const b = await matchJob(CANDIDATE, job());
    expect(a).toEqual(b);
    expect(a.reasons.join(" ")).not.toMatch(/as an AI|language model/i);
  });

  it("supports the provider abstraction for future AI providers", async () => {
    expect(getMatchProvider().id).toBe("deterministic");
    expect(() => getMatchProvider("llm-future")).toThrowError(/Unknown match provider/);
    const custom: MatchProvider = {
      id: "test-custom",
      match: (_c, j): MatchResult => ({
        jobId: j.id,
        overallScore: 1,
        decision: "LOW_MATCH",
        matchMode: "deterministic",
        breakdown: { skillScore: 1, roleScore: 1, experienceScore: 1, locationScore: 1, salaryScore: 1, educationScore: 1 },
        matchedSkills: [],
        missingSkills: [],
        matchedRequirements: [],
        missingRequirements: [],
        uncertainRequirements: [],
        reasons: ["custom"],
        warnings: [],
      }),
    };
    registerMatchProvider(custom);
    expect(await getMatchProvider("test-custom").match(CANDIDATE, job())).toMatchObject({
      overallScore: 1,
    });
  });
});

// ---------- integration ----------

describe.skipIf(!DB)("matching API + persistence", () => {
  async function seedUser(name: string) {
    const h = H(name);
    await request(app).put("/api/profile").set(h).send({
      fullName: "P4 Tester",
      yearsOfExperience: 4,
      education: [{ degree: "BTech", field: "Computer Science", school: "Test Univ" }],
      preferences: {
        targetRoles: ["Full Stack Engineer"],
        skills: ["React", "TypeScript", "Node.js", "PostgreSQL"],
        minSalary: 120000,
        salaryCurrency: "USD",
        preferredLocations: ["Bangalore"],
        workMode: "REMOTE",
      },
    });
    await request(app).post("/api/projects").set(h).send({
      name: "Shop",
      description: "E-commerce app",
      technologies: ["React", "Node.js"],
    });
    const mkJob = (title: string, description: string, extra: Record<string, unknown> = {}) =>
      request(app).post("/api/jobs").set(h).send({ title, company: "Acme", description, ...extra });
    const strong = await mkJob(
      "Full Stack Developer",
      "Full stack developer with React, TypeScript, Node.js and PostgreSQL. 3+ years experience. Bachelor's degree in Computer Science.",
      { remote: true, location: "Remote", salaryMin: 130000, salaryMax: 160000, salaryCurrency: "USD" },
    );
    const weak = await mkJob(
      "Graphic Designer",
      "Graphic designer with Photoshop and Illustrator. 5+ years experience. Onsite in New York. Salary 50000-60000 USD.",
      { location: "New York", salaryMin: 50000, salaryMax: 60000, salaryCurrency: "USD" },
    );
    const bare = await mkJob("Mystery Role", "We are hiring. Great team, apply now.");
    return { h, strongId: strong.body.job.id as string, weakId: weak.body.job.id as string, bareId: bare.body.job.id as string };
  }

  it("scores one job, persists, and re-runs idempotently", async () => {
    const { h, strongId } = await seedUser("single");
    const first = await request(app).post(`/api/jobs/${strongId}/match`).set(h).expect(200);
    expect(first.body.match.decision).toBe("STRONG_MATCH");
    expect(first.body.match.matchedSkills).toContain("React");
    expect(first.body.match.overallScore).toBeGreaterThanOrEqual(80);

    const saved = await request(app).get(`/api/jobs/${strongId}/match`).set(h).expect(200);
    expect(saved.body.match).toEqual(first.body.match);

    await request(app).post(`/api/jobs/${strongId}/match`).set(h).expect(200);
    const rows = await prisma.jobMatch.findMany({ where: { userId: U("single") } });
    expect(rows).toHaveLength(1); // upsert: no duplicates
    expect(rows[0].decision).toBe("STRONG_MATCH");
    expect(rows[0].matchedSkills).toContain("React");
  });

  it("runs bounded batch matching and filters the match list", async () => {
    const { h } = await seedUser("batch");
    const run = await request(app).post("/api/matches/run").set(h).send({ limit: 10 }).expect(200);
    expect(run.body.matched).toBe(3);
    expect(run.body.matches).toHaveLength(3);

    const all = await request(app).get("/api/matches").set(h).expect(200);
    expect(all.body.matches).toHaveLength(3);
    expect(all.body.matches[0].overallScore).toBeGreaterThanOrEqual(
      all.body.matches[1].overallScore,
    ); // score descending

    const strong = await request(app).get("/api/matches?minScore=80").set(h).expect(200);
    expect(strong.body.matches.length).toBeGreaterThanOrEqual(1);
    expect(strong.body.matches.every((m: { overallScore: number }) => m.overallScore >= 80)).toBe(true);

    const low = await request(app).get("/api/matches?decision=LOW_MATCH").set(h).expect(200);
    expect(low.body.matches.length).toBeGreaterThanOrEqual(1);

    await request(app).get("/api/matches?decision=NOPE").set(h).expect(400);
    await request(app).post("/api/matches/run").set(h).send({ limit: 500 }).expect(400);
  });

  it("isolates matches per user", async () => {
    const { strongId } = await seedUser("alice");
    await request(app).post(`/api/jobs/${strongId}/match`).set(H("alice")).expect(200);
    // Another user cannot see or touch Alice's job or match.
    await request(app).get(`/api/jobs/${strongId}/match`).set(H("bob")).expect(404);
    await request(app).post(`/api/jobs/${strongId}/match`).set(H("bob")).expect(404);
    const list = await request(app).get("/api/matches").set(H("bob")).expect(200);
    expect(list.body.matches).toHaveLength(0);
  });

  it("handles missing profile and unknown jobs with 404", async () => {
    await request(app).post("/api/jobs/does-not-exist/match").set(H("noprofile")).expect(404);
    const { h } = await seedUser("empty");
    await prisma.profile.delete({ where: { userId: U("empty") } });
    const j = await request(app)
      .post("/api/jobs")
      .set(h)
      .send({ title: "T", company: "C", description: "D" });
    await request(app).post(`/api/jobs/${j.body.job.id}/match`).set(h).expect(404);
  });
});


