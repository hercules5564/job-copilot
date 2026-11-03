/**
 * Phase 10A tests — processors reuse existing services safely.
 * Requires PostgreSQL + Redis. Gmail uses the mocked provider boundary
 * (no live Google). Isolation: users `p10test-<name>-<ts>`.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { prisma } from "@jobcopilot/db";
import { encryptToken } from "../src/integrations/crypto.js";
import { gmailProvider } from "../src/integrations/gmail/provider.js";
import { registerDefaultSources } from "../src/sources/index.js";
import { processIngestionJob } from "../src/queues/ingestion.js";
import { processMatchingJob } from "../src/queues/matching.js";
import { processGmailSyncJob } from "../src/queues/gmail-sync.js";
import { processNotificationJob } from "../src/queues/notifications.js";
import { processAnalyticsJob } from "../src/queues/analytics.js";
import {
  closeRegistry,
  enqueueGmailSync,
  enqueueIngestion,
  enqueueMatching,
  enqueueNotification,
  enqueueAnalytics,
  getQueue,
  initRegistry,
} from "@jobcopilot/queues";

const DB = Boolean(process.env.DATABASE_URL);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const TS = Date.now();
const U = (name: string) => `p10test-${name}-${TS}`;

const ORIGINAL_KEY = process.env.INTEGRATION_ENCRYPTION_KEY;

beforeAll(async () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef";
  registerDefaultSources();
  if (!DB) return;
  initRegistry(REDIS_URL);
});

afterEach(() => {
  gmailProvider.setFetchImplForTests(undefined);
  if (ORIGINAL_KEY === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
  else process.env.INTEGRATION_ENCRYPTION_KEY = ORIGINAL_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef";
});

afterAll(async () => {
  if (ORIGINAL_KEY === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
  else process.env.INTEGRATION_ENCRYPTION_KEY = ORIGINAL_KEY;
  if (!DB) return;
  await prisma.user.deleteMany({ where: { id: { startsWith: "p10test-" } } });
  await closeRegistry().catch(() => undefined);
  await prisma.$disconnect();
});

async function seedUser(name: string) {
  const userId = U(name);
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `${userId}@jobcopilot.local` },
  });
  return userId;
}

/** Permanent failures carry the safe code on the error (not in the message). */
async function permanentCodeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "NO_THROW";
  } catch (err) {
    return (err as { code?: unknown })?.code === undefined
      ? `STATUS_${(err as { status?: unknown })?.status ?? "unknown"}`
      : String((err as { code: unknown }).code);
  }
}

async function seedProfile(userId: string) {
  await prisma.profile.upsert({
    where: { userId },
    update: { targetRoles: ["Backend Engineer"], skills: ["TypeScript", "APIs"] },
    create: { userId, targetRoles: ["Backend Engineer"], skills: ["TypeScript", "APIs"] },
  });
}

function mockGmailFetch() {
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "mock-access", expires_in: 3600 }), { status: 200 });
    }
    if (u.includes("/messages?")) {
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  gmailProvider.setFetchImplForTests(fetchImpl);
}

async function seedConnectedGmail(userId: string) {
  mockGmailFetch();
  const tokens = {
    access: encryptToken("mock-access"),
    refresh: encryptToken("mock-refresh"),
    obtainedAt: new Date().toISOString(),
  };
  const row = await prisma.integration.upsert({
    where: { userId_provider: { userId, provider: "google-gmail" } },
    update: { encryptedToken: tokens as never, status: "CONNECTED", accountEmail: "t@gmail.com", scopes: ["openid", "email"] },
    create: { userId, provider: "google-gmail", encryptedToken: tokens as never, status: "CONNECTED", accountEmail: "t@gmail.com", scopes: ["openid", "email"] },
  });
  return row.id;
}

describe.skipIf(!DB)("ingestion processor", () => {
  it("ingests demo jobs idempotently and rejects unknown sources/users", async () => {
    const userId = await seedUser("ingest");
    const before = await prisma.job.count({ where: { userId } });
    const first = await processIngestionJob({ userId, source: "demo", limit: 10, idempotencyKey: "i1" });
    expect(first.inserted).toBeGreaterThan(0);
    expect(await prisma.job.count({ where: { userId } })).toBe(before + first.inserted);
    const second = await processIngestionJob({ userId, source: "demo", limit: 10, idempotencyKey: "i1" });
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBeGreaterThan(0);
    expect(await prisma.job.count({ where: { userId } })).toBe(before + first.inserted);
    await expect(processIngestionJob({ userId, source: "linkedin", limit: 5, idempotencyKey: "i2" })).rejects.toThrow();
    expect(await permanentCodeOf(processIngestionJob({ userId: U("ghost"), source: "demo", limit: 5, idempotencyKey: "i3" }))).toBe("USER_NOT_FOUND");
    expect(await permanentCodeOf(processIngestionJob({ userId, limit: 5 } as never))).toBe("INVALID_PAYLOAD");
  });
});

