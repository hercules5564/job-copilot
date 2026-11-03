/**
 * Phase 3 tests — job source adapters + ingestion pipeline.
 *
 * Unit describes run everywhere (no DB, no network).
 * Integration describes REQUIRE PostgreSQL (DATABASE_URL) and use the
 * deterministic "demo" adapter plus inline test doubles — never a live
 * external job website. The real "arbeitnow" adapter is covered with a
 * mocked fetch implementation.
 *
 * Isolation: all rows belong to users `p3test-<name>-<ts>`,
 * removed in afterAll (cascades clean children).
 */
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import {
  IngestJobsSchema,
  JobSearchParamsSchema,
  type JobSourceInfo,
  type RawJob,
} from "@jobcopilot/shared";
import { createApp } from "../src/app.js";
import {
  getSource,
  listSourceInfos,
  registerSource,
} from "../src/sources/index.js";
import { __clearSourcesForTests } from "../src/sources/registry.js";
import { registerDefaultSources } from "../src/sources/index.js";
import { ArbeitnowAdapter } from "../src/sources/adapters/arbeitnow.js";
import { DemoAdapter } from "../src/sources/adapters/demo.js";
import type { JobSourceAdapter } from "../src/sources/types.js";
import {
  canonicalizeUrl,
  cleanText,
  normalizeEmploymentType,
  normalizeRawJob,
} from "../src/services/job-normalizer.js";
import { fingerprintFor } from "../src/services/job-deduplicator.js";
import { fingerprint } from "../src/services/jobs.js";
import { ingestJobs } from "../src/services/job-ingestion.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const U = (name: string) => `p3test-${name}-${TS}`;
const H = (name: string) => ({ "x-dev-user-id": U(name) });

const app = createApp();

afterAll(async () => {
  if (!DB) return;
  await prisma.user.deleteMany({
    where: { id: { startsWith: "p3test-" } },
  });
  await prisma.$disconnect();
});

// ---------- unit: registry ----------

describe("source registry", () => {
  it("resolves known sources (arbeitnow + demo)", () => {
    expect(getSource("arbeitnow").id).toBe("arbeitnow");
    expect(getSource("demo").id).toBe("demo");
    expect(getSource("arbeitnow").mock).toBe(false);
    expect(getSource("demo").mock).toBe(true);
  });

  it("rejects unknown source IDs cleanly", () => {
    expect(() => getSource("linkedin")).toThrowError(/Unknown job source/);
  });

  it("lists sources without secrets", () => {
    const infos = listSourceInfos();
    const ids = infos.map((s: JobSourceInfo) => s.id);
    expect(ids).toContain("arbeitnow");
    expect(ids).toContain("demo");
    for (const info of infos) {
      expect(JSON.stringify(info)).not.toMatch(/key|token|secret|password/i);
    }
  });

  it("accepts additional sources through the adapter interface", () => {
    const extra: JobSourceAdapter = {
      id: "unit-extra",
      name: "Unit Extra",
      mock: true,
      async search() {
        return [];
      },
      info(): JobSourceInfo {
        return {
          id: "unit-extra",
          name: "Unit Extra",
          available: true,
          mock: true,
          capabilities: {
            query: true,
            location: false,
            remote: false,
            employmentType: false,
            pagination: false,
            signals: false,
          },
          limits: { timeoutMs: 5000, maxRequestsPerRun: 1, maxResults: 50 },
        };
      },
    };
    registerSource(extra);
    expect(getSource("unit-extra").name).toBe("Unit Extra");
    __clearSourcesForTests();
    registerDefaultSources();
    expect(() => getSource("unit-extra")).toThrowError(/Unknown job source/);
  });
});

// ---------- unit: search params ----------

