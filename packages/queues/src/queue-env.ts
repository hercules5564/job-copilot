import { z } from "zod";

/**
 * Phase 10A — queue/worker environment (validated, safe defaults).
 * REDIS_URL may carry credentials; it is never logged (see redis-config).
 */

const concurrencyField = (def: number) =>
  z.coerce.number().int().min(1).max(10).default(def);

const QueueEnvSchema = z.object({
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  QUEUE_INGESTION_CONCURRENCY: concurrencyField(2),
  QUEUE_MATCHING_CONCURRENCY: concurrencyField(2),
  QUEUE_GMAIL_CONCURRENCY: concurrencyField(1),
  QUEUE_NOTIFICATION_CONCURRENCY: concurrencyField(2),
  QUEUE_ANALYTICS_CONCURRENCY: concurrencyField(2),
  QUEUE_DISCOVERY_CONCURRENCY: concurrencyField(2),
  WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(5000).max(120000).default(30000),
  WORKER_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === undefined || !["false", "0", "no"].includes(v.toLowerCase())),
  QUEUE_SCHEDULE_ANALYTICS: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

export type QueueEnv = z.infer<typeof QueueEnvSchema>;

/** Parse process env once; throws a safe error (no URLs) when invalid. */
export function loadQueueEnv(source: NodeJS.ProcessEnv = process.env): QueueEnv {
  const parsed = QueueEnvSchema.safeParse({
    REDIS_URL: source.REDIS_URL,
    QUEUE_INGESTION_CONCURRENCY: source.QUEUE_INGESTION_CONCURRENCY,
    QUEUE_MATCHING_CONCURRENCY: source.QUEUE_MATCHING_CONCURRENCY,
    QUEUE_GMAIL_CONCURRENCY: source.QUEUE_GMAIL_CONCURRENCY,
    QUEUE_NOTIFICATION_CONCURRENCY: source.QUEUE_NOTIFICATION_CONCURRENCY,
    QUEUE_ANALYTICS_CONCURRENCY: source.QUEUE_ANALYTICS_CONCURRENCY,
    QUEUE_DISCOVERY_CONCURRENCY: source.QUEUE_DISCOVERY_CONCURRENCY,
    WORKER_SHUTDOWN_TIMEOUT_MS: source.WORKER_SHUTDOWN_TIMEOUT_MS,
    WORKER_ENABLED: source.WORKER_ENABLED,
    QUEUE_SCHEDULE_ANALYTICS: source.QUEUE_SCHEDULE_ANALYTICS,
  });
  if (!parsed.success) {
    throw new Error("Invalid queue/worker configuration (check QUEUE_* / WORKER_* variables)");
  }
  return parsed.data;
}

export function concurrencyFor(env: QueueEnv, queue: string): number {
  switch (queue) {
    case "job-ingestion":
      return env.QUEUE_INGESTION_CONCURRENCY;
    case "job-matching":
      return env.QUEUE_MATCHING_CONCURRENCY;
    case "gmail-sync":
      return env.QUEUE_GMAIL_CONCURRENCY;
    case "notifications":
      return env.QUEUE_NOTIFICATION_CONCURRENCY;
    case "analytics":
      return env.QUEUE_ANALYTICS_CONCURRENCY;
    case "job-discovery":
      return env.QUEUE_DISCOVERY_CONCURRENCY;
    default:
      return 1;
  }
}
