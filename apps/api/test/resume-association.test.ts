/**
 * Phase 18 tests — resume ↔ application association exposure.
 * The association writers (create/update with ownership-validated resumeId)
 * predate this phase; this covers the additive read exposure on
 * GET /api/applications/:id plus the PATCH change/clear paths.
 * DB describes REQUIRE PostgreSQL. Isolation: users `p18test-<name>-<ts>`.
 */
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import { createApp } from "../src/app.js";
import { ensureUser } from "../src/services/users.js";
import { normalize } from "../src/services/jobs.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const U = (name: string) => `p18test-${name}-${TS}`;
const H = (userId: string) => ({ "x-dev-user-id": userId });

const app = createApp();

async function seedJob(userId: string) {
  await ensureUser(userId);
  return prisma.job.create({
    data: {
      userId,
      companyName: "Example Co",
      normalizedCompany: normalize("Example Co"),
      sourceKey: "demo",
      externalId: `p18-${userId}-${Math.random().toString(36).slice(2)}`,
      title: "QA Engineer",
      normalizedTitle: "qa engineer",
      description: "QA role.",
    },
  });
}

async function seedResume(userId: string, name: string) {
  return prisma.resume.create({
    data: { userId, name, targetRoles: ["QA Engineer"], parsedText: "QA text." },
  });
}

afterAll(async () => {
  if (!DB) return;
  await prisma.user.deleteMany({ where: { id: { startsWith: "p18test-" } } });
  await prisma.$disconnect();
});

describe.skipIf(!DB)("resume association", () => {
  it("exposes the associated resume on application detail", async () => {
    const userId = U("expose");
    const job = await seedJob(userId);
    const resume = await seedResume(userId, "Main");
    const created = await request(app)
      .post("/api/applications")
      .set(H(userId))
      .send({ jobId: job.id, resumeId: resume.id });
    expect(created.status).toBe(201);

    const detail = await request(app).get(`/api/applications/${created.body.application.id}`).set(H(userId));
    expect(detail.status).toBe(200);
    expect(detail.body.application.resume).toMatchObject({ id: resume.id, name: "Main" });
    // Existing shape preserved.
    expect(detail.body.application.job.title).toBe("QA Engineer");
    expect(Array.isArray(detail.body.application.events)).toBe(true);
  });

  it("returns resume null when none is associated", async () => {
    const userId = U("none");
    const job = await seedJob(userId);
    const created = await request(app).post("/api/applications").set(H(userId)).send({ jobId: job.id });
    expect(created.status).toBe(201);
    const detail = await request(app).get(`/api/applications/${created.body.application.id}`).set(H(userId));
    expect(detail.status).toBe(200);
    expect(detail.body.application.resume).toBeNull();
  });

  it("changes and clears the association via PATCH with ownership checks", async () => {
    const userId = U("change");
    const job = await seedJob(userId);
    const r1 = await seedResume(userId, "R1");
    const r2 = await seedResume(userId, "R2");
    const created = await request(app).post("/api/applications").set(H(userId)).send({ jobId: job.id });
    const id = created.body.application.id as string;

    const changed = await request(app).patch(`/api/applications/${id}`).set(H(userId)).send({ resumeId: r1.id });
    expect(changed.status).toBe(200);
    const d1 = await request(app).get(`/api/applications/${id}`).set(H(userId));
    expect(d1.body.application.resume).toMatchObject({ id: r1.id });

    const changed2 = await request(app).patch(`/api/applications/${id}`).set(H(userId)).send({ resumeId: r2.id });
    expect(changed2.status).toBe(200);

    const cleared = await request(app).patch(`/api/applications/${id}`).set(H(userId)).send({ resumeId: null });
    expect(cleared.status).toBe(200);
    const d2 = await request(app).get(`/api/applications/${id}`).set(H(userId));
    expect(d2.body.application.resume).toBeNull();

    // Unknown resume id is rejected, never stored.
    const bad = await request(app).patch(`/api/applications/${id}`).set(H(userId)).send({ resumeId: "nope" });
    expect(bad.status).toBe(404);
  });

  it("rejects cross-user resume use and cross-user reads", async () => {
    const a = U("owner");
    const b = U("other");
    const jobA = await seedJob(a);
    await seedJob(b);
    const resumeA = await seedResume(a, "A-resume");
    const created = await request(app).post("/api/applications").set(H(a)).send({ jobId: jobA.id });
    const id = created.body.application.id as string;

    // B cannot attach A's resume to anything and cannot read A's application.
    const jobB = await prisma.job.findFirstOrThrow({ where: { userId: b } });
    const createdB = await request(app).post("/api/applications").set(H(b)).send({ jobId: jobB.id });
    expect(createdB.status).toBe(201);
    const cross = await request(app)
      .patch(`/api/applications/${createdB.body.application.id}`)
      .set(H(b))
      .send({ resumeId: resumeA.id });
    expect(cross.status).toBe(404);
    const read = await request(app).get(`/api/applications/${id}`).set(H(b));
    expect(read.status).toBe(404);
  });
});
