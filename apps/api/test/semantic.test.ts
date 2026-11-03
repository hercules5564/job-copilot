/**
 * Phase 5 tests — semantic/hybrid matching.
 *
 * No network, no paid APIs, no LLM calls: the embedding layer is covered
 * with the offline LocalHashEmbeddingProvider, a deterministic fake
 * provider with predictable vectors, and a mocked fetch for the
 * OpenAI-compatible HTTP provider.
 *
 * Integration describes REQUIRE PostgreSQL (DATABASE_URL).
 * Isolation: rows belong to users `p5test-<name>-<ts>`, removed in afterAll.
 */
import { describe, it, expect, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import {
  HYBRID_WEIGHTS,
  MatchResultSchema,
  type CandidateSnapshot,
  type JobSnapshot,
} from "@jobcopilot/shared";
import { createApp } from "../src/app.js";
import {
  LocalHashEmbeddingProvider,
  OpenAICompatibleEmbeddingProvider,
  buildCandidateText,
  buildJobText,
  cosineSimilarity,
  cosineToScore,
  embedWithCache,
  embeddingCache,
  getEmbeddingProvider,
  sha256Hex,
  type EmbeddingProvider,
} from "../src/services/embeddings.js";
import { matchJob } from "../src/services/job-matcher.js";
import {
  HybridMatchProvider,
  SemanticMatchProvider,
  computeSemanticSignal,
  getHybridWeights,
  hasHardMismatch,
} from "../src/services/semantic-matcher.js";
import { resolveMatchMode, runMatchForJob, runMatches } from "../src/services/match-runner.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const U = (name: string) => `p5test-${name}-${TS}`;
const H = (name: string) => ({ "x-dev-user-id": U(name) });

const app = createApp();

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
    { name: "Shop", description: "E-commerce app", technologies: ["React", "Node.js"], role: "Full Stack" },
  ],
};

function job(overrides: Partial<JobSnapshot> = {}): JobSnapshot {
  return {
    id: "job-1",
    title: "Full Stack Developer",
    company: "Acme",
    description:
      "Full stack developer with React, TypeScript, Node.js and PostgreSQL. " +
      "3+ years experience. Bachelor's degree in Computer Science.",
    employmentType: "FULL_TIME",
    remote: true,
    location: "Remote",
    salaryMin: 130000,
    salaryMax: 160000,
    salaryCurrency: "USD",
    ...overrides,
  };
}

/** Deterministic fake: predictable vectors, counts calls (cache tests). */
class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly id = "fake-test";
  readonly model = "fake-v1";
  calls = 0;
  constructor(private readonly vectors: Record<string, number[]>) {}
  async embed(text: string): Promise<number[]> {
    this.calls += 1;
    if (text in this.vectors) return this.vectors[text];
    return [1, 0, 0];
  }
}

beforeEach(() => {
  embeddingCache.clear();
  delete process.env.MATCH_PROVIDER;
  delete process.env.EMBEDDING_PROVIDER;
  delete process.env.AI_API_KEY;
  delete process.env.HYBRID_DETERMINISTIC_WEIGHT;
  delete process.env.HYBRID_SEMANTIC_WEIGHT;
});

afterAll(async () => {
  if (!DB) return;
  await prisma.user.deleteMany({ where: { id: { startsWith: "p5test-" } } });
  await prisma.$disconnect();
});

// ---------- cosine similarity ----------

describe("cosine similarity", () => {
  it("scores identical vectors at 100", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineToScore(1)).toBe(100);
  });
  it("maps orthogonal vectors to neutral 50", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineToScore(0)).toBe(50);
  });
  it("maps opposite vectors to 0", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosineToScore(-1)).toBe(0);
  });
  it("returns null for zero vectors (never NaN/Infinity)", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBeNull();
    expect(cosineSimilarity([0, 0], [0, 0])).toBeNull();
    const r = cosineSimilarity([0, 0], [0, 0]);
    expect(r === null || Number.isFinite(r)).toBe(true);
  });
  it("rejects dimension mismatches and non-finite values", () => {
    expect(() => cosineSimilarity([1, 2], [1])).toThrowError(/dimension mismatch/);
    expect(() => cosineSimilarity([1, NaN], [1, 2])).toThrowError(/non-finite/);
  });
  it("clamps out-of-range input into score bounds", () => {
    expect(cosineToScore(2)).toBe(100);
    expect(cosineToScore(-2)).toBe(0);
  });
});

// ---------- deterministic provider unchanged ----------

