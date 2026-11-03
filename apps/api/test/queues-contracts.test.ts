/**
 * Phase 10A tests — contracts, ids, env, error classification.
 * Pure unit tests: no Redis, no DB. Run everywhere.
 */
import { describe, it, expect } from "vitest";
import { UnrecoverableError } from "bullmq";
import {
  JOB_TYPE_BY_QUEUE,
  QueueJobTypeSchema,
  QueueNameSchema,
  IngestionJobPayloadSchema,
  MatchingJobPayloadSchema,
  GmailSyncJobPayloadSchema,
  NotificationJobPayloadSchema,
  AnalyticsJobPayloadSchema,
  CancelQueuedJobSchema,
  RetryDeadLetterSchema,
} from "@jobcopilot/shared";
import {
  deterministicJobId,
  queueFromJobId,
  deadLetterId,
  classifyWorkerError,
  permanent,
  sanitizeErrorMessage,
  phaseBackoffDelays,
  loadQueueEnv,
} from "@jobcopilot/queues";

describe("closed queue registry", () => {
  it("accepts the five queues and rejects arbitrary names", () => {
    expect(QueueNameSchema.safeParse("job-ingestion").success).toBe(true);
    expect(QueueNameSchema.safeParse("gmail-sync").success).toBe(true);
    expect(QueueNameSchema.safeParse("billing").success).toBe(false);
    expect(QueueNameSchema.safeParse("__proto__").success).toBe(false);
    expect(QueueNameSchema.safeParse("").success).toBe(false);
  });

  it("maps every queue to exactly one job type", () => {
    expect(Object.keys(JOB_TYPE_BY_QUEUE).sort()).toEqual(
      ["analytics", "gmail-sync", "job-discovery", "job-ingestion", "job-matching", "notifications"].sort(),
    );
    for (const type of Object.values(JOB_TYPE_BY_QUEUE)) {
      expect(QueueJobTypeSchema.safeParse(type).success).toBe(true);
    }
  });
});

describe("payload contracts", () => {
  it("accepts valid payloads and rejects missing/oversized fields", () => {
    expect(
      IngestionJobPayloadSchema.safeParse({ userId: "u", source: "demo", idempotencyKey: "k" }).success,
    ).toBe(true);
    expect(
      IngestionJobPayloadSchema.safeParse({ source: "demo", idempotencyKey: "k" }).success,
    ).toBe(false);
    expect(
      IngestionJobPayloadSchema.safeParse({ userId: "u", source: "demo", limit: 51, idempotencyKey: "k" }).success,
    ).toBe(false);
    expect(
      MatchingJobPayloadSchema.safeParse({ userId: "u", mode: "llm", idempotencyKey: "k" }).success,
    ).toBe(false);
    expect(
      MatchingJobPayloadSchema.safeParse({ userId: "u", mode: "hybrid", jobIds: new Array(51).fill("j"), idempotencyKey: "k" }).success,
    ).toBe(false);
    expect(
      GmailSyncJobPayloadSchema.safeParse({ userId: "u", integrationId: "i", maxMessages: 101, idempotencyKey: "k" }).success,
    ).toBe(false);
    expect(
      NotificationJobPayloadSchema.safeParse({ userId: "u", type: "t", idempotencyKey: "k" }).success,
    ).toBe(false);
    expect(
      AnalyticsJobPayloadSchema.safeParse({ userId: "u", idempotencyKey: "k" }).success,
    ).toBe(false);
    expect(CancelQueuedJobSchema.safeParse({ jobId: "q:x" }).success).toBe(true);
    expect(CancelQueuedJobSchema.safeParse({}).success).toBe(false);
    expect(RetryDeadLetterSchema.safeParse({ dlqJobId: "d" }).success).toBe(true);
  });

  it("carries no credential fields by construction", () => {
    const shapes = [
      IngestionJobPayloadSchema,
      MatchingJobPayloadSchema,
      GmailSyncJobPayloadSchema,
      NotificationJobPayloadSchema,
      AnalyticsJobPayloadSchema,
    ];
    for (const shape of shapes) {
      const keys = Object.keys((shape as unknown as { shape: Record<string, unknown> }).shape ?? {});
      for (const banned of ["token", "secret", "cookie", "password"]) {
        expect(keys.some((k) => k.toLowerCase().includes(banned))).toBe(false);
      }
    }
  });
});

describe("deterministic job ids", () => {
  it("is stable, routable, and rejects junk", () => {
    const id = deterministicJobId("job-matching", "user-1", "key-1");
    expect(id).toBe(deterministicJobId("job-matching", "user-1", "key-1"));
    expect(queueFromJobId(id)).toBe("job-matching");
    expect(queueFromJobId("q.billing.u.k")).toBeNull();
    expect(queueFromJobId("garbage")).toBeNull();
    expect(queueFromJobId("")).toBeNull();
    expect(deadLetterId(id).startsWith("dlq.")).toBe(true);
  });
});

describe("worker error classification", () => {
  it("retries transient failures", () => {
    for (const err of [
      Object.assign(new Error("too many"), { status: 429 }),
      Object.assign(new Error("bad gateway"), { status: 502 }),
      Object.assign(new Error("boom"), { status: 500 }),
      Object.assign(new Error("conn refused"), { code: "ECONNREFUSED" }),
      Object.assign(new Error("timeout"), { code: "P1001" }),
      new Error("mysterious failure"),
    ]) {
      expect(classifyWorkerError(err).retryable).toBe(true);
    }
  });

  it("never retries permanent and forbidden failures", () => {
    expect(classifyWorkerError(Object.assign(new Error("bad"), { status: 400 })).retryable).toBe(false);
    expect(classifyWorkerError(Object.assign(new Error("missing"), { status: 404 })).retryable).toBe(false);
    expect(classifyWorkerError(Object.assign(new Error("dup"), { code: "P2002" })).retryable).toBe(false);
    expect(classifyWorkerError(permanent("X", "nope")).retryable).toBe(false);
    expect(classifyWorkerError(new UnrecoverableError("stop")).retryable).toBe(false);
    for (const msg of ["CAPTCHA detected", "LOGIN_REQUIRED", "ACCESS_DENIED", "unsupported_sensitive_field", "Validation failed"]) {
      expect(classifyWorkerError(new Error(msg)).retryable).toBe(false);
    }
  });

  it("sanitizes messages to 300 chars", () => {
    expect(sanitizeErrorMessage(new Error("x".repeat(500))).length).toBe(300);
    expect(sanitizeErrorMessage(null)).toBe("Unknown error");
  });

  it("uses the 1s/5s/25s backoff schedule", () => {
    expect(phaseBackoffDelays(1)).toBe(1000);
    expect(phaseBackoffDelays(2)).toBe(5000);
    expect(phaseBackoffDelays(3)).toBe(25000);
    expect(phaseBackoffDelays(99)).toBe(25000);
  });
});

describe("queue env", () => {
  it("applies safe defaults and rejects bad concurrency", () => {
    const env = loadQueueEnv({ REDIS_URL: "redis://localhost:6379" } as NodeJS.ProcessEnv);
    expect(env.QUEUE_GMAIL_CONCURRENCY).toBe(1);
    expect(env.QUEUE_INGESTION_CONCURRENCY).toBe(2);
    expect(env.WORKER_ENABLED).toBe(true);
    expect(env.QUEUE_SCHEDULE_ANALYTICS).toBe(false);
    expect(() => loadQueueEnv({ REDIS_URL: "redis://x", QUEUE_GMAIL_CONCURRENCY: "99" } as unknown as NodeJS.ProcessEnv)).toThrow();
  });
});