describe.skipIf(!DB)("matching processor", () => {
  it("matches idempotently and skips foreign jobs", async () => {
    const userId = await seedUser("match");
    await seedProfile(userId);
    const otherId = await seedUser("matchOther");
    const foreign = await prisma.job.create({
      data: {
        userId: otherId,
        companyName: "Other",
        normalizedCompany: "other",
        sourceKey: "manual",
        title: "Backend Engineer",
        normalizedTitle: "backend engineer",
        description: "APIs in TypeScript.",
      },
    });
    const own = await prisma.job.create({
      data: {
        userId,
        companyName: "Acme",
        normalizedCompany: "acme",
        sourceKey: "manual",
        title: "Backend Engineer",
        normalizedTitle: "backend engineer",
        description: "APIs in TypeScript.",
      },
    });
    const first = await processMatchingJob({ userId, limit: 10, idempotencyKey: "m1" });
    expect(first.matched).toBeGreaterThanOrEqual(1);
    expect(await prisma.jobMatch.count({ where: { userId } })).toBe(first.matched);
    const second = await processMatchingJob({ userId, limit: 10, idempotencyKey: "m1" });
    expect(await prisma.jobMatch.count({ where: { userId } })).toBe(first.matched);
    expect(second.matched).toBe(first.matched);
    const subset = await processMatchingJob({ userId, jobIds: [own.id, foreign.id], idempotencyKey: "m2" });
    expect(subset).toEqual({ matched: 1, skipped: 1, mode: "deterministic" });
    expect(await prisma.jobMatch.count({ where: { userId, jobId: foreign.id } })).toBe(0);
    expect(await permanentCodeOf(
      processMatchingJob({ userId, mode: "llm" as never, idempotencyKey: "m3" }),
    )).toBe("INVALID_PAYLOAD");
  });
});

describe.skipIf(!DB)("notification processor", () => {
  it("creates once, enforces ownership, stays idempotent", async () => {
    const userId = await seedUser("notify");
    const first = await processNotificationJob({ userId, type: "test", title: "Hello", idempotencyKey: "n1" });
    expect(first.created).toBe(true);
    const second = await processNotificationJob({ userId, type: "test", title: "Hello", idempotencyKey: "n1" });
    expect(second).toEqual({ created: false, notificationId: first.notificationId });
    expect(await prisma.notification.count({ where: { userId, title: "Hello" } })).toBe(1);
    const otherId = await seedUser("notifyOther");
    const app = await prisma.application.create({
      data: {
        userId: otherId,
        jobId: (
          await prisma.job.create({
            data: { userId: otherId, companyName: "X", normalizedCompany: "x", sourceKey: "manual", title: "T", normalizedTitle: "t", description: "d" },
          })
        ).id,
      },
    });
    expect(await permanentCodeOf(
      processNotificationJob({ userId, type: "test", title: "X", applicationId: app.id, idempotencyKey: "n2" }),
    )).toBe("NOT_FOUND");
  });
});

describe.skipIf(!DB)("gmail processor", () => {
  it("syncs via the mocked boundary and enforces ownership/connection", async () => {
    const userId = await seedUser("gmail");
    const integrationId = await seedConnectedGmail(userId);
    const summary = await processGmailSyncJob({ userId, integrationId, maxMessages: 5, idempotencyKey: "g1" });
    expect(summary.synced).toBe(0);
    const otherId = await seedUser("gmailOther");
    expect(await permanentCodeOf(
      processGmailSyncJob({ userId: otherId, integrationId, maxMessages: 5, idempotencyKey: "g2" }),
    )).toBe("INTEGRATION_NOT_FOUND");
    await prisma.integration.update({ where: { id: integrationId }, data: { status: "DISCONNECTED" } });
    expect(await permanentCodeOf(
      processGmailSyncJob({ userId, integrationId, maxMessages: 5, idempotencyKey: "g3" }),
    )).toBe("INTEGRATION_NOT_CONNECTED");
  });
});

describe.skipIf(!DB)("analytics processor", () => {
  it("acknowledges without persisting PII", async () => {
    const userId = await seedUser("analytics");
    expect(await processAnalyticsJob({ userId, eventType: "test-event", idempotencyKey: "a1" })).toEqual({
      recorded: false,
      reason: expect.stringContaining("deferred"),
    });
    expect(await processAnalyticsJob({ userId: "system", eventType: "scheduled-rollup", idempotencyKey: "a2" })).toEqual({
      recorded: false,
      reason: expect.stringContaining("deferred"),
    });
  });
});

describe.skipIf(!DB)("queue payload hygiene", () => {
  it("stores references only — no tokens, secrets, or bodies in Redis", async () => {
    const userId = await seedUser("hygiene");
    const integrationId = await seedConnectedGmail(userId);
    const enqueued = [
      await enqueueIngestion({ userId, source: "demo", limit: 5, idempotencyKey: `h1-${TS}` }),
      await enqueueMatching({ userId, limit: 5, idempotencyKey: `h2-${TS}` }),
      await enqueueGmailSync({ userId, integrationId, maxMessages: 5, idempotencyKey: `h3-${TS}` }),
      await enqueueNotification({ userId, type: "t", title: "ti", idempotencyKey: `h4-${TS}` }),
      await enqueueAnalytics({ userId, eventType: "e", idempotencyKey: `h5-${TS}` }),
    ];
    for (const e of enqueued) {
      const job = await getQueue(e.queue).getJob(e.jobId);
      expect(job).not.toBeNull();
      const dump = JSON.stringify(job!.data);
      expect(dump).not.toMatch(/accessToken|refreshToken|secret|cookie|password|authorization|bearer/i);
      expect(Object.keys(job!.data as Record<string, unknown>).sort()).not.toContain("tokens");
      await job!.remove().catch(() => undefined);
    }
  });
});
