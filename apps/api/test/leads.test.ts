/**
 * Phase 13 (C3) tests — Leads / Hiring Signal inbox reads.
 * Focused coverage over the P10B signal foundation plus the additive
 * read-only query extensions (source filter, search, offset pagination,
 * related-job + related-application references).
 * DB describes REQUIRE PostgreSQL. Isolation: users `p13ctest-<name>-<ts>`.
 * No discovery, matching, queue, auth, or browser behavior is touched here.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import { createApp } from "../src/app.js";
import { ensureUser } from "../src/services/users.js";
import { normalize } from "../src/services/jobs.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const U = (name: string) => `p13ctest-${name}-${TS}`;
const H = (name: string) => ({ "x-dev-user-id": U(name) });

const app = createApp();

async function seedJob(userId: string, title: string, company: string, sourceKey = "demo") {
  return prisma.job.create({
    data: {
      userId,
      companyName: company,
      normalizedCompany: normalize(company),
      sourceKey,
      externalId: `p13-${title}-${company}-${Math.random().toString(36).slice(2)}`,
      title,
      normalizedTitle: title.toLowerCase(),
      description: `${title} at ${company}. `.repeat(5),
    },
  });
}

async function seedSignal(
  userId: string,
  overrides: {
    companyName?: string;
    source?: string;
    type?: "JOB_POSTING";
    title?: string;
    relatedJobId?: string | null;
    detectedAt?: Date;
    dedupKey?: string;
  } = {},
) {
  const n = Math.random().toString(36).slice(2);
  return prisma.hiringSignal.create({
    data: {
      userId,
      companyName: overrides.companyName ?? "Acme Corp",
      source: overrides.source ?? "greenhouse",
      type: overrides.type ?? "JOB_POSTING",
      title: overrides.title ?? "Backend Engineer",
      url: "https://example.com/jobs/1",
      evidenceSummary: "New JOB_POSTING detected for Backend Engineer at Acme Corp.",
      confidence: 70,
      relatedJobId: overrides.relatedJobId ?? null,
      detectedAt: overrides.detectedAt ?? new Date(),
      dedupKey: overrides.dedupKey ?? `p13-${TS}-${n}`,
    },
  });
}

beforeAll(async () => {
  if (!DB) return;
  // Owner A: three signals across sources/companies + one linked job.
  const a = U("owner");
  await ensureUser(a);
  const jobA = await seedJob(a, "Backend Engineer", "Acme Corp", "greenhouse");
  await seedSignal(a, {
    companyName: "Acme Corp",
    source: "greenhouse",
    title: "Backend Engineer",
    relatedJobId: jobA.id,
    detectedAt: new Date(Date.now() - 1000),
    dedupKey: `p13-a-1-${TS}`,
  });
  await seedSignal(a, {
    companyName: "Globex",
    source: "arbeitnow",
    title: "Frontend Engineer",
    detectedAt: new Date(Date.now() - 2000),
    dedupKey: `p13-a-2-${TS}`,
  });
  await seedSignal(a, {
    companyName: "Initech",
    source: "demo",
    title: "Data Analyst",
    detectedAt: new Date(Date.now() - 3000),
    dedupKey: `p13-a-3-${TS}`,
  });
  // Link an application to the greenhouse job (related-application probe).
  const created = await request(app)
    .post("/api/applications")
    .set(H("owner"))
    .send({ jobId: jobA.id });
  expect(created.status).toBe(201);

  // Owner B: one signal, invisible to A.
  const b = U("other");
  await ensureUser(b);
  await seedSignal(b, {
    companyName: "Umbrella",
    source: "demo",
    title: "QA Engineer",
    dedupKey: `p13-b-1-${TS}`,
  });
});

afterAll(async () => {
  if (!DB) return;
  await prisma.user.deleteMany({ where: { id: { startsWith: "p13ctest-" } } });
  await prisma.$disconnect();
});

describe("leads authentication", () => {
  it("rejects unauthenticated list and detail with 401", async () => {
    const saved = process.env.AUTH_DEV_BYPASS;
    delete process.env.AUTH_DEV_BYPASS;
    try {
      const list = await request(app).get("/api/signals");
      expect(list.status).toBe(401);
      const detail = await request(app).get("/api/signals/does-not-exist");
      expect(detail.status).toBe(401);
    } finally {
      if (saved === undefined) delete process.env.AUTH_DEV_BYPASS;
      else process.env.AUTH_DEV_BYPASS = saved;
    }
  });
});

describe.skipIf(!DB)("leads ownership", () => {
  it("scopes lists per user and hides foreign signals as 404", async () => {
    const mine = await request(app).get("/api/signals").set(H("owner"));
    expect(mine.status).toBe(200);
    expect(mine.body.signals).toHaveLength(3);
    expect(mine.body.signals.every((s: { companyName: string }) => s.companyName !== "Umbrella")).toBe(true);

    const theirs = await request(app).get("/api/signals").set(H("other"));
    expect(theirs.body.signals).toHaveLength(1);
    expect(theirs.body.signals[0].companyName).toBe("Umbrella");

    const foreignId = mine.body.signals[0].id as string;
    const direct = await request(app).get(`/api/signals/${foreignId}`).set(H("other"));
    expect(direct.status).toBe(404);

    const own = await request(app).get(`/api/signals/${foreignId}`).set(H("owner"));
    expect(own.status).toBe(200);
    expect(own.body.signal.id).toBe(foreignId);
  });

  it("returns an empty list for a user with no signals", async () => {
    const res = await request(app).get("/api/signals").set(H("empty"));
    expect(res.status).toBe(200);
    expect(res.body.signals).toEqual([]);
  });
});

describe.skipIf(!DB)("leads list bounds and filters", () => {
  it("respects limit and offset pagination", async () => {
    const first = await request(app).get("/api/signals?limit=2&offset=0").set(H("owner"));
    expect(first.body.signals).toHaveLength(2);
    const second = await request(app).get("/api/signals?limit=2&offset=2").set(H("owner"));
    expect(second.body.signals).toHaveLength(1);
    expect(second.body.signals[0].id).not.toBe(first.body.signals[0].id);
    // Newest first.
    expect(
      new Date(first.body.signals[0].detectedAt).getTime() >=
        new Date(first.body.signals[1].detectedAt).getTime(),
    ).toBe(true);
  });

  it("filters by type, company, source, and search", async () => {
    const byType = await request(app).get("/api/signals?type=JOB_POSTING").set(H("owner"));
    expect(byType.body.signals).toHaveLength(3);

    const byCompany = await request(app).get("/api/signals?company=acme").set(H("owner"));
    expect(byCompany.body.signals).toHaveLength(1);
    expect(byCompany.body.signals[0].companyName).toBe("Acme Corp");

    const bySource = await request(app).get("/api/signals?source=arbeitnow").set(H("owner"));
    expect(bySource.body.signals).toHaveLength(1);
    expect(bySource.body.signals[0].companyName).toBe("Globex");

    const bySearchTitle = await request(app).get("/api/signals?search=data analyst").set(H("owner"));
    expect(bySearchTitle.body.signals).toHaveLength(1);
    expect(bySearchTitle.body.signals[0].companyName).toBe("Initech");

    const bySearchSource = await request(app).get("/api/signals?search=GREENHOUSE").set(H("owner"));
    expect(bySearchSource.body.signals).toHaveLength(1);

    const combined = await request(app)
      .get("/api/signals?type=JOB_POSTING&source=demo&search=initech")
      .set(H("owner"));
    expect(combined.body.signals).toHaveLength(1);
  });

  it("rejects invalid enum, limit, and offset values", async () => {
    expect((await request(app).get("/api/signals?type=RECRUITER_SPAM").set(H("owner"))).status).toBe(400);
    expect((await request(app).get("/api/signals?limit=0").set(H("owner"))).status).toBe(400);
    expect((await request(app).get("/api/signals?limit=999").set(H("owner"))).status).toBe(400);
    expect((await request(app).get("/api/signals?offset=-1").set(H("owner"))).status).toBe(400);
    expect((await request(app).get("/api/signals?limit=abc").set(H("owner"))).status).toBe(400);
  });
});

describe.skipIf(!DB)("leads related records", () => {
  it("exposes the related job and linked application without extra fetches", async () => {
    const res = await request(app).get("/api/signals?source=greenhouse").set(H("owner"));
    expect(res.body.signals).toHaveLength(1);
    const signal = res.body.signals[0];
    expect(signal.relatedJob).toMatchObject({ title: "Backend Engineer", companyName: "Acme Corp" });
    expect(typeof signal.applicationId).toBe("string");

    const detail = await request(app).get(`/api/signals/${signal.id}`).set(H("owner"));
    expect(detail.body.signal.relatedJob.id).toBe(signal.relatedJob.id);
    expect(detail.body.signal.applicationId).toBe(signal.applicationId);
  });

  it("handles signals with no linked job safely", async () => {
    const res = await request(app).get("/api/signals?source=arbeitnow").set(H("owner"));
    expect(res.body.signals).toHaveLength(1);
    expect(res.body.signals[0].relatedJob).toBeNull();
    expect(res.body.signals[0].applicationId).toBeNull();
  });

  it("handles a deleted related job without crashing (SetNull)", async () => {
    const userId = U("gone");
    await ensureUser(userId);
    const job = await seedJob(userId, "Temp Role", "TempCo");
    const signal = await seedSignal(userId, { relatedJobId: job.id, dedupKey: `p13-gone-${TS}` });
    await prisma.job.delete({ where: { id: job.id } });
    const res = await request(app).get(`/api/signals/${signal.id}`).set(H("gone"));
    expect(res.status).toBe(200);
    expect(res.body.signal.relatedJobId).toBeNull();
    expect(res.body.signal.relatedJob).toBeNull();
    expect(res.body.signal.applicationId).toBeNull();
  });
});

describe.skipIf(!DB)("leads response safety", () => {
  it("exposes only safe fields and never secrets or other users' data", async () => {
    const res = await request(app).get("/api/signals").set(H("owner"));
    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/token|secret|password|cookie|stack|sessionToken/i);
    for (const s of res.body.signals as Record<string, unknown>[]) {
      expect(Object.keys(s).sort()).toEqual(
        [
          "applicationId",
          "companyId",
          "companyName",
          "confidence",
          "createdAt",
          "detectedAt",
          "evidenceSummary",
          "id",
          "relatedJob",
          "relatedJobId",
          "source",
          "title",
          "type",
          "url",
        ].sort(),
      );
    }
  });
});
