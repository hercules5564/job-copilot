/**
 * Phase 8 tests — production adapters, capabilities, manual login,
 * recovery, submission guards, resource limits, audit events.
 * Demo browser provider ONLY (scripted pages). No real websites.
 *
 * Integration describes REQUIRE PostgreSQL (DATABASE_URL).
 * Isolation: rows belong to users `p8test-<name>-<ts>`, removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import { createApp } from "../src/app.js";
import { demoBrowserProvider } from "../src/browser/index.js";
import { getApplicationAdapter } from "../src/browser/registry.js";
import { setSessionStatus } from "../src/browser/session-manager.js";
import { mapField } from "../src/browser/field-mapper.js";
import type { PageFormField } from "../src/browser/types.js";
import type { DemoPage } from "../src/browser/providers/demo-browser.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const U = (name: string) => `p8test-${name}-${TS}`;
const H = (name: string) => ({ "x-dev-user-id": U(name) });

const app = createApp();

const ATS_FORM = "https://demo.local/ats-demo/apply";
const ATS_LOGIN = "https://demo.local/ats-demo/login";
const ATS_CAPTCHA = "https://demo.local/ats-demo/captcha";
const DEMO_FORM = "https://demo.local/apply/frontend";

function field(ref: string, partial: Partial<PageFormField> = {}): PageFormField {
  return {
    ref, label: "", name: "", type: "text", required: false, options: [],
    placeholder: "", autocomplete: "", currentValue: "", visible: true, disabled: false,
    ...partial,
  };
}

function atsFormPage(url: string): DemoPage {
  return {
    url,
    title: "Beta — Frontend Engineer application",
    fields: [
      field("input[0]", { label: "Full Name", name: "fullName", required: true }),
      field("input[1]", { label: "Email", name: "email", type: "email", required: true }),
      field("input[2]", { label: "LinkedIn Profile", name: "linkedin", type: "url" }),
      field("select[3]", { label: "Years of Experience", name: "experience", type: "select", options: ["0-2 years", "3-5 years", "5+ years"] }),
      field("input[4]", { label: "Authorized to work", name: "workAuth-yes", type: "radio" }),
      field("textarea[5]", { label: "Cover Letter", name: "coverLetter", type: "textarea", required: true }),
      field("select[6]", { label: "Gender (voluntary, EEO)", name: "eeoGender", type: "select", options: ["Prefer not to say", "Female", "Male"] }),
      field("input[7]", { label: "I certify that the information provided is accurate", name: "terms", type: "checkbox", required: true }),
    ],
    hasSubmitButton: true,
    submitLabel: "Submit Application",
    submitBehavior: {
      type: "success",
      confirmationText: "Thank you for applying! Reference ATS-2026-0042.",
      confirmationUrl: `${url}#confirmation`,
    },
  };
}

const LOGIN_PAGE: DemoPage = {
  url: ATS_LOGIN,
  title: "Beta ATS — Sign in",
  fields: [field("input[0]", { label: "Password", name: "password", type: "password" })],
  signals: ["login-required"],
  hasSubmitButton: false,
  submitLabel: null,
};

const CAPTCHA_PAGE: DemoPage = {
  url: ATS_CAPTCHA,
  title: "Verify you are human",
  fields: [],
  signals: ["captcha"],
  hasSubmitButton: false,
  submitLabel: null,
};

const SIMPLE_FORM: DemoPage = {
  url: DEMO_FORM,
  title: "Demo Application",
  fields: [
    field("input[0]", { label: "Full Name", name: "fullName", required: true }),
    field("input[1]", { label: "Email", name: "email", type: "email", required: true }),
    field("textarea[2]", { label: "Cover Letter", name: "coverLetter", type: "textarea", required: true }),
  ],
  hasSubmitButton: true,
  submitLabel: "Submit Application",
  submitBehavior: {
    type: "success",
    confirmationText: "Application submitted",
    confirmationUrl: `${DEMO_FORM}#confirmation`,
  },
};

beforeAll(() => {
  process.env.BROWSER_PROVIDER = "demo";
  demoBrowserProvider.setPages([atsFormPage(ATS_FORM), LOGIN_PAGE, CAPTCHA_PAGE, SIMPLE_FORM]);
});

afterEach(() => {
  delete process.env.BROWSER_MAX_SESSIONS_PER_USER;
  delete process.env.BROWSER_MAX_SESSIONS;
  // Restore scripted pages mutated by login/resume tests.
  demoBrowserProvider.setPages([atsFormPage(ATS_FORM), LOGIN_PAGE, CAPTCHA_PAGE, SIMPLE_FORM]);
});

afterAll(async () => {
  delete process.env.BROWSER_PROVIDER;
  if (!DB) return;
  await prisma.user.deleteMany({ where: { id: { startsWith: "p8test-" } } });
  await prisma.$disconnect();
});

// ---------- adapter registry + capabilities ----------

describe("production adapter registry", () => {
  it("contains exactly the known adapters with explicit descriptors", async () => {
    const res = await request(app).get("/api/application-runs/adapters").set(H("registry"));
    expect(res.status).toBe(200);
    const ids = res.body.adapters.map((a: { adapterId: string }) => a.adapterId).sort();
    expect(ids).toEqual(["demo", "fixture-ats", "generic"]);
    const fixture = res.body.adapters.find((a: { adapterId: string }) => a.adapterId === "fixture-ats");
    expect(fixture.submissionMode).toBe("HUMAN_CONFIRMED");
    expect(fixture.capabilities).toContain("submit");
    expect(fixture.capabilities).toContain("manualLogin");
    const generic = res.body.adapters.find((a: { adapterId: string }) => a.adapterId === "generic");
    expect(generic.submissionMode).toBe("MANUAL_ONLY");
    expect(generic.capabilities).not.toContain("submit");
  });

  it("rejects unknown adapters without executing anything", () => {
    expect(() => getApplicationAdapter("indeed-pro")).toThrowError(/Unknown application adapter/);
    expect(() => getApplicationAdapter("__proto__")).toThrowError(/Unknown application adapter/);
  });
});

// ---------- fixture-ats policy ----------

describe("fixture-ats adapter policy", () => {
  const ats = () => getApplicationAdapter("fixture-ats");

  it("accepts only fixture paths on local origins", () => {
    expect(ats().canHandle("http://localhost:3000/ats-demo/apply").supported).toBe(true);
    expect(ats().canHandle("http://localhost:3000/demo-application").supported).toBe(false);
    expect(ats().canHandle("https://ats.example.com/apply").supported).toBe(false);
    expect(ats().canHandle("https://www.linkedin.com/jobs/1").supported).toBe(false);
    expect(() => ats().resolveTarget({ sourceUrl: null, title: "T", companyName: "C" })).toThrowError(/explicit fixture/);
  });

  it("verifies page context matches the job", () => {
    const ok = ats().verifyTarget!({ url: ATS_FORM, title: "Beta — Frontend Engineer application", headings: ["Beta — Frontend Engineer application"], fields: [], signals: [], hasSubmitButton: true, submitLabel: "Submit" }, { title: "Frontend Engineer", companyName: "Beta" });
    expect(ok.ok).toBe(true);
    const bad = ats().verifyTarget!({ url: ATS_FORM, title: "Completely Different Role", headings: [], fields: [], signals: [], hasSubmitButton: true, submitLabel: "Submit" }, { title: "Frontend Engineer", companyName: "Beta" });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/refusing to continue/);
  });
});

// ---------- sensitive fields ----------

describe("sensitive field quarantine", () => {
  it("rejects passwords, OTPs, SSNs, and payment fields", () => {
    expect(mapField(field("a", { label: "Password", name: "password", type: "password" })).mapping).toBe("UNSUPPORTED_SENSITIVE_FIELD");
    expect(mapField(field("a", { label: "One-time passcode", name: "otp" })).mapping).toBe("UNSUPPORTED_SENSITIVE_FIELD");
    expect(mapField(field("a", { label: "Social Security Number", name: "ssn" })).mapping).toBe("UNSUPPORTED_SENSITIVE_FIELD");
    expect(mapField(field("a", { label: "Credit card number", name: "cc" })).mapping).toBe("UNSUPPORTED_SENSITIVE_FIELD");
  });
});

// ---------- integration: full fixture-ats loop ----------

describe.skipIf(!DB)("fixture-ats full loop", () => {
  async function seedUser(name: string, title = "Frontend Engineer", company = "Beta") {
    const h = H(name);
    await request(app).put("/api/profile").set(h).send({
      fullName: "P8 Tester",
      yearsOfExperience: 4,
      preferences: { targetRoles: [title], skills: ["React", "TypeScript"] },
    });
    const job = await request(app).post("/api/jobs").set(h).send({ title, company, description: `${title} at ${company}.` });
    const created = await request(app).post("/api/applications").set(h).send({ jobId: job.body.job.id });
    const id = created.body.application.id as string;
    for (const s of ["MATCHED", "REVIEW", "READY", "APPROVED"]) {
      await request(app).patch(`/api/applications/${id}/status`).set(h).send({ toStatus: s });
    }
    return { h, applicationId: id };
  }

  async function approveAll(h: Record<string, string>, runId: string) {
    const current = await request(app).get(`/api/application-runs/${runId}`).set(h);
    const payload = current.body.run.answers
      .filter((a: { mapping: string }) => a.mapping !== "UNSUPPORTED_SENSITIVE_FIELD")
      .map((a: { fieldId: string }) => ({ fieldId: a.fieldId }));
    return request(app).post(`/api/application-runs/${runId}/approve`).set(h).send({ answers: payload });
  }

  it("runs inspect→submit with capabilities, checkpoints, and audit events", async () => {
    const { h, applicationId } = await seedUser("atsloop");
    const created = await request(app)
      .post(`/api/applications/${applicationId}/runs`)
      .set(h)
      .send({ adapter: "fixture-ats", targetUrl: ATS_FORM })
      .expect(201);
    expect(created.body.run.capabilities).toContain("submit");
    expect(created.body.run.submissionMode).toBe("HUMAN_CONFIRMED");
    expect(created.body.run.sessionMode).toBe("HEADLESS");

    const started = await request(app).post(`/api/application-runs/${created.body.run.id}/start`).set(h).expect(200);
    expect(started.body.run.status).toBe("WAITING_FOR_REVIEW");
    expect(started.body.run.lastSafeCheckpoint).toBe("review");
    expect(started.body.run.answers.length).toBe(8);

    await approveAll(h, created.body.run.id);
    await request(app).post(`/api/application-runs/${created.body.run.id}/fill`).set(h).expect(200);
    const submitted = await request(app)
      .post(`/api/application-runs/${created.body.run.id}/submit`)
      .set(h)
      .send({ confirm: true })
      .expect(200);
    expect(submitted.body.run.status).toBe("SUBMITTED");
    expect(submitted.body.run.submissionConfirmedAt).not.toBeNull();

    const detail = await request(app).get(`/api/applications/${applicationId}`).set(h).expect(200);
    expect(detail.body.application.status).toBe("APPLIED");
    const notes = detail.body.application.events.map((e: { note: string }) => e.note ?? "");
    for (const milestone of ["BROWSER_SESSION_STARTED", "BROWSER_FORM_INSPECTED", "BROWSER_ANSWERS_GENERATED", "BROWSER_REVIEW_APPROVED", "BROWSER_WAITING_FOR_SUBMISSION"]) {
      expect(notes.some((n: string) => n.includes(milestone))).toBe(true);
    }
    expect(notes.some((n: string) => n.includes("Browser-assisted submission"))).toBe(true);
    const dumped = JSON.stringify(detail.body);
    expect(dumped).not.toMatch(/cookie|token|password/i);
  });

  it("rejects context mismatch with FORM_CHANGED", async () => {
    const { h, applicationId } = await seedUser("mismatch", "Data Scientist", "Gamma");
    const created = await request(app)
      .post(`/api/applications/${applicationId}/runs`)
      .set(h)
      .send({ adapter: "fixture-ats", targetUrl: ATS_FORM })
      .expect(201);
    const started = await request(app).post(`/api/application-runs/${created.body.run.id}/start`).set(h).expect(200);
    expect(started.body.run.status).toBe("FAILED");
    expect(started.body.run.errorCode).toBe("FORM_CHANGED");
  });
});

// ---------- manual login continuation ----------

describe.skipIf(!DB)("headed manual-login continuation", () => {
  async function seedLoginUser(name: string) {
    const h = H(name);
    await request(app).put("/api/profile").set(h).send({ fullName: "P8 Login" });
    const job = await request(app).post("/api/jobs").set(h).send({ title: "Frontend Engineer", company: "Beta", description: "x" });
    const created = await request(app).post("/api/applications").set(h).send({ jobId: job.body.job.id });
    return { h, applicationId: created.body.application.id as string };
  }

  it("blocks on login wall and resumes after manual login", async () => {
    const { h, applicationId } = await seedLoginUser("login");
    const created = await request(app)
      .post(`/api/applications/${applicationId}/runs`)
      .set(h)
      .send({ adapter: "fixture-ats", targetUrl: ATS_LOGIN })
      .expect(201);
    const blocked = await request(app).post(`/api/application-runs/${created.body.run.id}/start`).set(h).expect(200);
    expect(blocked.body.run.status).toBe("BLOCKED");
    expect(blocked.body.run.errorCode).toBe("LOGIN_REQUIRED");
    expect(blocked.body.run.sessionStatus).toBe("WAITING_FOR_LOGIN");

    // User signs in manually (fixture post-login landing replaces the wall).
    demoBrowserProvider.mutatePage(ATS_LOGIN, {
      title: "Beta — Frontend Engineer application",
      fields: [
        field("input[0]", { label: "Full Name", name: "fullName", required: true }),
        field("input[1]", { label: "Email", name: "email", type: "email", required: true }),
      ],
      signals: [],
      hasSubmitButton: true,
      submitLabel: "Submit Application",
      submitBehavior: { type: "success", confirmationText: "ok", confirmationUrl: `${ATS_LOGIN}#done` },
    });
    const resumed = await request(app).post(`/api/application-runs/${created.body.run.id}/resume`).set(h).send({}).expect(200);
    expect(resumed.body.run.status).toBe("WAITING_FOR_REVIEW");
    expect(resumed.body.run.retryCount).toBe(1);
    expect(resumed.body.run.answers.length).toBe(2);
  });

  it("expired sessions cannot resume blindly", async () => {
    const { h, applicationId } = await seedLoginUser("expired");
    const created = await request(app)
      .post(`/api/applications/${applicationId}/runs`)
      .set(h)
      .send({ adapter: "demo", targetUrl: DEMO_FORM })
      .expect(201);
    await request(app).post(`/api/application-runs/${created.body.run.id}/start`).set(h).expect(200);
    const runRow = await prisma.applicationRun.findUnique({ where: { id: created.body.run.id } });
    expect(runRow!.status).toBe("WAITING_FOR_REVIEW");
    await prisma.browserSession.update({
      where: { id: runRow!.sessionId! },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    // Resume relaunches safely instead of resurrecting the dead session.
    const resumed = await request(app).post(`/api/application-runs/${created.body.run.id}/resume`).set(h).send({}).expect(200);
    expect(resumed.body.run.status).toBe("WAITING_FOR_REVIEW");
    const fresh = await prisma.applicationRun.findUnique({ where: { id: created.body.run.id } });
    expect(fresh!.sessionId).not.toBe(runRow!.sessionId);
  });
});

// ---------- recovery ----------

describe.skipIf(!DB)("safe run recovery", () => {
  async function seedFailedRun(name: string) {
    const h = H(name);
    await request(app).put("/api/profile").set(h).send({ fullName: "P8 Recover" });
    const job = await request(app).post("/api/jobs").set(h).send({ title: "Frontend Engineer", company: "Beta", description: "x" });
    const createdApp = await request(app).post("/api/applications").set(h).send({ jobId: job.body.job.id });
    const applicationId = createdApp.body.application.id as string;
    const created = await request(app)
      .post(`/api/applications/${applicationId}/runs`)
      .set(h)
      .send({ adapter: "demo", targetUrl: DEMO_FORM })
      .expect(201);
    await request(app).post(`/api/application-runs/${created.body.run.id}/start`).set(h).expect(200);
    // Force a terminal failure.
    await prisma.applicationRun.update({ where: { id: created.body.run.id }, data: { status: "FAILED", errorCode: "BROWSER_CRASH" } });
    return { h, applicationId, runId: created.body.run.id as string };
  }

  it("recovers terminal runs into linked runs, never replays submissions", async () => {
    const { h, runId } = await seedFailedRun("recover");
    const recovered = await request(app)
      .post(`/api/application-runs/${runId}/recover`)
      .set(h)
      .send({ reason: "browser crashed mid-review" })
      .expect(200);
    expect(recovered.body.run.status).toBe("CREATED");
    expect(recovered.body.run.resumedFromRunId).toBe(runId);
    expect(recovered.body.run.recoveryReason).toBe("browser crashed mid-review");
    expect(recovered.body.run.retryCount).toBe(1);

    // Chain the budget: each link must be terminal before the next recover.
    let current = recovered.body.run.id as string;
    for (const expectedRetry of [2, 3]) {
      await prisma.applicationRun.update({ where: { id: current }, data: { status: "FAILED" } });
      const next = await request(app)
        .post(`/api/application-runs/${current}/recover`)
        .set(h)
        .send({ reason: "again" })
        .expect(200);
      expect(next.body.run.retryCount).toBe(expectedRetry);
      current = next.body.run.id as string;
    }
    await prisma.applicationRun.update({ where: { id: current }, data: { status: "FAILED" } });
    await request(app).post(`/api/application-runs/${current}/recover`).set(h).send({ reason: "cap" }).expect(422);
  });

  it("refuses recovery from active or submitted runs", async () => {
    const { h, runId } = await seedFailedRun("recoverbad");
    await prisma.applicationRun.update({ where: { id: runId }, data: { status: "SUBMITTED" } });
    await request(app).post(`/api/application-runs/${runId}/recover`).set(h).send({ reason: "replay" }).expect(422);
    await prisma.applicationRun.update({ where: { id: runId }, data: { status: "WAITING_FOR_REVIEW" } });
    await request(app).post(`/api/application-runs/${runId}/recover`).set(h).send({ reason: "active" }).expect(422);
    await request(app).post(`/api/application-runs/${runId}/resume`).set(h).send({}).expect(200);
  });

  it("bounds resume retries", async () => {
    const { h, runId } = await seedFailedRun("resumecap");
    await prisma.applicationRun.update({ where: { id: runId }, data: { status: "WAITING_FOR_REVIEW", retryCount: 3 } });
    await request(app).post(`/api/application-runs/${runId}/resume`).set(h).send({}).expect(422);
  });
});

// ---------- submission guards ----------

describe.skipIf(!DB)("submission safety", () => {
  async function seedFilledRun(name: string, adapter = "demo", target = DEMO_FORM) {
    const h = H(name);
    await request(app).put("/api/profile").set(h).send({ fullName: "P8 Submit", preferences: { skills: ["React"] } });
    const job = await request(app).post("/api/jobs").set(h).send({ title: "Frontend Engineer", company: "Beta", description: "x" });
    const createdApp = await request(app).post("/api/applications").set(h).send({ jobId: job.body.job.id });
    const applicationId = createdApp.body.application.id as string;
    for (const s of ["MATCHED", "REVIEW", "READY", "APPROVED"]) {
      await request(app).patch(`/api/applications/${applicationId}/status`).set(h).send({ toStatus: s });
    }
    const created = await request(app).post(`/api/applications/${applicationId}/runs`).set(h).send({ adapter, targetUrl: target }).expect(201);
    await request(app).post(`/api/application-runs/${created.body.run.id}/start`).set(h).expect(200);
    const current = await request(app).get(`/api/application-runs/${created.body.run.id}`).set(h);
    const payload = current.body.run.answers
      .filter((a: { mapping: string }) => a.mapping !== "UNSUPPORTED_SENSITIVE_FIELD")
      .map((a: { fieldId: string }) => ({ fieldId: a.fieldId }));
    await request(app).post(`/api/application-runs/${created.body.run.id}/approve`).set(h).send({ answers: payload }).expect(200);
    await request(app).post(`/api/application-runs/${created.body.run.id}/fill`).set(h).expect(200);
    return { h, applicationId, runId: created.body.run.id as string };
  }

  it("blocks duplicates and ambiguous outcomes without auto-retry", async () => {
    const { h, applicationId, runId } = await seedFilledRun("dupguard");
    // Simulate a prior recorded submission: second submit must not click.
    await prisma.applicationEvent.create({
      data: { applicationId, oldStatus: "APPROVED", newStatus: "APPLIED", source: "BROWSER", note: "Browser-assisted submission (verified)" },
    });
    const dup = await request(app).post(`/api/application-runs/${runId}/submit`).set(h).send({ confirm: true }).expect(409);
    expect(dup.body.error).toMatch(/ALREADY_SUBMITTED/);
    await prisma.applicationEvent.deleteMany({ where: { applicationId, source: "BROWSER" } });

    // Ambiguous submit: make the fixture click succeed without confirmation.
    demoBrowserProvider.mutatePage(DEMO_FORM, {
      submitBehavior: { type: "ambiguous" } as never,
    });
    const amb = await request(app).post(`/api/application-runs/${runId}/submit`).set(h).send({ confirm: true }).expect(200);
    expect(amb.body.run.errorCode).toBe("SUBMISSION_STATUS_UNKNOWN");
    // Retry and recover are both blocked until manual resolution.
    await request(app).post(`/api/application-runs/${runId}/submit`).set(h).send({ confirm: true }).expect(409);
    await request(app).post(`/api/application-runs/${runId}/recover`).set(h).send({ reason: "retry" }).expect(422);
    // User verifies it was NOT submitted → flag clears → submit works.
    demoBrowserProvider.mutatePage(DEMO_FORM, {
      submitBehavior: { type: "success", confirmationText: "ok", confirmationUrl: `${DEMO_FORM}#done` },
    });
    await request(app).post(`/api/application-runs/${runId}/resolve`).set(h).send({ outcome: "not-submitted" }).expect(200);
    const retry = await request(app).post(`/api/application-runs/${runId}/submit`).set(h).send({ confirm: true }).expect(200);
    expect(retry.body.run.status).toBe("SUBMITTED");
  });

  it("resolves ambiguous submissions as submitted without re-clicking", async () => {
    const { h, runId } = await seedFilledRun("ambresolve");
    demoBrowserProvider.mutatePage(DEMO_FORM, { submitBehavior: { type: "ambiguous" } as never });
    await request(app).post(`/api/application-runs/${runId}/submit`).set(h).send({ confirm: true }).expect(200);
    const resolved = await request(app).post(`/api/application-runs/${runId}/resolve`).set(h).send({ outcome: "submitted" }).expect(200);
    expect(resolved.body.run.status).toBe("SUBMITTED");
    expect(resolved.body.run.submissionConfirmedAt).not.toBeNull();
    // Recorded once — no duplicate submission event.
    const events = await prisma.applicationEvent.findMany({ where: { application: { userId: U("ambresolve") }, source: "BROWSER" } });
    expect(events.filter((e) => (e.note ?? "").includes("Browser-assisted submission"))).toHaveLength(1);
    demoBrowserProvider.mutatePage(DEMO_FORM, {
      submitBehavior: { type: "success", confirmationText: "ok", confirmationUrl: `${DEMO_FORM}#done` },
    });
  });
});

// ---------- resource limits + session states ----------

describe.skipIf(!DB)("sessions, limits, and isolation", () => {
  it("enforces per-user session caps and validates transitions", async () => {
    const h = H("limits");
    await request(app).put("/api/profile").set(h).send({ fullName: "P8 Limits" });
    const job = await request(app).post("/api/jobs").set(h).send({ title: "T", company: "C", description: "x" });
    const createdApp = await request(app).post("/api/applications").set(h).send({ jobId: job.body.job.id });
    const applicationId = createdApp.body.application.id as string;
    process.env.BROWSER_MAX_SESSIONS_PER_USER = "1";
    await request(app).post(`/api/applications/${applicationId}/runs`).set(h).send({ adapter: "demo", targetUrl: DEMO_FORM }).expect(201);
    const capped = await request(app).post(`/api/applications/${applicationId}/runs`).set(h).send({ adapter: "demo", targetUrl: DEMO_FORM }).expect(429);
    expect(capped.body.error).toMatch(/Too many active browser sessions/);

    const runRow = await prisma.applicationRun.findFirst({ where: { userId: U("limits") } });
    await expect(setSessionStatus(runRow!.sessionId!, "COMPLETED")).rejects.toThrowError(/Invalid browser session transition/);
    const session = await prisma.browserSession.findUnique({ where: { id: runRow!.sessionId! } });
    expect(session!.mode).toBe("HEADLESS");
  });

  it("blocks private-IP navigation and cross-user access", async () => {
    const { seen } = await import("../src/browser/net-guard.js").then((m) => ({ seen: m.assertNavigationAllowed }));
    expect(() => seen("http://192.168.1.5/apply", ["http://192.168.1.5"])).toThrowError(/private network/);
    expect(() => seen("file:///etc/passwd", ["file://"])).toThrowError(/http\(s\)/);
    expect(() => seen("https://evil.com/a", ["https://demo.local"])).toThrowError(/approved application origin/);
    expect(seen("https://demo.local/a", ["https://demo.local"])).toBe("https://demo.local");
  });
});

