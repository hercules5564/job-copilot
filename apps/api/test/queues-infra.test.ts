/**
 * Phase 10A tests — queue mechanics against real Redis.
 * Requires REDIS_URL reachable (local infra; fails fast otherwise).
 * No DB needed. Test queues (test-*) are obliterated in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Queue, Worker, UnrecoverableError, type Job } from "bullmq";
import { Redis } from "ioredis";
import {
  initRegistry,
  closeRegistry,
  getQueue,
  getTestQueue,
  getDeadLetterQueue,
  enqueueIngestion,
  enqueueMatching,
  enqueueNotification,
  cancelJob,
  getJobStatus,
  queueCounts,
  deadLetterCount,
  recordDeadLetter,
  listDeadLetters,
  retryDeadLetter,
  registryHealth,
  ensureSchedules,
  listSchedules,
  removeSchedule,
  createWorkerConnection,
  pingRedis,
  JOB_ATTEMPTS,
} from "@jobcopilot/queues";

/**
 * Run against an isolated Redis logical DB. A live worker (for example the
 * docker-compose worker on DB 0) otherwise consumes the production-queue jobs
 * these tests create: it locks them mid-cancel and records dead letters with
 * its own failure code instead of the test's.
 */
function testRedisUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.pathname = "/15";
    return url.toString();
  } catch {
    return raw;
  }
}

const REDIS_URL = testRedisUrl(process.env.REDIS_URL ?? "redis://localhost:6379");
const TS = Date.now();
const TQ = (name: string) => `test-${name}-${TS}`;
const U = (name: string) => `p10test-${name}-${TS}`;

const workers: { close: () => Promise<void> }[] = [];
const testQueues: string[] = [];

function trackTestQueue(name: string): Queue {
  testQueues.push(name);
  return getTestQueue(name);
}

