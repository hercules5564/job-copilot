/**
 * Phase 12C tests — descriptive analytics over persisted records.
 * Deterministic seeds; user-scoped assertions; zero-data and 401 paths.
 * Requires PostgreSQL. Isolation: users `p12ctest-<name>-<ts>`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import { createApp } from "../src/app.js";
import { ensureUser } from "../src/services/users.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const U = (name: string) => `p12ctest-${name}-${TS}`;
const H = (name: string) => ({ "x-dev-user-id": U(name) });

const app = createApp();

async function seedJob(userId: string, title: string, company: string): Promise<string> {
  const res = await request(app)
    .post("/api/jobs")
    .set({ "x-dev-user-id": userId })
    .send({ title, company, description: `${title} at ${company}.` });
  expect(res.status).toBe(201);
  return res.body.job.id as string;
}

async function seedApplication(userId: string, jobId: string, chain: string[]): Promise<string> {
  const created = await request(app)
    .post("/api/applications")
    .set({ "x-dev-user-id": userId })
    .send({ jobId });
  expect(created.status).toBe(201);
  const id = created.body.application.id as string;
  for (const toStatus of chain) {
    const r = await request(app)
      .patch(`/api/applications/${id}/status`)
      .set({ "x-dev-user-id": userId })
      .send({ toStatus });
    expect(r.status).toBe(200);
  }
  return id;
}

const FULL_CHAIN = ["MATCHED", "REVIEW", "READY", "APPROVED", "APPLIED"];

beforeAll(async () => {
  if (!DB) return;
  // Rich user: 4 applications across the funnel + 2 matches + 3 jobs.
  const userId = U("rich");
  await ensureUser(userId);
  const jobA = await seedJob(userId, "Backend Engineer", "Acme");
  const jobB = await seedJob(userId, "Frontend Engineer", "Globex");
  const jobC = await seedJob(userId, "Data Analyst", "Initech");
  await seedApplication(userId, jobA, [...FULL_CHAIN, "INTERVIEW", "OFFER"]);
  await seedApplication(userId, jobB, [...FULL_CHAIN, "RECRUITER_RESPONSE"]);
  await seedApplication(userId, jobC, [...FULL_CHAIN, "REJECTED"]);
  const jobD = await seedJob(userId, "QA Engineer", "Umbrella");
  await seedApplication(userId, jobD, []);
  await prisma.jobMatch.create({
    data: { userId, jobId: jobA, overallScore: 90, decision: "STRONG_MATCH", matchMode: "deterministic" },
  });
  await prisma.jobMatch.create({
    data: { userId, jobId: jobB, overallScore: 70, decision: "GOOD_MATCH", matchMode: "semantic" },
  });
  await prisma.discoveryConfig.upsert({
    where: { userId },
    update: {},
    create: { userId, sourceKeys: ["demo", "arbeitnow"] },
  });
  // Second user with strictly less data (isolation probe).
  const otherId = U("other");
  await ensureUser(otherId);
  const otherJob = await seedJob(otherId, "Other Role", "OtherCo");
  await seedApplication(otherId, otherJob, [...FULL_CHAIN]);
  await prisma.jobMatch.create({
    data: { userId: otherId, jobId: otherJob, overallScore: 30, decision: "LOW_MATCH", matchMode: "hybrid" },
  });
});

afterAll(async () => {
  if (!DB) return;
  await prisma.user.deleteMany({ where: { id: { startsWith: "p12ctest-" } } });
  await prisma.$disconnect();
});

describe.skipIf(!DB)("analytics API", () => {
  it("returns correct application counts and status distribution", async () => {
    const res = await request(app).get("/api/analytics").set(H("rich")).expect(200);
    const apps = res.body.analytics.applications;
    expect(apps.total).toBe(4);
    expect(apps.byStatus).toMatchObject({ OFFER: 1, RECRUITER_RESPONSE: 1, REJECTED: 1, DISCOVERED: 1 });
    expect(apps).toMatchObject({
      applied: 0,
      recruiterResponse: 1,
      assessment: 0,
      interview: 0,
      offer: 1,
      rejected: 1,
    });
  });

  it("counts unique applications per funnel stage and exact rates", async () => {
    const res = await request(app).get("/api/analytics").set(H("rich")).expect(200);
    expect(res.body.analytics.events.funnel).toEqual({
      recruiterResponse: 1,
      assessment: 0,
      interview: 1,
      offer: 1,
    });
    // Denominators are unique applications (4), not event rows.
    expect(res.body.analytics.rates).toEqual({ responseRate: 25, interviewRate: 25, offerRate: 25 });
    expect(res.body.analytics.events.total).toBe(8 + 7 + 7 + 1);
  });

  it("reports match distribution, modes, and average score", async () => {
    const res = await request(app).get("/api/analytics").set(H("rich")).expect(200);
    const matches = res.body.analytics.matches;
    expect(matches.total).toBe(2);
    expect(matches.byDecision).toEqual({ STRONG_MATCH: 1, GOOD_MATCH: 1 });
    expect(matches.averageScore).toBe(80);
    expect(matches.byMode).toEqual({ deterministic: 1, semantic: 1 });
  });

  it("reports jobs by source and time-bounded activity", async () => {
    const res = await request(app).get("/api/analytics").set(H("rich")).expect(200);
    expect(res.body.analytics.jobs.total).toBe(4);
    expect(res.body.analytics.jobs.bySource).toEqual({ manual: 4 });
    expect(res.body.analytics.activity).toEqual({
      applicationsLast7Days: 4,
      applicationsLast30Days: 4,
      matchesLast30Days: 2,
    });
  });

  it("reports the discovery configuration honestly", async () => {
    const res = await request(app).get("/api/analytics").set(H("rich")).expect(200);
    expect(res.body.analytics.discovery).toMatchObject({
      configured: true,
      enabled: true,
      sources: ["demo", "arbeitnow"],
      scheduled: false,
    });
    const fresh = await request(app).get("/api/analytics").set(H("fresh")).expect(200);
    expect(fresh.body.analytics.discovery.configured).toBe(false);
  });

  it("returns valid zeros for a brand-new user", async () => {
    const res = await request(app).get("/api/analytics").set(H("fresh")).expect(200);
    const a = res.body.analytics;
    expect(a.applications).toMatchObject({ total: 0, applied: 0, interview: 0, offer: 0, rejected: 0 });
    expect(a.rates).toEqual({ responseRate: 0, interviewRate: 0, offerRate: 0 });
    expect(a.matches).toMatchObject({ total: 0, averageScore: null });
    expect(a.jobs.total).toBe(0);
    expect(a.activity).toEqual({ applicationsLast7Days: 0, applicationsLast30Days: 0, matchesLast30Days: 0 });
    const dump = JSON.stringify(res.body);
    expect(dump).not.toMatch(/NaN|Infinity|undefined/);
    for (const n of [a.applications.total, a.rates.responseRate, a.matches.total, a.jobs.total]) {
      expect(Number.isFinite(n)).toBe(true);
    }
  });

  it("never leaks another user's data", async () => {
    const res = await request(app).get("/api/analytics").set(H("rich")).expect(200);
    expect(res.body.analytics.applications.total).toBe(4);
    expect(res.body.analytics.matches.total).toBe(2);
    const other = await request(app).get("/api/analytics").set(H("other")).expect(200);
    expect(other.body.analytics.applications.total).toBe(1);
    expect(other.body.analytics.matches.byDecision).toEqual({ LOW_MATCH: 1 });
    expect(other.body.analytics.matches.byMode).toEqual({ hybrid: 1 });
  });

  it("rejects unauthenticated access and exposes only aggregates", async () => {
    const saved = process.env.AUTH_DEV_BYPASS;
    delete process.env.AUTH_DEV_BYPASS;
    try {
      await request(app).get("/api/analytics").expect(401);
    } finally {
      if (saved !== undefined) process.env.AUTH_DEV_BYPASS = saved;
    }
    const res = await request(app).get("/api/analytics").set(H("rich")).expect(200);
    expect(Object.keys(res.body)).toEqual(["analytics"]);
    const dump = JSON.stringify(res.body);
    expect(dump).not.toMatch(/token|secret|cookie|password|email|resume|bearer/i);
  });
});