describe("deterministic provider (Phase 4 intact)", () => {
  it("still scores the strong fixture at 100 in deterministic mode", async () => {
    const result = await matchJob(CANDIDATE, job());
    expect(result.overallScore).toBe(100);
    expect(result.decision).toBe("STRONG_MATCH");
    expect(result.matchMode).toBe("deterministic");
    expect(result.semanticScore).toBeUndefined();
  });
});

// ---------- provider selection ----------

describe("provider selection", () => {
  it("defaults to deterministic with no configuration", () => {
    expect(resolveMatchMode()).toBe("deterministic");
    expect(resolveMatchMode(undefined)).toBe("deterministic");
  });
  it("honors the MATCH_PROVIDER env and request overrides", () => {
    process.env.MATCH_PROVIDER = "hybrid";
    expect(resolveMatchMode()).toBe("hybrid");
    expect(resolveMatchMode("semantic")).toBe("semantic");
    expect(resolveMatchMode("deterministic")).toBe("deterministic");
  });
  it("falls back to deterministic on invalid configuration", () => {
    process.env.MATCH_PROVIDER = "gpt-magic";
    expect(resolveMatchMode()).toBe("deterministic");
  });
  it("exposes all three providers through the registry", async () => {
    const { getMatchProvider } = await import("../src/services/job-matcher.js");
    expect(getMatchProvider("deterministic").id).toBe("deterministic");
    expect(getMatchProvider("semantic").id).toBe("semantic");
    expect(getMatchProvider("hybrid").id).toBe("hybrid");
  });
});

// ---------- embedding text + hashing ----------

describe("embedding text and hashing", () => {
  it("builds bounded, whitespace-normalized texts without IDs or secrets", () => {
    const c = buildCandidateText(CANDIDATE);
    expect(c).toContain("Full Stack Engineer");
    expect(c).toContain("PostgreSQL");
    expect(c).not.toMatch(/sk-|Bearer|DATABASE_URL|password/i);
    expect(c.length).toBeLessThanOrEqual(4000);
    const j = buildJobText(job());
    expect(j).toContain("Full Stack Developer");
    expect(j.length).toBeLessThanOrEqual(4000);
  });
  it("hashes deterministically with SHA-256", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"));
    expect(sha256Hex("abc")).toHaveLength(64);
  });
});

// ---------- cache ----------

describe("embedding cache", () => {
  it("reuses cached vectors for unchanged text", async () => {
    const fake = new FakeEmbeddingProvider({});
    const first = await embedWithCache(fake, "hello");
    const second = await embedWithCache(fake, "hello");
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.vector).toEqual(first.vector);
    expect(fake.calls).toBe(1);
  });
  it("regenerates on text change", async () => {
    const fake = new FakeEmbeddingProvider({});
    await embedWithCache(fake, "hello");
    await embedWithCache(fake, "hello world");
    expect(fake.calls).toBe(2);
  });
  it("isolates cache entries per provider and model", async () => {
    const a = new FakeEmbeddingProvider({});
    const b = new FakeEmbeddingProvider({});
    const other: EmbeddingProvider = {
      id: "fake-other",
      model: "fake-v1",
      embed: (text: string) => b.embed(text),
    };
    await embedWithCache(a, "hello");
    await embedWithCache(other, "hello");
    expect(a.calls).toBe(1);
  });
});

// ---------- embedding providers ----------

describe("embedding providers", () => {
  it("defaults to the offline local provider", async () => {
    const provider = getEmbeddingProvider();
    expect(provider.id).toBe("local-hash");
    const vec = await provider.embed("full stack react developer");
    expect(vec.length).toBe(256);
    expect(vec.every(Number.isFinite)).toBe(true);
    // Deterministic: same text, same vector.
    expect(await provider.embed("full stack react developer")).toEqual(vec);
  });
  it("local similarity is higher for related texts than unrelated ones", async () => {
    const provider = new LocalHashEmbeddingProvider();
    const base = "full stack developer react typescript node";
    const related = "frontend development using react and typescript";
    const unrelated = "graphic design photoshop illustration print";
    const sim = async (t: string): Promise<number> =>
      (cosineSimilarity(await provider.embed(base), await provider.embed(t)) ?? -2);
    expect(await sim(related)).toBeGreaterThan(await sim(unrelated));
  });
  it("requires AI_API_KEY for the OpenAI-compatible provider", () => {
    process.env.EMBEDDING_PROVIDER = "openai";
    expect(() => getEmbeddingProvider()).toThrowError(/AI_API_KEY/);
  });
  it("rejects unknown EMBEDDING_PROVIDER values", () => {
    process.env.EMBEDDING_PROVIDER = "pinecone";
    expect(() => getEmbeddingProvider()).toThrowError(/Unknown EMBEDDING_PROVIDER/);
  });
  it("maps HTTP failures to safe categories (mocked fetch, no network)", async () => {
    const authFail = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    const limited = (async () => new Response("slow", { status: 429 })) as typeof fetch;
    const garbage = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    const base = { baseUrl: "https://ai.example", apiKey: "k", model: "m", timeoutMs: 1000 };
    await expect(
      new OpenAICompatibleEmbeddingProvider({ ...base, fetchImpl: authFail }).embed("x"),
    ).rejects.toThrow(/authentication/);
    await expect(
      new OpenAICompatibleEmbeddingProvider({ ...base, fetchImpl: limited }).embed("x"),
    ).rejects.toThrow(/rate limit/);
    await expect(
      new OpenAICompatibleEmbeddingProvider({ ...base, fetchImpl: garbage }).embed("x"),
    ).rejects.toThrow(/malformed/);
  });
  it("accepts a well-formed OpenAI-compatible response (mocked)", async () => {
    const ok = (async () =>
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.7] }] }), {
        status: 200,
      })) as typeof fetch;
    const provider = new OpenAICompatibleEmbeddingProvider({
      baseUrl: "https://ai.example",
      apiKey: "k",
      model: "m",
      timeoutMs: 1000,
      fetchImpl: ok,
    });
    expect(await provider.embed("x")).toEqual([0.1, 0.2, 0.7]);
  });
});