describe("search parameter validation", () => {
  it("accepts a full valid search and applies defaults", () => {
    const p = JobSearchParamsSchema.parse({
      query: "backend",
      location: "Berlin",
      remote: true,
      limit: 10,
    });
    expect(p.page).toBe(1);
    expect(p.limit).toBe(10);
  });

  it("rejects oversized limits and bad pages", () => {
    expect(() => JobSearchParamsSchema.parse({ limit: 500 })).toThrow();
    expect(() => JobSearchParamsSchema.parse({ page: 0 })).toThrow();
    expect(() => IngestJobsSchema.parse({ source: "" })).toThrow();
    expect(() => IngestJobsSchema.parse({})).toThrow();
  });
});

// ---------- unit: normalization ----------

describe("job normalization (deterministic)", () => {
  const base: RawJob = {
    externalId: "u-1",
    source: "demo",
    title: "  Software Engineer   ",
    company: "  Acme Corp ",
    companyUrl: null,
    jobUrl: "https://Example.COM/jobs/123/?utm_source=x&utm_medium=y&ref=abc#frag",
    location: "  Berlin,  Germany ",
    remote: null,
    employmentType: "Full-time",
    salaryMin: 50,
    salaryMax: 70,
    salaryCurrency: "eur",
    description: "  Build things.\n\nKeep newlines.  ",
    postedAt: null,
    metadata: null,
  };

  it("collapses whitespace without rewriting content", () => {
    expect(cleanText("  Software Engineer   ")).toBe("Software Engineer");
    const n = normalizeRawJob(base);
    expect(n.title).toBe("Software Engineer");
    expect(n.company).toBe("Acme Corp");
    expect(n.location).toBe("Berlin, Germany");
    expect(n.description).toBe("Build things.\n\nKeep newlines.");
  });

  it("canonicalizes URLs for comparison", () => {
    expect(canonicalizeUrl("https://Example.COM/jobs/123/?utm_source=x&ref=abc#frag")).toBe(
      "https://example.com/jobs/123?ref=abc",
    );
    expect(canonicalizeUrl("https://example.com/jobs/123/")).toBe(
      "https://example.com/jobs/123",
    );
    expect(canonicalizeUrl(null)).toBeNull();
    expect(canonicalizeUrl("not a url")).toBeNull();
  });

  it("normalizes employment type and currency deterministically", () => {
    expect(normalizeEmploymentType("Full-time")).toBe("FULL_TIME");
    expect(normalizeEmploymentType("contract")).toBe("CONTRACT");
    expect(normalizeEmploymentType(null)).toBeNull();
    expect(normalizeRawJob(base).salaryCurrency).toBe("EUR");
  });

  it("infers remote only from explicit flags or clear hints", () => {
    expect(normalizeRawJob({ ...base, remote: true }).remote).toBe(true);
    expect(normalizeRawJob({ ...base, remote: false }).remote).toBe(false);
    expect(
      normalizeRawJob({ ...base, remote: null, location: "Remote" }).remote,
    ).toBe(true);
    expect(
      normalizeRawJob({ ...base, remote: null, location: "Berlin" }).remote,
    ).toBe(false);
  });

  it("reuses the Phase 2 fingerprint algorithm (no second algorithm)", () => {
    const n = normalizeRawJob(base);
    expect(fingerprintFor(n)).toBe(
      fingerprint({
        company: n.company,
        title: n.title,
        location: n.location,
        salaryMin: n.salaryMin,
        salaryMax: n.salaryMax,
      }),
    );
  });
});

// ---------- unit: arbeitnow adapter with mocked fetch ----------