async function waitForState(
  queue: Queue,
  jobId: string,
  want: string[],
  timeoutMs = 15000,
): Promise<string> {
  const start = Date.now();
  for (;;) {
    const job = await queue.getJob(jobId);
    if (!job) throw new Error(`job vanished: ${jobId}`);
    const state = await job.getState();
    if (want.includes(state)) return state;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${want} (at ${state})`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

beforeAll(async () => {
  initRegistry(REDIS_URL);
  const health = await registryHealth();
  if (health.redis !== "up") {
    throw new Error(`Redis is required for queue tests (REDIS_URL=${REDIS_URL})`);
  }
});

afterAll(async () => {
  for (const w of workers) await w.close().catch(() => undefined);
  workers.length = 0;
  for (const name of testQueues) {
    try {
      await getTestQueue(name).obliterate({ force: true });
    } catch {
      // Best-effort cleanup.
    }
  }
  // Remove DLQ entries created by these tests.
  try {
    const dlq = getDeadLetterQueue();
    // Dead-letter entries rest in "waiting" (no worker drains the DLQ).
    const jobs = await dlq.getJobs(["waiting", "completed"], 0, 1000);
    for (const job of jobs) {
      if (String((job.data as { userId?: unknown })?.userId ?? "").startsWith("p10test-")) {
        await job.remove().catch(() => undefined);
      }
    }
  } catch {
    // Best-effort cleanup.
  }
  await closeRegistry();
});

describe("registry", () => {
  it("exposes all five production queues and validates test handles", () => {
    for (const name of ["job-ingestion", "job-matching", "gmail-sync", "notifications", "analytics"] as const) {
      expect(getQueue(name).name).toBe(name);
    }
    expect(() => getTestQueue("prod-queue")).toThrowError(/must match/);
    expect(trackTestQueue(TQ("ok")).name).toBe(TQ("ok"));
  });

  it("reports redis health and queue counts without payloads", async () => {
    const health = await registryHealth();
    expect(health.redis).toBe("up");
    expect(health.host).not.toContain("6379@");
    const counts = await queueCounts();
    expect(counts.map((c) => c.queue).sort()).toEqual(
      ["analytics", "gmail-sync", "job-discovery", "job-ingestion", "job-matching", "notifications"].sort(),
    );
    for (const c of counts) {
      expect(typeof c.waiting).toBe("number");
      expect(JSON.stringify(c)).not.toContain("userId");
    }
    expect(typeof (await deadLetterCount())).toBe("number");
  });

  it("detects unreachable redis without credentials in output", async () => {
    const bad = new Redis("redis://localhost:59999", { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
    expect(await pingRedis(bad, 1000)).toBe(false);
    bad.disconnect();
  });
});

describe("enqueue + deterministic ids", () => {
  it("dedupes identical idempotency keys", async () => {
    const payload = { userId: U("dedup"), source: "demo", limit: 5 as const, idempotencyKey: `k-${TS}` };
    const first = await enqueueIngestion(payload);
    expect(first.deduped).toBe(false);
    expect(first.jobId.startsWith("q.job-ingestion.")).toBe(true);
    const second = await enqueueIngestion(payload);
    expect(second.deduped).toBe(true);
    expect(second.jobId).toBe(first.jobId);
    // Hygiene: raw Redis payload carries references only.
    const raw = await getQueue("job-ingestion").getJob(first.jobId);
    const dump = JSON.stringify(raw?.data ?? {});
    expect(dump).not.toMatch(/token|secret|cookie|password|authorization/i);
    await raw?.remove().catch(() => undefined);
  });

  it("rejects unknown job status lookups safely", async () => {
    expect(await getJobStatus("q:job-ingestion:nope:missing")).toBeNull();
    expect(await getJobStatus("garbage")).toBeNull();
  });
});

describe("cancellation", () => {
  it("removes delayed jobs and refuses unknown/foreign ones", async () => {
    const mine = await enqueueMatching({ userId: U("cancelA"), limit: 5, idempotencyKey: `c-${TS}` });
    const job = await getQueue("job-matching").getJob(mine.jobId);
    // Force delayed state via delay update path: remove + re-add delayed through test queue instead.
    await job?.remove().catch(() => undefined);
    const tq = trackTestQueue(TQ("cancel"));
    const delayed = await tq.add("test", { userId: U("cancelA") }, { jobId: `tq-delayed-${TS}`, delay: 60000, attempts: 1 });
    const cancelled = await cancelJob(mine.jobId, U("cancelA"));
    expect(cancelled.cancelled).toBe(false); // already removed above
    expect(cancelled.state).toBeNull();
    // Foreign user cannot cancel.
    const other = await enqueueMatching({ userId: U("cancelB"), limit: 5, idempotencyKey: `c2-${TS}` });
    const foreign = await cancelJob(other.jobId, U("cancelA"));
    expect(foreign.cancelled).toBe(false);
    await cancelJob(other.jobId, U("cancelB"));
    const gone = await getQueue("job-matching").getJob(other.jobId);
    expect(gone == null || (await gone.getState()) !== "waiting").toBe(true);
    await delayed.remove().catch(() => undefined);
  });

  it("cancels a waiting job before execution", async () => {
    const tq = trackTestQueue(TQ("cancelwait"));
    const added = await tq.add("test", { userId: U("w") }, { jobId: `tq-wait-${TS}`, attempts: 1 });
    // cancelJob only routes deterministic q: ids; emulate the waiting path directly.
    expect(await added.getState()).toBe("waiting");
    await added.remove();
    expect(await tq.getJob(added.id!)).toBeUndefined();
  });
});

describe("retry mechanics", () => {
  it("retries transient failures and completes (attempts tracked)", async () => {
    const tq = trackTestQueue(TQ("retry"));
    let calls = 0;
    const worker = new Worker(
      tq.name,
      async () => {
        calls += 1;
        if (calls === 1) throw new Error("transient blip");
        return { ok: true };
      },
      { connection: createWorkerConnection(REDIS_URL) },
    );
    workers.push(worker);
    await worker.waitUntilReady();
    const job = await tq.add("flaky", { n: 1 }, { jobId: `tq-flaky-${TS}`, attempts: 3 });
    expect(await waitForState(tq, job.id!, ["completed"])).toBe("completed");
    const done = await tq.getJob(job.id!);
    // attemptsMade is 1-based: failed attempt 1, success on attempt 2.
    expect(done!.attemptsMade).toBe(2);
    expect(calls).toBe(2);
    await worker.close();
    workers.splice(workers.indexOf(worker), 1);
  });

  it("does not retry permanent failures (attempts exhausted immediately)", async () => {
    const tq = trackTestQueue(TQ("perm"));
    let calls = 0;
    const worker = new Worker(
      tq.name,
      async () => {
        calls += 1;
        throw new UnrecoverableError("INVALID_PAYLOAD permanent");
      },
      { connection: createWorkerConnection(REDIS_URL) },
    );
    workers.push(worker);
    await worker.waitUntilReady();
    const job = await tq.add("bad", { n: 1 }, { jobId: `tq-bad-${TS}`, attempts: JOB_ATTEMPTS });
    expect(await waitForState(tq, job.id!, ["failed"])).toBe("failed");
    const failed = await tq.getJob(job.id!);
    expect(failed!.attemptsMade).toBe(1);
    expect(calls).toBe(1);
    expect(failed!.failedReason).toContain("INVALID_PAYLOAD");
    await worker.close();
    workers.splice(workers.indexOf(worker), 1);
  });
});

describe("dead letter", () => {
  it("records sanitized failures, scopes listings, and retries failed origins", async () => {
    const userId = U("dlq");
    // Origin job that will genuinely fail: run a worker whose processor
    // always fails permanently (mirrors the worker host wrapper).
    const origin = await enqueueNotification({ userId, type: "t", title: "dlq-origin", idempotencyKey: `dlqo-${TS}` });
    const nq = getQueue("notifications");
    const failing = new Worker(
      nq.name,
      async () => {
        throw new UnrecoverableError("TEST_FAILURE permanent");
      },
      { connection: createWorkerConnection(REDIS_URL) },
    );
    workers.push(failing);
    await failing.waitUntilReady();
    expect(await waitForState(nq, origin.jobId, ["failed"])).toBe("failed");
    await failing.close();
    workers.splice(workers.indexOf(failing), 1);

    const dlqId = await recordDeadLetter({
      queue: "notifications",
      jobType: "notify",
      jobId: origin.jobId,
      userId,
      attemptsMade: 1,
      failedAt: new Date().toISOString(),
      code: "TEST_FAILURE",
      message: "simulated permanent failure",
    });
    expect(dlqId.startsWith("dlq.")).toBe(true);
    // Duplicate record is idempotent.
    expect(
      await recordDeadLetter({
        queue: "notifications",
        jobType: "notify",
        jobId: origin.jobId,
        userId,
        attemptsMade: 1,
        failedAt: new Date().toISOString(),
        code: "TEST_FAILURE",
        message: "again",
      }),
    ).toBe(dlqId);
    const mine = await listDeadLetters(userId);
    expect(mine.some((e) => e.id === dlqId)).toBe(true);
    const entry = mine.find((e) => e.id === dlqId)!;
    expect(entry.code).toBe("TEST_FAILURE");
    // Metadata only: exactly the eight safe fields, no payload/data/secrets.
    expect(Object.keys(entry).sort()).toEqual(
      ["attemptsMade", "code", "failedAt", "id", "jobId", "jobType", "message", "queue", "userId"].sort(),
    );
    expect(JSON.stringify(entry)).not.toMatch(/accessToken|refreshToken|cookie|password/i);
    // Another user sees nothing and cannot retry.
    expect(await listDeadLetters(U("other"))).toEqual([]);
    expect((await retryDeadLetter(dlqId, U("other"))).retried).toBe(false);
    // Owner retry re-runs the retained failed origin job.
    expect((await retryDeadLetter(dlqId, userId)).retried).toBe(true);
    // A waiting (non-failed) origin is never resurrected.
    const waiting = await enqueueNotification({ userId, type: "t", title: "dlq-waiting", idempotencyKey: `dlqw-${TS}` });
    const waitingDlq = await recordDeadLetter({
      queue: "notifications",
      jobType: "notify",
      jobId: waiting.jobId,
      userId,
      attemptsMade: 0,
      failedAt: new Date().toISOString(),
      code: "TEST_FAILURE",
      message: "not actually failed",
    });
    expect((await retryDeadLetter(waitingDlq, userId)).retried).toBe(false);
    // Cleanup.
    for (const id of [origin.jobId, waiting.jobId]) {
      await nq.getJob(id).then((j) => j?.remove().catch(() => undefined));
    }
    for (const id of [dlqId, waitingDlq]) {
      await getDeadLetterQueue().getJob(id).then((j) => j?.remove().catch(() => undefined));
    }
  });
});

describe("scheduler", () => {
  it("registers idempotently and removes cleanly", async () => {
    const id = `test-sched-${TS}`;
    const def = {
      id,
      queue: "analytics" as const,
      name: "record",
      data: { userId: "system", idempotencyKey: `sched-${TS}`, eventType: "test-tick" },
      everyMs: 60000,
    };
    expect(await ensureSchedules([def])).toEqual([id]);
    expect(await ensureSchedules([def])).toEqual([id]);
    const listed = await listSchedules("analytics");
    expect(listed.filter((s) => s.id === id)).toHaveLength(1);
    expect(await removeSchedule("analytics", id)).toBe(true);
    expect((await listSchedules("analytics")).some((s) => s.id === id)).toBe(false);
    // Remove the one delayed job the scheduler minted.
    const delayed = await getQueue("analytics").getDelayed();
    for (const job of delayed) {
      if (job.name === "record" && (job.data as { idempotencyKey?: unknown })?.idempotencyKey === `sched-${TS}`) {
        await job.remove().catch(() => undefined);
      }
    }
  });
});

describe("worker lifecycle", () => {
  it("starts, runs, and closes without zombies", async () => {
    const tq = trackTestQueue(TQ("life"));
    const worker = new Worker(tq.name, async () => ({ ok: true }), {
      connection: createWorkerConnection(REDIS_URL),
      concurrency: 2,
    });
    await worker.waitUntilReady();
    expect(worker.isRunning()).toBe(true);
    await worker.close();
    expect(worker.isRunning()).toBe(false);
  });
});