// ---------- semantic + hybrid scoring ----------

describe("semantic and hybrid providers", () => {
  it("semantic mode reports an honest mode and score", async () => {
    const result = await new SemanticMatchProvider().match(CANDIDATE, job());
    expect(result.matchMode).toBe("semantic");
    expect(result.semanticScore).toBeGreaterThanOrEqual(0);
    expect(result.semanticScore).toBeLessThanOrEqual(100);
    expect(result.semanticProvider).toBe("local-hash");
    expect(result.semanticModel).toBe("token-hash-v1");
    // Deterministic explainability is preserved.
    expect(result.matchedSkills).toContain("React");
    expect(MatchResultSchema.safeParse(result).success).toBe(true);
  });
  it("hybrid blends 70/30 by default", async () => {
    expect(HYBRID_WEIGHTS).toEqual({ deterministic: 70, semantic: 30 });
    expect(getHybridWeights()).toEqual({ deterministic: 70, semantic: 30 });
    const det = await matchJob(CANDIDATE, job());
    const hybrid = await new HybridMatchProvider().match(CANDIDATE, job());
    expect(hybrid.matchMode).toBe("hybrid");
    expect(hybrid.semanticScore).not.toBeUndefined();
    const expected = Math.round(
      (det.overallScore * 70 + hybrid.semanticScore! * 30) / 100,
    );
    // No guardrail interference on this clean fit.
    expect(hasHardMismatch(det)).toBe(false);
    expect(hybrid.overallScore).toBe(expected);
  });
  it("guardrails cap obvious mismatches in LOW band", async () => {
    const designer = job({
      id: "job-designer",
      title: "Graphic Designer",
      description: "Graphic designer with Photoshop. 5+ years experience. Onsite in New York.",
      remote: false,
      location: "New York",
      salaryMin: null,
      salaryMax: null,
    });
    const det = await matchJob(CANDIDATE, designer);
    expect(hasHardMismatch(det)).toBe(true);
    const hybrid = await new HybridMatchProvider().match(CANDIDATE, designer);
    expect(hybrid.overallScore).toBeLessThanOrEqual(49);
    expect(hybrid.decision).toBe("LOW_MATCH");
    const semantic = await new SemanticMatchProvider().match(CANDIDATE, designer);
    expect(semantic.overallScore).toBeLessThanOrEqual(49);
  });
  it("hard experience facts survive hybrid scoring", async () => {
    const senior = job({
      id: "job-senior",
      title: "Full Stack Developer",
      description: "Full stack developer with React. 10+ years experience required.",
      remote: true,
      location: "Remote",
    });
    const hybrid = await new HybridMatchProvider().match(CANDIDATE, senior);
    expect(hybrid.missingRequirements.join(" ")).toMatch(/10\+ years/);
    expect(hybrid.breakdown.experienceScore).toBe(0);
    expect(hybrid.overallScore).toBeLessThanOrEqual(49);
  });
});

// ---------- integration ----------