describe("arbeitnow adapter (mocked HTTP, never live)", () => {
  const apiPayload = {
    data: [
      {
        slug: "senior-dev-1",
        company_name: "Initech",
        title: "Senior Developer",
        description: "Write code.",
        remote: true,
        url: "https://www.arbeitnow.com/jobs/senior-dev-1",
        location: "Remote",
        job_types: ["full_time"],
        created_at: "2026-09-10T10:00:00.000Z",
      },
      {
        // malformed entry: missing title → skipped, never invented
        slug: "bad-1",
        company_name: "Initech",
        description: "No title here.",
      },
    ],
  };

  const fetchImpl = (async () =>
    new Response(JSON.stringify(apiPayload), { status: 200 })) as typeof fetch;

  it("maps the public API shape to RawJobs and filters deterministically", async () => {
    const adapter = new ArbeitnowAdapter({ fetchImpl });
    const all = await adapter.search({ page: 1, limit: 20 });
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      externalId: "senior-dev-1",
      source: "arbeitnow",
      company: "Initech",
      remote: true,
    });
    expect(all[0].salaryMin).toBeNull(); // never invent salary

    const none = await adapter.search({ query: "astronaut", page: 1, limit: 20 });
    expect(none).toHaveLength(0);

    const remoteOnly = await adapter.search({ remote: false, page: 1, limit: 20 });
    expect(remoteOnly).toHaveLength(0);
  });

  it("surfaces HTTP failures as safe adapter errors", async () => {
    const failing = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    const adapter = new ArbeitnowAdapter({ fetchImpl: failing });
    await expect(adapter.search({ page: 1, limit: 5 })).rejects.toThrow(/Arbeitnow/);
  });
});

// ---------- integration: full pipeline via demo adapter ----------

