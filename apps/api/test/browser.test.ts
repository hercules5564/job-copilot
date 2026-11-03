/**
 * Phase 7 tests — browser automation + human-approved assistance.
 * Demo browser provider ONLY. No real websites, no network, no Playwright
 * launch. (Real Chromium against the local demo page is covered in the
 * live E2E section of the Phase 7 report.)
 *
 * Integration describes REQUIRE PostgreSQL (DATABASE_URL).
 * Isolation: rows belong to users `p7test-<name>-<ts>`, removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import { createApp } from "../src/app.js";
import { demoBrowserProvider } from "../src/browser/index.js";
import {
  getApplicationAdapter,
  getBrowserProvider,
} from "../src/browser/registry.js";
import { mapField } from "../src/browser/field-mapper.js";
import {
  DeterministicAnswerProvider,
  getAnswerProvider,
  selectProjects,
  selectResume,
} from "../src/browser/answers.js";
import type { PageFormField } from "../src/browser/types.js";
import type { DemoPage } from "../src/browser/providers/demo-browser.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const U = (name: string) => `p7test-${name}-${TS}`;
const H = (name: string) => ({ "x-dev-user-id": U(name) });

const app = createApp();
const FORM_URL = "https://demo.local/apply/frontend";
const LOCAL_URL = "http://localhost:3000/demo-application";

function field(ref: string, partial: Partial<PageFormField> = {}): PageFormField {
  return {
    ref,
    label: "",
    name: "",
    type: "text",
    required: false,
    options: [],
    placeholder: "",
    autocomplete: "",
    currentValue: "",
    visible: true,
    disabled: false,
    ...partial,
  };
}

function demoFormPage(url: string, submitBehavior: DemoPage["submitBehavior"] = {
  type: "success",
  confirmationText: "Application submitted. Thank you for applying! Reference DEMO-1.",
  confirmationUrl: `${url}#confirmation`,
}): DemoPage {
  return {
    url,
    title: "Demo Application",
    fields: [
      field("input[0]", { label: "Full Name", name: "fullName", required: true, autocomplete: "name" }),
      field("input[1]", { label: "Email", name: "email", type: "email", required: true, autocomplete: "email" }),
      field("input[2]", { label: "Phone Number", name: "phone", type: "tel" }),
      field("input[3]", { label: "GitHub", name: "github", type: "url" }),
      field("input[4]", { label: "Years of Experience", name: "experience" }),
      field("textarea[5]", { label: "Cover Letter", name: "coverLetter", type: "textarea", required: true }),
      field("select[6]", { label: "Employment Type", name: "employmentType", type: "select", options: ["Full-time", "Part-time", "Contract"] }),
      field("input[7]", { label: "Favorite dinosaur?", name: "dinosaur" }),
      field("input[8]", { label: "Resume", name: "resume", type: "file" }),
      field("input[9]", { label: "Job portal password (do not automate)", name: "portalPassword", type: "password" }),
    ],
    hasSubmitButton: true,
    submitLabel: "Submit Application",
    submitBehavior,
  };
}

beforeAll(() => {
  process.env.BROWSER_PROVIDER = "demo";
  demoBrowserProvider.setPages([
    demoFormPage(FORM_URL),
    demoFormPage(LOCAL_URL),
    {
      url: "https://demo.local/apply/blocked",
      title: "Blocked",
      fields: [],
      signals: ["captcha"],
      hasSubmitButton: false,
      submitLabel: null,
    },
    {
      url: "https://demo.local/apply/invalid",
      title: "Broken form",
      fields: [field("input[0]", { label: "Full Name", name: "fullName", required: true })],
      hasSubmitButton: true,
      submitLabel: "Submit",
      submitBehavior: { type: "validation-error", errors: ["fullName is required"] },
    },
  ]);
});

afterAll(async () => {
  delete process.env.BROWSER_PROVIDER;
  if (!DB) return;
  await prisma.user.deleteMany({ where: { id: { startsWith: "p7test-" } } });
  await prisma.$disconnect();
});

// ---------- registries ----------

describe("browser registries", () => {
  it("resolve demo/playwright providers and demo/generic adapters", () => {
    expect(getBrowserProvider("demo").id).toBe("demo");
    expect(getBrowserProvider("playwright").id).toBe("playwright");
    expect(() => getBrowserProvider("stealth")).toThrowError(/Unknown browser provider/);
    expect(getApplicationAdapter("demo").id).toBe("demo");
    expect(getApplicationAdapter("generic").id).toBe("generic");
    expect(() => getApplicationAdapter("linkedin-pro")).toThrowError(/Unknown application adapter/);
  });
});

// ---------- adapter URL policy ----------

describe("adapter URL policy", () => {
  it("demo handles local targets only", () => {
    expect(getApplicationAdapter("demo").canHandle("https://demo.local/apply/x").supported).toBe(true);
    expect(getApplicationAdapter("demo").canHandle("http://localhost:3000/demo-application").supported).toBe(true);
    expect(getApplicationAdapter("demo").canHandle("https://evil.com/apply").supported).toBe(false);
  });

  it("generic blocks LinkedIn/X and requires http(s)", () => {
    const generic = getApplicationAdapter("generic");
    expect(generic.canHandle("https://boards.example.com/jobs/1").supported).toBe(true);
    expect(generic.canHandle("https://www.linkedin.com/jobs/view/1").supported).toBe(false);
    expect(generic.canHandle("https://x.com/jobs/1").supported).toBe(false);
    expect(generic.canHandle("ftp://files.example.com/a").supported).toBe(false);
    expect(generic.supportsSubmit()).toBe(false);
    expect(getApplicationAdapter("demo").supportsSubmit()).toBe(true);
  });

  it("generic requires a usable target (no open overrides)", () => {
    const generic = getApplicationAdapter("generic");
    expect(() => generic.resolveTarget({ sourceUrl: null, title: "T", companyName: "C" })).toThrowError(/no application URL/);
    expect(() =>
      generic.resolveTarget({ sourceUrl: null, title: "T", companyName: "C" }, "https://evil.com/apply"),
    ).toThrowError(/only accepted for local demo targets/);
    expect(() =>
      generic.resolveTarget({ sourceUrl: "https://www.linkedin.com/jobs/1", title: "T", companyName: "C" }),
    ).toThrowError(/not supported/);
  });
});

// ---------- field mapping ----------

describe("deterministic field mapping", () => {
  const cases: [string, Partial<PageFormField>, string][] = [
    ["email", { label: "Email", name: "email", type: "email" }, "candidate.email"],
    ["full name", { label: "Full Name", name: "fullName" }, "candidate.fullName"],
    ["phone", { label: "Phone Number", name: "phone", type: "tel" }, "candidate.phone"],
    ["github", { label: "GitHub", name: "github", type: "url" }, "candidate.githubUrl"],
    ["experience", { label: "Years of Experience", name: "experience" }, "candidate.experience"],
    ["cover letter", { label: "Cover Letter", name: "coverLetter", type: "textarea" }, "candidate.coverLetter"],
    ["why role", { label: "Why do you want this role?", name: "whyRole", type: "textarea" }, "candidate.coverLetter"],
    ["select", { label: "Employment Type", name: "employmentType", type: "select" }, "UNKNOWN"],
    ["unknown", { label: "Favorite dinosaur?", name: "dinosaur" }, "UNKNOWN"],
    ["password", { label: "Portal password", name: "portalPassword", type: "password" }, "UNSUPPORTED_SENSITIVE_FIELD"],
    ["otp", { label: "Verification code", name: "otp" }, "UNSUPPORTED_SENSITIVE_FIELD"],
    ["company name excluded", { label: "Company name", name: "company" }, "UNKNOWN"],
  ];
  for (const [name, partial, expected] of cases) {
    it(`maps ${name}`, () => {
      expect(mapField(field("input[0]", partial)).mapping).toBe(expected);
    });
  }
});

// ---------- answers ----------

describe("deterministic answers (no hallucination)", () => {
  const provider = new DeterministicAnswerProvider();
  const candidate = {
    fullName: "P7 Tester",
    email: "p7@example.com",
    yearsOfExperience: 4,
    education: ["BTech CS"],
    skills: ["React", "TypeScript"],
    preferredLocations: ["Remote"],
    projects: [
      { id: "p1", name: "HireHub", description: "Job board in React and Node.", technologies: ["React", "Node.js"], role: "Full Stack Developer", githubUrl: "https://github.com/p7/hirehub", liveUrl: "https://hirehub.dev" },
    ],
    resumes: [{ id: "r1", name: "Backend Resume", targetRoles: ["Backend Engineer"], parsedText: null }],
  };
  const job = { title: "Backend Engineer", companyName: "Acme", description: "Backend role with Node and React." };

  it("resolves factual fields from candidate data", () => {
    expect(provider.resolve("candidate.fullName", candidate, job)).toMatchObject({ value: "P7 Tester", source: "profile", needsInput: false });
    expect(provider.resolve("candidate.email", candidate, job).value).toBe("p7@example.com");
    expect(provider.resolve("candidate.githubUrl", candidate, job)).toMatchObject({ value: "https://github.com/p7/hirehub", needsInput: false });
    const cover = provider.resolve("candidate.coverLetter", candidate, job);
    expect(cover.value).toContain("Backend Engineer");
    expect(cover.value).toContain("Acme");
  });

  it("returns NEEDS_USER_INPUT instead of inventing facts", () => {
    expect(provider.resolve("candidate.phone", candidate, job).needsInput).toBe(true);
    expect(provider.resolve("candidate.linkedinUrl", candidate, job).needsInput).toBe(true);
    const empty = { ...candidate, fullName: null, skills: [], yearsOfExperience: null, education: [], projects: [], resumes: [] };
    expect(provider.resolve("candidate.fullName", empty, job)).toMatchObject({ value: "", needsInput: true });
    expect(provider.resolve("candidate.skills", empty, job).needsInput).toBe(true);
    expect(getAnswerProvider().id).toBe("deterministic");
    expect(() => getAnswerProvider("llm")).toThrowError(/Unknown answer provider/);
  });

  it("selects relevant projects and resumes with reasons", () => {
    const picked = selectProjects(candidate, job, 2);
    expect(picked[0].project.id).toBe("p1");
    expect(picked[0].reason).toMatch(/React/);
    const resume = selectResume(candidate, job);
    expect(resume?.resume.id).toBe("r1");
    expect(resume?.reason).toBeTruthy();
    expect(selectResume({ ...candidate, resumes: [] }, job)).toBeNull();
  });
});

// ---------- run lifecycle (demo provider, scripted pages) ----------

describe.skipIf(!DB)("application run lifecycle", () => {
  async function seedUser(name: string, toStatus = "APPROVED") {
    const h = H(name);
    await request(app).put("/api/profile").set(h).send({
      fullName: "P7 Tester",
      yearsOfExperience: 4,
      education: ["BTech CS"],
      preferences: {
        targetRoles: ["Backend Engineer"],
        skills: ["React", "TypeScript", "Node.js"],
        preferredLocations: ["Remote"],
        workMode: "REMOTE",
      },
    });
    await request(app).post("/api/projects").set(h).send({
      name: "HireHub",
      description: "Job board in React and Node.",
      technologies: ["React", "Node.js"],
      githubUrl: "https://github.com/p7/hirehub",
      liveUrl: "https://hirehub.dev",
    });
    await request(app).post("/api/resumes").set(h).send({ name: "Backend Resume", targetRoles: ["Backend Engineer"] });
    const job = await request(app).post("/api/jobs").set(h).send({
      title: "Backend Engineer",
      company: "Acme",
      description: "Backend role with Node and React.",
    });
    const created = await request(app).post("/api/applications").set(h).send({ jobId: job.body.job.id });
    const id = created.body.application.id as string;
    const path = ["MATCHED", "REVIEW", "READY", "APPROVED"];
    for (const s of toStatus === "APPROVED" ? path : []) {
      await request(app).patch(`/api/applications/${id}/status`).set(h).send({ toStatus: s });
    }
    return { h, applicationId: id, jobId: job.body.job.id as string };
  }

  async function approveAll(h: Record<string, string>, runId: string, extraEdits: Record<string, string> = {}) {
    const current = await request(app).get(`/api/application-runs/${runId}`).set(h);
    const payload = current.body.run.answers
      .filter((a: { mapping: string }) => a.mapping !== "UNSUPPORTED_SENSITIVE_FIELD")
      .map((a: { fieldId: string; proposedValue: string }) => ({
        fieldId: a.fieldId,
        ...(extraEdits[a.fieldId] !== undefined ? { value: extraEdits[a.fieldId] } : {}),
      }));
    return request(app).post(`/api/application-runs/${runId}/approve`).set(h).send({ answers: payload });
  }

  it("runs the full loop to SUBMITTED with events and transitions", async () => {
    const { h, applicationId } = await seedUser("loop");
    const created = await request(app)
      .post(`/api/applications/${applicationId}/runs`)
      .set(h)
      .send({ adapter: "demo", targetUrl: FORM_URL })
      .expect(201);
    expect(created.body.run.status).toBe("CREATED");

    // Approval boundary: fill before review is rejected.
    await request(app).post(`/api/application-runs/${created.body.run.id}/fill`).set(h).expect(422);
    await request(app).post(`/api/application-runs/${created.body.run.id}/submit`).set(h).send({ confirm: true }).expect(422);

    const started = await request(app).post(`/api/application-runs/${created.body.run.id}/start`).set(h).expect(200);
    expect(started.body.run.status).toBe("WAITING_FOR_REVIEW");
    expect(started.body.run.answers.length).toBeGreaterThan(5);
    const password = started.body.run.answers.find((a: { mapping: string }) => a.mapping === "UNSUPPORTED_SENSITIVE_FIELD");
    expect(password).toBeTruthy();
    const email = started.body.run.answers.find((a: { mapping: string }) => a.mapping === "candidate.email");
    expect(email.proposedValue).toBeTruthy();

    // Sensitive fields cannot be approved.
    await request(app)
      .post(`/api/application-runs/${created.body.run.id}/approve`)
      .set(h)
      .send({ answers: [{ fieldId: password.fieldId }] })
      .expect(422);

    const approved = await approveAll(h, created.body.run.id, { "select[6]": "Full-time" });
    expect(approved.body.run.status).toBe("READY_TO_FILL");

    const filled = await request(app).post(`/api/application-runs/${created.body.run.id}/fill`).set(h).expect(200);
    expect(filled.body.run.status).toBe("WAITING_FOR_SUBMISSION");
    expect(filled.body.run.filledFields).toContain("input[0]");
    expect(filled.body.run.filledFields).not.toContain("input[9]"); // password never filled
    expect(filled.body.run.filledFields).not.toContain("input[8]"); // resume stays manual

    // Submit requires explicit confirmation payload.
    await request(app).post(`/api/application-runs/${created.body.run.id}/submit`).set(h).send({}).expect(400);
    const submitted = await request(app)
      .post(`/api/application-runs/${created.body.run.id}/submit`)
      .set(h)
      .send({ confirm: true })
      .expect(200);
    expect(submitted.body.run.status).toBe("SUBMITTED");

    const detail = await request(app).get(`/api/applications/${applicationId}`).set(h).expect(200);
    expect(detail.body.application.status).toBe("APPLIED");
    const browserEvents = detail.body.application.events.filter((e: { source: string }) => e.source === "BROWSER");
    // Phase 8 adds milestone audit events; exactly one records the submission.
    const submissions = browserEvents.filter((e: { note: string }) => (e.note ?? "").includes("Browser-assisted submission"));
    expect(submissions).toHaveLength(1);
    expect(submissions[0].newStatus).toBe("APPLIED");
    expect(browserEvents.some((e: { note: string }) => (e.note ?? "").includes("BROWSER_SESSION_STARTED"))).toBe(true);

    const history = await request(app).get(`/api/applications/${applicationId}/runs`).set(h).expect(200);
    expect(history.body.runs).toHaveLength(1);
    const dumped = JSON.stringify(history.body);
    // Field refs are opaque (input[9]); names, cookies, and tokens never appear.
    expect(dumped).not.toMatch(/portalPassword|mock-access|cookie|token/i);
  });

  it("stops on validation errors and blocked pages", async () => {
    const { h, applicationId } = await seedUser("blocked");
    const invalid = await request(app)
      .post(`/api/applications/${applicationId}/runs`)
      .set(h)
      .send({ adapter: "demo", targetUrl: "https://demo.local/apply/invalid" })
      .expect(201);
    await request(app).post(`/api/application-runs/${invalid.body.run.id}/start`).set(h).expect(200);
    await approveAll(h, invalid.body.run.id);
    await request(app).post(`/api/application-runs/${invalid.body.run.id}/fill`).set(h).expect(200);
    const submitFail = await request(app)
      .post(`/api/application-runs/${invalid.body.run.id}/submit`)
      .set(h)
      .send({ confirm: true })
      .expect(200);
    expect(submitFail.body.run.status).toBe("FAILED");
    expect(submitFail.body.run.errorCode).toBe("FORM_VALIDATION_ERROR");

    const { applicationId: app2 } = await seedUser("blocked2");
    const h2 = H("blocked2");
    const captcha = await request(app)
      .post(`/api/applications/${app2}/runs`)
      .set(h2)
      .send({ adapter: "demo", targetUrl: "https://demo.local/apply/blocked" })
      .expect(201);
    const started = await request(app).post(`/api/application-runs/${captcha.body.run.id}/start`).set(h2).expect(200);
    expect(started.body.run.status).toBe("BLOCKED");
    expect(started.body.run.errorCode).toBe("CAPTCHA_DETECTED");
  });

  it("generic adapter prepares but never auto-submits", async () => {
    const { h, applicationId } = await seedUser("generic");
    const created = await request(app)
      .post(`/api/applications/${applicationId}/runs`)
      .set(h)
      .send({ adapter: "generic", targetUrl: LOCAL_URL })
      .expect(201);
    await request(app).post(`/api/application-runs/${created.body.run.id}/start`).set(h).expect(200);
    await approveAll(h, created.body.run.id);
    const filled = await request(app).post(`/api/application-runs/${created.body.run.id}/fill`).set(h).expect(200);
    expect(filled.body.run.status).toBe("WAITING_FOR_SUBMISSION");
    const submit = await request(app)
      .post(`/api/application-runs/${created.body.run.id}/submit`)
      .set(h)
      .send({ confirm: true })
      .expect(422);
    expect(submit.body.error).toMatch(/SUBMISSION_UNSUPPORTED/);
    // Run stays submittable-manually; nothing was clicked.
    const info = await request(app).get(`/api/application-runs/${created.body.run.id}`).set(h).expect(200);
    expect(info.body.run.status).toBe("WAITING_FOR_SUBMISSION");
  });

  it("supports cancellation, timeouts, and session expiry", async () => {
    const { h, applicationId } = await seedUser("cancel");
    const created = await request(app)
      .post(`/api/applications/${applicationId}/runs`)
      .set(h)
      .send({ adapter: "demo", targetUrl: FORM_URL })
      .expect(201);
    const cancelled = await request(app).post(`/api/application-runs/${created.body.run.id}/cancel`).set(h).expect(200);
    expect(cancelled.body.run.status).toBe("CANCELLED");
    await request(app).post(`/api/application-runs/${created.body.run.id}/start`).set(h).expect(422);

    // Run timeout: backdate startedAt, then act.
    const { applicationId: app2 } = await seedUser("timeout");
    const hTimeout = H("timeout");
    const r2 = await request(app)
      .post(`/api/applications/${app2}/runs`)
      .set(hTimeout)
      .send({ adapter: "demo", targetUrl: FORM_URL })
      .expect(201);
    await prisma.applicationRun.update({
      where: { id: r2.body.run.id },
      data: { startedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    const timed = await request(app).post(`/api/application-runs/${r2.body.run.id}/start`).set(hTimeout).expect(422);
    expect(timed.body.error).toMatch(/RUN_TIMEOUT/);

    // Idle session expiry.
    const r3 = await request(app)
      .post(`/api/applications/${app2}/runs`)
      .set(hTimeout)
      .send({ adapter: "demo", targetUrl: FORM_URL })
      .expect(201);
    const runRow = await prisma.applicationRun.findUnique({ where: { id: r3.body.run.id } });
    await prisma.browserSession.update({
      where: { id: runRow!.sessionId! },
      data: { lastActivityAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    await request(app).post(`/api/application-runs/${r3.body.run.id}/start`).set(hTimeout).expect(404);
  });

  it("isolates runs per user and validates input", async () => {
    const { h, applicationId } = await seedUser("owner");
    const created = await request(app)
      .post(`/api/applications/${applicationId}/runs`)
      .set(h)
      .send({ adapter: "demo", targetUrl: FORM_URL })
      .expect(201);
    const stranger = H("stranger");
    await request(app).get(`/api/application-runs/${created.body.run.id}`).set(stranger).expect(404);
    await request(app).post(`/api/application-runs/${created.body.run.id}/start`).set(stranger).expect(404);
    await request(app).get(`/api/applications/${applicationId}/runs`).set(stranger).expect(404);
    await request(app)
      .post(`/api/applications/${applicationId}/runs`)
      .set(h)
      .send({ adapter: "linkedin-pro", targetUrl: FORM_URL })
      .expect(400);
    await request(app)
      .post(`/api/applications/${applicationId}/runs`)
      .set(h)
      .send({ adapter: "demo", targetUrl: "https://evil.com/apply" })
      .expect(400);
    await request(app).post(`/api/application-runs/${created.body.run.id}/approve`).set(h).send({ answers: [] }).expect(400);
  });
});
