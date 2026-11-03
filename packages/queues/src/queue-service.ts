import type { Job, JobsOptions } from "bullmq";
import {
  JOB_TYPE_BY_QUEUE,
  type AnalyticsJobPayload,
  type DeadLetterEntry,
  type DiscoveryJobPayload,
  type GmailSyncJobPayload,
  type IngestionJobPayload,
  type MatchingJobPayload,
  type NotificationJobPayload,
  type QueueJobType,
  type QueueName,
} from "@jobcopilot/shared";
import { deadLetterId, deterministicJobId, queueFromJobId, DEAD_LETTER_QUEUE } from "./job-ids.js";
import { getDeadLetterQueue, getQueue, QUEUE_NAMES } from "./queue-registry.js";
import { sanitizeErrorMessage } from "./worker-errors.js";

/**
 * Phase 10A — centralized producers + job lifecycle helpers.
 * API routes/services use ONLY this module (never BullMQ directly).
 *
 * Retry policy: attempts=3, custom 1s/5s/25s backoff (strategy registered
 * on workers as type "custom"). Retention: completed 200, failed 500 —
 * failed jobs stay inspectable for DLQ retry.
 */

export const JOB_ATTEMPTS = 3;
export const REMOVE_ON_COMPLETE = { count: 200 } as const;
export const REMOVE_ON_FAIL = { count: 500 } as const;

/**
 * Custom backoff schedule: 1s → 5s → 25s. Referenced by job options as
 * type "custom"; workers register this function as their backoffStrategy.
 */
export function phaseBackoffDelays(attemptsMade: number): number {
  const schedule = [1000, 5000, 25000];
  return schedule[Math.min(Math.max(attemptsMade - 1, 0), schedule.length - 1)];
}

function defaultJobOptions(jobId: string): JobsOptions {
  return {
    jobId,
    attempts: JOB_ATTEMPTS,
    backoff: { type: "custom" },
    removeOnComplete: { ...REMOVE_ON_COMPLETE },
    removeOnFail: { ...REMOVE_ON_FAIL },
  };
}

export interface EnqueueResult {
  jobId: string;
  queue: QueueName;
  /** True when an identical idempotency key was already queued. */
  deduped: boolean;
}

function logQueue(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: "info", component: "queue-service", event, ...fields }));
}

async function enqueue(
  queueName: QueueName,
  payload: { userId: string; idempotencyKey: string } & Record<string, unknown>,
  extraOpts: Partial<JobsOptions> = {},
): Promise<EnqueueResult> {
  const queue = getQueue(queueName);
  const jobType: QueueJobType = JOB_TYPE_BY_QUEUE[queueName];
  const jobId = deterministicJobId(queueName, payload.userId, payload.idempotencyKey);
  const existing = await queue.getJob(jobId);
  if (existing) {
    return { jobId, queue: queueName, deduped: true };
  }
  await queue.add(jobType, payload, { ...defaultJobOptions(jobId), ...extraOpts });
  logQueue("job_enqueued", { queue: queueName, jobType, jobId, userId: payload.userId });
  return { jobId, queue: queueName, deduped: false };
}

export function enqueueIngestion(payload: IngestionJobPayload): Promise<EnqueueResult> {
  return enqueue("job-ingestion", payload);
}

export function enqueueMatching(payload: MatchingJobPayload): Promise<EnqueueResult> {
  return enqueue("job-matching", payload);
}

export function enqueueGmailSync(payload: GmailSyncJobPayload): Promise<EnqueueResult> {
  return enqueue("gmail-sync", payload);
}

export function enqueueNotification(payload: NotificationJobPayload): Promise<EnqueueResult> {
  return enqueue("notifications", payload);
}

export function enqueueAnalytics(payload: AnalyticsJobPayload): Promise<EnqueueResult> {
  return enqueue("analytics", payload);
}

export function enqueueDiscovery(payload: DiscoveryJobPayload): Promise<EnqueueResult> {
  return enqueue("job-discovery", payload);
}

export interface JobStatus {
  jobId: string;
  queue: QueueName;
  userId: string | null;
  state: string;
  attemptsMade: number;
  failedReason: string | null;
  finishedOn: number | null;
  processedOn: number | null;
}

function toStatus(queue: QueueName, job: Job): JobStatus {
  return {
    jobId: job.id ?? "",
    queue,
    userId: typeof (job.data as { userId?: unknown })?.userId === "string"
      ? ((job.data as { userId: string }).userId)
      : null,
    state: "unknown",
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason ? sanitizeErrorMessage(job.failedReason) : null,
    finishedOn: job.finishedOn ?? null,
    processedOn: job.processedOn ?? null,
  };
}

/** Look up a job by deterministic id (queue parsed from the id). */
export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  const queueName = queueFromJobId(jobId);
  if (!queueName) return null;
  const job = await getQueue(queueName).getJob(jobId);
  if (!job) return null;
  const status = toStatus(queueName, job);
  status.state = await job.getState();
  return status;
}

export interface CancelResult {
  jobId: string;
  cancelled: boolean;
  state: string | null;
}

