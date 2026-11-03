import { Job, Worker } from "bullmq";
import {
  JOB_TYPE_BY_QUEUE,
  type QueueJobType,
  type QueueName,
} from "@jobcopilot/shared";
import {
  classifyWorkerError,
  concurrencyFor,
  createWorkerConnection,
  phaseBackoffDelays,
  recordDeadLetter,
  sanitizeErrorMessage,
  toProcessorError,
  type QueueEnv,
} from "@jobcopilot/queues";
import { processIngestionJob } from "../../api/src/queues/ingestion.js";
import { processMatchingJob } from "../../api/src/queues/matching.js";
import { processGmailSyncJob } from "../../api/src/queues/gmail-sync.js";
import { processNotificationJob } from "../../api/src/queues/notifications.js";
import { processAnalyticsJob } from "../../api/src/queues/analytics.js";
import { runDiscoveryFromPayload } from "../../api/src/services/job-discovery.js";
import { setQueueHealth } from "./health-state.js";

/**
 * Phase 10A — worker registration. One BullMQ Worker per queue with the
 * closed job-type map (processors cannot be selected by user input).
 * Custom 1s/5s/25s backoff; exhausted jobs are recorded sanitized to DLQ.
 */

type ProcessorFn = (data: unknown) => Promise<unknown>;

const PROCESSORS: Record<QueueName, { jobType: QueueJobType; run: ProcessorFn }> = {
  "job-ingestion": { jobType: "ingest", run: processIngestionJob },
  "job-matching": { jobType: "match", run: processMatchingJob },
  "gmail-sync": { jobType: "sync", run: processGmailSyncJob },
  notifications: { jobType: "notify", run: processNotificationJob },
  analytics: { jobType: "record", run: processAnalyticsJob },
  "job-discovery": { jobType: "discover", run: runDiscoveryFromPayload as ProcessorFn },
};

export const QUEUE_LIST = Object.keys(PROCESSORS) as QueueName[];

function logWorker(event: string, fields: Record<string, unknown>): void {
  // Safe fields only: queue/jobType/jobId/attempt/duration/code. Never
  // payloads, stacks, tokens, or connection strings.
  console.log(JSON.stringify({ level: "info", component: "worker", event, ...fields }));
}

function userIdOf(job: Job): string {
  const userId = (job.data as { userId?: unknown })?.userId;
  return typeof userId === "string" ? userId : "unknown";
}

async function handleFailed(job: Job | undefined, err: Error, queue: QueueName): Promise<void> {
  if (!job?.id) return;
  // Permanent failures are recorded by the processor wrapper (which knows
  // the classification). This handler covers transient errors that exhaust
  // all attempts — the error round-trips through Redis, so only the
  // attempt count is trustworthy here.
  const maxAttempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < maxAttempts) return; // a retry is still scheduled
  const classified = classifyWorkerError(err);
  try {
    await recordDeadLetter({
      queue,
      jobType: JOB_TYPE_BY_QUEUE[queue],
      jobId: job.id,
      userId: userIdOf(job),
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString(),
      code: classified.code,
      message: classified.message,
    });
  } catch {
    // DLQ write is best-effort; the failed job itself is retained in Redis.
  }
}

export interface StartedWorkers {
  workers: Worker[];
  closeAll: () => Promise<void>;
}

export async function startWorkers(env: QueueEnv, redisUrl: string): Promise<StartedWorkers> {
  const workers: Worker[] = [];
  const health: { queue: string; state: "ready" | "error"; detail?: string }[] = [];
  for (const queue of QUEUE_LIST) {
    const { jobType, run } = PROCESSORS[queue];
    const connection = createWorkerConnection(redisUrl);
    const worker = new Worker(
      queue,
      async (job: Job) => {
        if (job.name !== jobType) {
          throw toProcessorError({ retryable: false, code: "UNKNOWN_JOB_TYPE", message: `Unexpected job type for ${queue}` });
        }
        const startedAt = Date.now();
        logWorker("job_started", { queue, jobType, jobId: job.id, attempt: job.attemptsMade + 1, userId: userIdOf(job) });
        try {
          const result = await run(job.data);
          logWorker("job_completed", {
            queue,
            jobType,
            jobId: job.id,
            durationMs: Date.now() - startedAt,
            userId: userIdOf(job),
          });
          return result;
        } catch (err) {
          const classified = classifyWorkerError(err);
          logWorker("job_failed", {
            queue,
            jobType,
            jobId: job.id,
            attempt: job.attemptsMade + 1,
            durationMs: Date.now() - startedAt,
            code: classified.code,
            message: classified.message,
            userId: userIdOf(job),
          });
          if (!classified.retryable && job.id) {
            // Permanent: no retry will happen, so record the DLQ entry now
            // while the classification is known (attemptsMade is 0-based
            // here, hence +1 for the final count).
            try {
              await recordDeadLetter({
                queue,
                jobType,
                jobId: job.id,
                userId: userIdOf(job),
                attemptsMade: job.attemptsMade + 1,
                failedAt: new Date().toISOString(),
                code: classified.code,
                message: classified.message,
              });
            } catch {
              // Best-effort; the failed job itself is retained in Redis.
            }
          }
          throw toProcessorError(classified);
        }
      },
      {
        connection,
        concurrency: concurrencyFor(env, queue),
        settings: { backoffStrategy: (attemptsMade: number) => phaseBackoffDelays(attemptsMade) },
      },
    );
    worker.on("failed", (job, err) => {
      void handleFailed(job, err as Error, queue).catch(() => undefined);
    });
    worker.on("error", (err: Error) => {
      logWorker("worker_error", { queue, code: "WORKER_ERROR", message: sanitizeErrorMessage(err) });
    });
    workers.push(worker);
    health.push({ queue, state: "ready" });
  }
  setQueueHealth(health);
  // Wait until every worker is listening before reporting ready.
  await Promise.all(workers.map((w) => w.waitUntilReady()));
  return {
    workers,
    closeAll: async () => {
      await Promise.all(workers.map((w) => w.close().catch(() => undefined)));
    },
  };
}
