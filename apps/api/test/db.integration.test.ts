/**
 * Phase 2 integration tests — REQUIRE PostgreSQL (DATABASE_URL).
 * Skipped with a clear message when the database is unavailable; the skip
 * itself is reported by vitest and must be counted as "skipped", never "passed".
 *
 * Isolation: all rows belong to users `p2test-a-<ts>` / `p2test-b-<ts>`,
 * removed in afterAll (cascades clean children).
 */
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import { createApp } from "../src/app.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const USER_A = `p2test-a-${TS}`;
const USER_B = `p2test-b-${TS}`;
const HA = { "x-dev-user-id": USER_A };
const HB = { "x-dev-user-id": USER_B };

const app = createApp();

afterAll(async () => {
  if (!DB) return;
  await prisma.user.deleteMany({
    where: { id: { in: [USER_A, USER_B] } },
  });
  await prisma.$disconnect();
});

describe.skipIf(!DB)("profile CRUD", () => {
  it("creates (PUT), retrieves, updates, deletes", async () => {
    await request(app).get("/api/profile").set(HA).expect(404);

    const put = await request(app)
      .put("/api/profile")
      .set(HA)
      .send({ fullName: "Test User", preferences: { targetRoles: ["Backend"], minSalary: 100000 } });
    expect(put.status).toBe(200);
    expect(put.body.profile.fullName).toBe("Test User");
    expect(put.body.profile.targetRoles).toContain("Backend");

    const get = await request(app).get("/api/profile").set(HA).expect(200);
    expect(get.body.profile.minSalary).toBe(100000);

    const patch = await request(app)
      .put("/api/profile")
      .set(HA)
      .send({ headline: "Engineer", preferences: { workMode: "REMOTE" } });
    expect(patch.body.profile.headline).toBe("Engineer");
    expect(patch.body.profile.workMode).toBe("REMOTE");
    // Untouched fields survive partial update.
    expect(patch.body.profile.fullName).toBe("Test User");

    await request(app).delete("/api/profile").set(HA).expect(200);
    await request(app).get("/api/profile").set(HA).expect(404);
  });

  it("rejects invalid payload", async () => {
    await request(app).put("/api/profile").set(HA).send({ yearsOfExperience: -5 }).expect(400);
  });

  it("rejects cross-user access", async () => {
    await request(app).put("/api/profile").set(HA).send({ fullName: "A" }).expect(200);
    // Profiles are 1:1 per user; B simply has none — and can never see A's.
    await request(app).get("/api/profile").set(HB).expect(404);
    await request(app).delete("/api/profile").set(HA).expect(200);
  });
});

describe.skipIf(!DB)("resume CRUD + versions", () => {
  let resumeId = "";

  it("creates, lists, retrieves, updates (snapshots version), deletes", async () => {
    const created = await request(app)
      .post("/api/resumes")
      .set(HA)
      .send({ name: "Backend Resume", targetRoles: ["Backend"] });
    expect(created.status).toBe(201);
    resumeId = created.body.resume.id;

    const list = await request(app).get("/api/resumes").set(HA).expect(200);
    expect(list.body.resumes.length).toBe(1);

    await request(app).get(`/api/resumes/${resumeId}`).set(HA).expect(200);

    const updated = await request(app)
      .patch(`/api/resumes/${resumeId}`)
      .set(HA)
      .send({ name: "Backend Resume v2" });
    expect(updated.body.resume.name).toBe("Backend Resume v2");

    const versions = await request(app).get(`/api/resumes/${resumeId}/versions`).set(HA).expect(200);
    expect(versions.body.versions.length).toBe(1);
    expect(versions.body.versions[0].content.name).toBe("Backend Resume");

    await request(app).delete(`/api/resumes/${resumeId}`).set(HA).expect(200);
    await request(app).get(`/api/resumes/${resumeId}`).set(HA).expect(404);
  });

  it("rejects invalid payload and cross-user access", async () => {
    await request(app).post("/api/resumes").set(HA).send({}).expect(400);
    const created = await request(app)
      .post("/api/resumes")
      .set(HA)
      .send({ name: "A resume" });
    const id = created.body.resume.id;
    await request(app).get(`/api/resumes/${id}`).set(HB).expect(404);
    await request(app).patch(`/api/resumes/${id}`).set(HB).send({ name: "hijack" }).expect(404);
    await request(app).delete(`/api/resumes/${id}`).set(HB).expect(404);
    // A still owns it untouched.
    const own = await request(app).get(`/api/resumes/${id}`).set(HA).expect(200);
    expect(own.body.resume.name).toBe("A resume");
    await request(app).delete(`/api/resumes/${id}`).set(HA).expect(200);
  });
});