/**
 * Safe cancellation: removes waiting/delayed/prioritized jobs.
 * Active jobs cannot be preempted — reported honestly, never killed.
 */
export async function cancelJob(jobId: string, requesterUserId: string): Promise<CancelResult> {
  const queueName = queueFromJobId(jobId);
  if (!queueName) return { jobId, cancelled: false, state: null };
  const job = await getQueue(queueName).getJob(jobId);
  if (!job) return { jobId, cancelled: false, state: null };
  if ((job.data as { userId?: unknown })?.userId !== requesterUserId) {
    return { jobId, cancelled: false, state: null };
  }
  const state = await job.getState();
  if (state === "waiting" || state === "delayed" || state === "prioritized") {
    await job.remove();
    logQueue("job_cancelled", { queue: queueName, jobId, userId: requesterUserId, state });
    return { jobId, cancelled: true, state };
  }
  return { jobId, cancelled: false, state };
}

export interface QueueCounts {
  queue: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

/** Operational counts (no payloads) for health/observability. */
export async function queueCounts(): Promise<QueueCounts[]> {
  const out: QueueCounts[] = [];
  for (const name of QUEUE_NAMES) {
    const counts = await getQueue(name).getJobCounts("waiting", "active", "completed", "failed", "delayed");
    out.push({
      queue: name,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
    });
  }
  return out;
}

// ---- dead letter ----

export interface DeadLetterRecord {
  id: string;
  queue: QueueName;
  jobType: QueueJobType;
  jobId: string;
  userId: string;
  attemptsMade: number;
  failedAt: string;
  code: string;
  message: string;
}

/**
 * Record a sanitized failure (called by the worker's failed-handler after
 * retries are exhausted). Stores metadata ONLY — never the job payload.
 */
export async function recordDeadLetter(record: Omit<DeadLetterRecord, "id">): Promise<string> {
  const dlq = getDeadLetterQueue();
  const id = deadLetterId(record.jobId);
  const existing = await dlq.getJob(id);
  if (existing) return id;
  await dlq.add(
    "dead-letter",
    {
      queue: record.queue,
      jobType: record.jobType,
      jobId: record.jobId,
      userId: record.userId,
      attemptsMade: record.attemptsMade,
      failedAt: record.failedAt,
      code: record.code,
      message: record.message,
    },
    { jobId: id, removeOnComplete: { count: 1000 }, removeOnFail: { count: 1000 } },
  );
  logQueue("dead_letter_recorded", {
    queue: record.queue,
    jobId: record.jobId,
    userId: record.userId,
    code: record.code,
  });
  return id;
}

/** List the requester's own dead-letter entries (newest first, bounded). */
export async function listDeadLetters(requesterUserId: string, limit = 50): Promise<DeadLetterEntry[]> {
  const dlq = getDeadLetterQueue();
  // DLQ entries rest in "waiting" state by design: no worker subscribes to
  // the dead-letter queue, so nothing ever picks them up for execution.
  const jobs = await dlq.getJobs(["waiting"], 0, Math.min(Math.max(limit, 1), 100));
  const entries: DeadLetterEntry[] = [];
  for (const job of jobs) {
    const d = job.data as Partial<DeadLetterRecord>;
    if (d.userId !== requesterUserId) continue;
    entries.push({
      id: job.id ?? "",
      queue: d.queue as QueueName,
      jobType: d.jobType as QueueJobType,
      jobId: d.jobId ?? "",
      userId: d.userId ?? "",
      attemptsMade: d.attemptsMade ?? 0,
      failedAt: d.failedAt ?? "",
      code: d.code ?? "UNKNOWN",
      message: d.message ?? "",
    });
  }
  return entries;
}

export async function deadLetterCount(): Promise<number> {
  const dlq = getDeadLetterQueue();
  const counts = await dlq.getJobCounts("waiting");
  return counts.waiting ?? 0;
}

/**
 * Retry from DLQ: re-runs the retained failed job in its origin queue.
 * Only the owning user may retry, and only jobs in failed state.
 * Returns false when the entry is foreign, the origin aged out of
 * retention, or the origin is not failed (safe outcomes, no resurrection).
 */
export async function retryDeadLetter(dlqJobId: string, requesterUserId: string): Promise<{ retried: boolean }> {
  const dlq = getDeadLetterQueue();
  const entry = await dlq.getJob(dlqJobId);
  if (!entry) return { retried: false };
  const d = entry.data as Partial<DeadLetterRecord>;
  if (d.userId !== requesterUserId || !d.queue || !d.jobId) return { retried: false };
  const queueName = queueFromJobId(d.jobId) ?? (d.queue as QueueName);
  if (!queueName || d.queue !== queueName) return { retried: false };
  const origin = await getQueue(queueName).getJob(d.jobId);
  if (!origin) return { retried: false };
  if ((origin.data as { userId?: unknown })?.userId !== requesterUserId) return { retried: false };
  if ((await origin.getState()) !== "failed") return { retried: false };
  await origin.retry();
  logQueue("dead_letter_retried", { queue: queueName, jobId: d.jobId, userId: requesterUserId });
  return { retried: true };
}

export { DEAD_LETTER_QUEUE };