describe.skipIf(!DB)("ingestion pipeline (demo adapter)", () => {
  it("inserts on first run; repeats are idempotent with correct stats", async () => {
    const first = await ingestJobs(U("pipe"), { source: "demo", limit: 20 });
    expect(first).toMatchObject({
      source: "demo",
      fetched: 4, // 3 valid + 1 malformed fixture
      normalized: 3,
      inserted: 3,
      updated: 0,
      duplicates: 0,
      rejected: 1,
    });
    expect(first.errors).toHaveLength(1);
    expect(first.durationMs).toBeGreaterThanOrEqual(0);

    const second = await ingestJobs(U("pipe"), { source: "demo", limit: 20 });
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.duplicates).toBe(3); // idempotent: nothing new
    expect(second.rejected).toBe(1); // malformed still reported, not stored

    const rows = await prisma.job.findMany({ where: { userId: U("pipe") } });
    expect(rows).toHaveLength(3); // no duplicates in the database
  });

  it("one malformed job does not stop the run and provenance is preserved", async () => {
    const res = await ingestJobs(U("prov"), { source: "demo", limit: 20 });
    expect(res.inserted).toBe(3);
    expect(res.rejected).toBe(1);

    const row = await prisma.job.findFirst({
      where: { userId: U("prov"), externalId: "demo-001" },
    });
    expect(row).not.toBeNull();
    expect(row!.sourceKey).toBe("demo");
    // Whitespace-normalized by the pipeline:
    expect(row!.title).toBe("Backend Engineer");
    expect(row!.companyName).toBe("Acme Corp");
    // Canonical source URL preserved (tracking + fragment stripped):
    expect(row!.sourceUrl).toBe("https://example.com/jobs/demo-001");
    const src = await prisma.jobSource.findUnique({ where: { key: "demo" } });
    expect(src?.name).toContain("Demo");
    expect(row!.sourceId).toBe(src!.id);
  });

  it("deduplicates by canonical URL across differing externalIds", async () => {
    await ingestJobs(U("url"), { source: "demo", limit: 20 });
    const alias: JobSourceAdapter = {
      id: "test-url-alias",
      name: "URL alias double",
      mock: true,
      async search() {
        return [
          {
            externalId: "totally-different-id",
            source: "test-url-alias",
            title: "Something Else Entirely",
            company: "Unrelated LLC",
            companyUrl: null,
            jobUrl: "https://example.com/jobs/demo-001?utm_campaign=repost",
            location: "Elsewhere",
            remote: false,
            employmentType: null,
            salaryMin: null,
            salaryMax: null,
            salaryCurrency: null,
            description: "Same canonical URL as demo-001.",
            postedAt: null,
            metadata: null,
          },
        ];
      },
      info(): JobSourceInfo {
        return {
          id: "test-url-alias",
          name: "URL alias double",
          available: true,
          mock: true,
          capabilities: { query: false, location: false, remote: false, employmentType: false, pagination: false, signals: false },
          limits: { timeoutMs: 5000, maxRequestsPerRun: 1, maxResults: 50 },
        };
      },
    };
    registerSource(alias);
    try {
      const res = await ingestJobs(U("url"), { source: "test-url-alias", limit: 20 });
      expect(res.inserted).toBe(0);
      expect(res.duplicates).toBe(1);
    } finally {
      __clearSourcesForTests();
      registerDefaultSources();
    }
  });

  it("deduplicates by fingerprint when IDs and URLs differ", async () => {
    await ingestJobs(U("fp"), { source: "demo", limit: 20 });
    const twin: JobSourceAdapter = {
      id: "test-fp-twin",
      name: "Fingerprint twin double",
      mock: true,
      async search() {
        return [
          {
            externalId: "different-id",
            source: "test-fp-twin",
            title: "Backend Engineer", // same normalized triple as demo-001
            company: "Acme Corp",
            companyUrl: null,
            jobUrl: null, // no URL → falls through to fingerprint
            location: "Berlin, Germany",
            remote: false,
            employmentType: null,
            salaryMin: 80000,
            salaryMax: 110000,
            salaryCurrency: "EUR",
            description: "Different words, same identity.",
            postedAt: null,
            metadata: null,
          },
        ];
      },
      info(): JobSourceInfo {
        return {
          id: "test-fp-twin",
          name: "Fingerprint twin double",
          available: true,
          mock: true,
          capabilities: { query: false, location: false, remote: false, employmentType: false, pagination: false, signals: false },
          limits: { timeoutMs: 5000, maxRequestsPerRun: 1, maxResults: 50 },
        };
      },
    };
    registerSource(twin);
    try {
      const res = await ingestJobs(U("fp"), { source: "test-fp-twin", limit: 20 });
      expect(res.inserted).toBe(0);
      expect(res.duplicates).toBe(1);
    } finally {
      __clearSourcesForTests();
      registerDefaultSources();
    }
  });

  it("updates an existing record when the source carries fresher data", async () => {
    await ingestJobs(U("upd"), { source: "demo", limit: 20 });
    const evolving: JobSourceAdapter = {
      id: "demo", // same source+externalId, fresher description/postedAt
      name: "Demo fixtures (mock — not a real source)",
      mock: true,
      async search() {
        const demo = new DemoAdapter();
        const jobs = await demo.search({ page: 1, limit: 2 });
        return jobs.map((j: RawJob) =>
          j.externalId === "demo-001"
            ? {
                ...j,
                description: "Revised description with new details.",
                postedAt: "2026-09-20T00:00:00.000Z",
              }
            : j,
        );
      },
      info(): JobSourceInfo {
        return {
          id: "demo",
          name: "Demo fixtures (mock — not a real source)",
          available: true,
          mock: true,
          capabilities: { query: true, location: true, remote: true, employmentType: true, pagination: false, signals: false },
          limits: { timeoutMs: 5000, maxRequestsPerRun: 1, maxResults: 50 },
        };
      },
    };
    registerSource(evolving);
    try {
      const res = await ingestJobs(U("upd"), { source: "demo", limit: 20 });
      expect(res.inserted).toBe(0);
      expect(res.updated).toBe(1);
      expect(res.duplicates).toBe(1); // limit:2 → one fresher, one identical
      const row = await prisma.job.findFirst({
        where: { userId: U("upd"), externalId: "demo-001" },
      });
      expect(row!.description).toBe("Revised description with new details.");
    } finally {
      __clearSourcesForTests();
      registerDefaultSources();
    }
  });

  it("adapter failure is handled safely without corrupting the database", async () => {
    const failing: JobSourceAdapter = {
      id: "test-failing",
      name: "Failing double",
      mock: true,
      async search() {
        throw new Error("boom");
      },
      info(): JobSourceInfo {
        return {
          id: "test-failing",
          name: "Failing double",
          available: true,
          mock: true,
          capabilities: { query: false, location: false, remote: false, employmentType: false, pagination: false, signals: false },
          limits: { timeoutMs: 5000, maxRequestsPerRun: 1, maxResults: 50 },
        };
      },
    };
    registerSource(failing);
    try {
      const res = await ingestJobs(U("fail"), { source: "test-failing", limit: 20 });
      expect(res.fetched).toBe(0);
      expect(res.inserted).toBe(0);
      expect(res.errors).toHaveLength(1);
      const rows = await prisma.job.findMany({ where: { userId: U("fail") } });
      expect(rows).toHaveLength(0);
    } finally {
      __clearSourcesForTests();
      registerDefaultSources();
    }
  });

  it("ingestion is scoped per user (no cross-user leakage)", async () => {
    const a = await ingestJobs(U("alice"), { source: "demo", limit: 1 });
    const b = await ingestJobs(U("bob"), { source: "demo", limit: 1 });
    expect(a.inserted).toBe(1);
    expect(b.inserted).toBe(1); // same source job, separate user rows
    const rowsA = await prisma.job.findMany({ where: { userId: U("alice") } });
    const rowsB = await prisma.job.findMany({ where: { userId: U("bob") } });
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0].id).not.toBe(rowsB[0].id);
  });
});