describe.skipIf(!DB)("project CRUD", () => {
  it("creates, retrieves, updates, deletes; rejects bad dates", async () => {
    const created = await request(app)
      .post("/api/projects")
      .set(HA)
      .send({ name: "HireHub", description: "Job board", technologies: ["React"] });
    expect(created.status).toBe(201);
    const id = created.body.project.id;

    await request(app).get(`/api/projects/${id}`).set(HA).expect(200);
    const updated = await request(app)
      .patch(`/api/projects/${id}`)
      .set(HA)
      .send({ achievements: "Shipped v1" });
    expect(updated.body.project.achievements).toBe("Shipped v1");

    await request(app).post("/api/projects").set(HA).send({ name: "x" }).expect(400);
    await request(app)
      .post("/api/projects")
      .set(HA)
      .send({ name: "Bad", description: "d", startDate: "not-a-date" })
      .expect(400);

    await request(app).get(`/api/projects/${id}`).set(HB).expect(404);
    await request(app).delete(`/api/projects/${id}`).set(HB).expect(404);
    await request(app).delete(`/api/projects/${id}`).set(HA).expect(200);
  });
});

describe.skipIf(!DB)("job CRUD + idempotent fingerprint", () => {
  it("creates, dedups identical posts, retrieves, lists, updates, deletes", async () => {
    const payload = { title: "Backend Engineer", company: "Acme", description: "APIs" };
    const first = await request(app).post("/api/jobs").set(HA).send(payload);
    expect(first.status).toBe(201);
    expect(first.body.job.company).toBe("Acme"); // Phase-1 alias preserved
    const id = first.body.job.id;

    const dup = await request(app).post("/api/jobs").set(HA).send(payload);
    expect(dup.status).toBe(200); // idempotent: same fingerprint
    expect(dup.body.job.id).toBe(id);

    const list = await request(app).get("/api/jobs").set(HA).expect(200);
    expect(list.body.jobs.length).toBe(1);

    await request(app).get(`/api/jobs/${id}`).set(HA).expect(200);
    await request(app).get(`/api/jobs/${id}`).set(HB).expect(404);

    const updated = await request(app)
      .patch(`/api/jobs/${id}`)
      .set(HA)
      .send({ location: "Remote" });
    expect(updated.body.job.location).toBe("Remote");

    await request(app).delete(`/api/jobs/${id}`).set(HB).expect(404);
    await request(app).delete(`/api/jobs/${id}`).set(HA).expect(200);
  });
});

describe.skipIf(!DB)("job match persistence (no scoring here)", () => {
  it("upserts, fetches by job, lists, updates; rejects unknown job + bad scores", async () => {
    const job = await request(app)
      .post("/api/jobs")
      .set(HA)
      .send({ title: "FE", company: "Beta", description: "UI" });
    const jobId = job.body.job.id;

    await request(app)
      .post("/api/matches")
      .set(HA)
      .send({ jobId: "missing", overallScore: 80 })
      .expect(404);
    await request(app)
      .post("/api/matches")
      .set(HA)
      .send({ jobId, overallScore: 150 })
      .expect(400);

    const created = await request(app)
      .post("/api/matches")
      .set(HA)
      .send({ jobId, overallScore: 80, skillScore: 90, reasons: ["React overlap"] });
    expect(created.status).toBe(201);

    const again = await request(app)
      .post("/api/matches")
      .set(HA)
      .send({ jobId, overallScore: 85 });
    expect(again.body.match.overallScore).toBe(85); // upsert, no duplicate

    await request(app).get(`/api/matches/job/${jobId}`).set(HB).expect(404);
    const byJob = await request(app).get(`/api/matches/job/${jobId}`).set(HA).expect(200);
    expect(byJob.body.match.overallScore).toBe(85);

    const list = await request(app).get("/api/matches").set(HA).expect(200);
    expect(list.body.matches.length).toBe(1);

    const patched = await request(app)
      .patch(`/api/matches/${byJob.body.match.id}`)
      .set(HA)
      .send({ overallScore: 90 });
    expect(patched.body.match.overallScore).toBe(90);
  });
});