describe.skipIf(!DB)("semantic API + persistence", () => {
  async function seedUser(name: string) {
    const h = H(name);
    await request(app).put("/api/profile").set(h).send({
      fullName: "P5 Tester",
      yearsOfExperience: 4,
      education: [{ degree: "BTech", field: "Computer Science" }],
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
    const created = await request(app).post("/api/jobs").set(h).send({
      title: "Full Stack Developer",
      company: "Acme",
      description:
        "Full stack developer with React, TypeScript, Node.js and PostgreSQL. 3+ years experience. Bachelor's degree.",
      remote: true,
      location: "Remote",
      salaryMin: 130000,
      salaryMax: 160000,
      salaryCurrency: "USD",
    });
    const weak = await request(app).post("/api/jobs").set(h).send({
      title: "Graphic Designer",
      company: "Studio",
      description: "Graphic designer with Photoshop. 5+ years experience. Onsite in New York.",
      location: "New York",
    });
    return { h, strongId: created.body.job.id as string, weakId: weak.body.job.id as string };
  }

  it("hybrid mode persists semantic metadata and stays idempotent", async () => {
    const { h, strongId } = await seedUser("hybrid");
    const first = await request(app)
      .post(`/api/jobs/${strongId}/match`)
      .set(h)
      .send({ mode: "hybrid" })
      .expect(200);
    expect(first.body.match.matchMode).toBe("hybrid");
    expect(first.body.match.semanticScore).toBeGreaterThanOrEqual(0);
    expect(first.body.match.semanticProvider).toBe("local-hash");

    // No raw vectors, no secrets in the response.
    const serialized = JSON.stringify(first.body);
    expect(serialized).not.toMatch(/embedding|vector|sk-|Bearer|API_KEY/i);

    await request(app).post(`/api/jobs/${strongId}/match`).set(h).send({ mode: "hybrid" }).expect(200);
    const rows = await prisma.jobMatch.findMany({ where: { userId: U("hybrid") } });
    expect(rows).toHaveLength(1);
    expect(rows[0].matchMode).toBe("hybrid");
    expect(rows[0].semanticScore).not.toBeNull();
  });

  it("semantic mode keeps the designer mismatch LOW", async () => {
    const { h, weakId } = await seedUser("guard");
    const res = await request(app)
      .post(`/api/jobs/${weakId}/match`)
      .set(h)
      .send({ mode: "semantic" })
      .expect(200);
    expect(res.body.match.decision).toBe("LOW_MATCH");
  });

  it("falls back honestly when the embedding backend is misconfigured", async () => {
    const { h, strongId } = await seedUser("fallback");
    process.env.EMBEDDING_PROVIDER = "openai"; // no AI_API_KEY -> misconfigured
    const res = await request(app)
      .post(`/api/jobs/${strongId}/match`)
      .set(h)
      .send({ mode: "hybrid" })
      .expect(200);
    expect(res.body.match.matchMode).toBe("deterministic_fallback");
    expect(res.body.match.semanticScore).toBeUndefined();
    expect(res.body.match.warnings.join(" ")).toMatch(/deterministic scoring instead/);
    expect(res.body.match.overallScore).toBe(100); // deterministic facts intact
  });

  it("rejects invalid modes and still isolates users", async () => {
    const { h, strongId } = await seedUser("iso");
    await request(app)
      .post(`/api/jobs/${strongId}/match`)
      .set(h)
      .send({ mode: "gpt-magic" })
      .expect(400);
    await request(app).post("/api/matches/run").set(h).send({ limit: 5, mode: "nope" }).expect(400);
    await request(app).post(`/api/jobs/${strongId}/match`).set(h).send({ mode: "hybrid" }).expect(200);
    await request(app).get(`/api/jobs/${strongId}/match`).set(H("stranger")).expect(404);
    const list = await request(app).get("/api/matches").set(H("stranger")).expect(200);
    expect(list.body.matches).toHaveLength(0);
  });

  it("batch run honors the mode and reuses the cache", async () => {
    const { h } = await seedUser("batch");
    const run = await request(app)
      .post("/api/matches/run")
      .set(h)
      .send({ limit: 10, mode: "hybrid" })
      .expect(200);
    expect(run.body.matched).toBe(2);
    expect(run.body.matches.every((m: { matchMode: string }) => m.matchMode === "hybrid")).toBe(true);
    // Second identical run: same rows, no duplicates.
    await request(app).post("/api/matches/run").set(h).send({ limit: 10, mode: "hybrid" }).expect(200);
    const rows = await prisma.jobMatch.findMany({ where: { userId: U("batch") } });
    expect(rows).toHaveLength(2);
  });

  it("service-level batch works without HTTP", async () => {
    const { h } = await seedUser("svc");
    const jobs = await prisma.job.findMany({ where: { userId: U("svc") } });
    expect(jobs.length).toBe(2);
    const { matched } = await runMatches(U("svc"), 10, "hybrid");
    expect(matched).toBe(2);
    const single = await runMatchForJob(U("svc"), jobs[0].id, "semantic");
    expect(single.matchMode).toBe("semantic");
  });
});