// ---------- integration: HTTP endpoints ----------

describe.skipIf(!DB)("ingestion API endpoints", () => {
  it("GET /api/jobs/sources lists registered sources without secrets", async () => {
    const res = await request(app).get("/api/jobs/sources").set(H("api"));
    expect(res.status).toBe(200);
    const ids = res.body.sources.map((s: JobSourceInfo) => s.id);
    expect(ids).toContain("arbeitnow");
    expect(ids).toContain("demo");
    expect(JSON.stringify(res.body)).not.toMatch(/token|secret|password/i);
  });

  it("POST /api/jobs/ingest ingests and is idempotent", async () => {
    const first = await request(app)
      .post("/api/jobs/ingest")
      .set(H("api"))
      .send({ source: "demo", limit: 20 });
    expect(first.status).toBe(200);
    expect(first.body.ingestion.inserted).toBe(3);
    expect(first.body.ingestion.rejected).toBe(1);

    const second = await request(app)
      .post("/api/jobs/ingest")
      .set(H("api"))
      .send({ source: "demo", limit: 20 });
    expect(second.body.ingestion.inserted).toBe(0);
    expect(second.body.ingestion.duplicates).toBe(3);

    const list = await request(app).get("/api/jobs").set(H("api")).expect(200);
    expect(list.body.jobs.length).toBe(3);
  });

  it("rejects invalid payloads and unknown sources", async () => {
    await request(app)
      .post("/api/jobs/ingest")
      .set(H("api"))
      .send({ source: "demo", limit: 500 })
      .expect(400);
    await request(app)
      .post("/api/jobs/ingest")
      .set(H("api"))
      .send({})
      .expect(400);
    const unknown = await request(app)
      .post("/api/jobs/ingest")
      .set(H("api"))
      .send({ source: "linkedin", limit: 5 });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toMatch(/Unknown job source/);
  });

  it("never accepts arbitrary URLs (no SSRF proxy)", async () => {
    const res = await request(app)
      .post("/api/jobs/ingest")
      .set(H("api"))
      .send({ source: "demo", limit: 5, url: "http://169.254.169.254/" });
    expect(res.status).toBe(200); // unknown field stripped, not fetched
    expect(res.body.ingestion.source).toBe("demo");
  });
});