describe.skipIf(!DB)("applications + events + transactions", () => {
  it("full lifecycle: create (with event), valid/invalid transitions, history, update, delete", async () => {
    const job = await request(app)
      .post("/api/jobs")
      .set(HA)
      .send({ title: "DevOps", company: "Gamma", description: "Infra" });
    const jobId = job.body.job.id;

    const created = await request(app).post("/api/applications").set(HA).send({ jobId });
    expect(created.status).toBe(201);
    expect(created.body.application.status).toBe("DISCOVERED");
    const appId = created.body.application.id;

    // Duplicate application for the same job -> 409.
    await request(app).post("/api/applications").set(HA).send({ jobId }).expect(409);
    // Application for another user's job -> 404.
    await request(app).post("/api/applications").set(HB).send({ jobId }).expect(404);

    // Invalid transition: status unchanged, no event written.
    await request(app).patch(`/api/applications/${appId}/status`).set(HA).send({ toStatus: "OFFER" }).expect(422);
    let events = await request(app).get(`/api/applications/${appId}/events`).set(HA).expect(200);
    expect(events.body.events.length).toBe(1); // creation event only
    expect(events.body.events[0].newStatus).toBe("DISCOVERED");

    // Valid transition writes status + event atomically.
    const moved = await request(app)
      .patch(`/api/applications/${appId}/status`)
      .set(HA)
      .send({ toStatus: "MATCHED", note: "looks relevant" });
    expect(moved.body.application.status).toBe("MATCHED");

    events = await request(app).get(`/api/applications/${appId}/events`).set(HA).expect(200);
    expect(events.body.events.length).toBe(2);
    expect(events.body.events.map((e: { newStatus: string }) => e.newStatus)).toEqual([
      "DISCOVERED",
      "MATCHED",
    ]);
    const last = events.body.events[1];
    expect(last.oldStatus).toBe("DISCOVERED");
    expect(last.note).toBe("looks relevant");

    // Detail view embeds chronological history.
    const detail = await request(app).get(`/api/applications/${appId}`).set(HA).expect(200);
    expect(detail.body.application.events.length).toBe(2);

    // Cross-user: invisible to B.
    await request(app).get(`/api/applications/${appId}`).set(HB).expect(404);
    await request(app).get(`/api/applications/${appId}/events`).set(HB).expect(404);
    await request(app)
      .patch(`/api/applications/${appId}/status`)
      .set(HB)
      .send({ toStatus: "REVIEW" })
      .expect(404);

    // Mode/resume update + delete.
    const upd = await request(app)
      .patch(`/api/applications/${appId}`)
      .set(HA)
      .send({ mode: "APPROVAL" });
    expect(upd.body.application.mode).toBe("APPROVAL");
    await request(app).patch(`/api/applications/${appId}`).set(HA).send({ mode: "NOPE" }).expect(400);
    await request(app).delete(`/api/applications/${appId}`).set(HB).expect(404);
    await request(app).delete(`/api/applications/${appId}`).set(HA).expect(200);
  });
});

describe.skipIf(!DB)("dashboard stats are Prisma-backed", () => {
  it("reflects created jobs and applications", async () => {
    const before = await request(app).get("/api/dashboard/stats").set(HA).expect(200);
    const job = await request(app)
      .post("/api/jobs")
      .set(HA)
      .send({ title: "SRE", company: "Delta", description: "Reliability" });
    await request(app).post("/api/applications").set(HA).send({ jobId: job.body.job.id });
    const after = await request(app).get("/api/dashboard/stats").set(HA).expect(200);
    expect(after.body.jobsDiscovered).toBe(before.body.jobsDiscovered + 1);
    expect(after.body.applications).toBe(before.body.applications + 1);
    expect(after.body.byStatus.DISCOVERED).toBeGreaterThanOrEqual(1);
  });
});
