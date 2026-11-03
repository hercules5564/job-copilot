import { z } from "zod";
import { MatchModeSchema } from "./job-matching.js";

/**
 * Phase 10A — typed queue job contracts.
 * Payloads carry REFERENCES (ids + bounded params), never credentials:
 * no OAuth tokens, cookies, session tokens, passwords, email bodies,
 * or resume contents. Every payload is user-scoped via userId.
 */

/** Closed queue registry — arbitrary queue names are rejected. */
export const QueueNameSchema = z.enum([
  "job-ingestion",
  "job-matching",
  "gmail-sync",
  "notifications",
  "analytics",
  "job-discovery",
]);

export type QueueName = z.infer<typeof QueueNameSchema>;

/** One job type per queue (closed — processors cannot be selected by input). */
export const QueueJobTypeSchema = z.enum(["ingest", "match", "sync", "notify", "record", "discover"]);

export type QueueJobType = z.infer<typeof QueueJobTypeSchema>;

export const JOB_TYPE_BY_QUEUE: Record<QueueName, QueueJobType> = {
  "job-ingestion": "ingest",
  "job-matching": "match",
  "gmail-sync": "sync",
  notifications: "notify",
  analytics: "record",
  "job-discovery": "discover",
};

/** Base fields shared by every job payload. */
export const QueuePayloadBaseSchema = z.object({
  userId: z.string().min(1).max(200),
  /** Client-supplied idempotency key (bounded, opaque). */
  idempotencyKey: z.string().min(1).max(200),
});

export type QueuePayloadBase = z.infer<typeof QueuePayloadBaseSchema>;

export const IngestionJobPayloadSchema = QueuePayloadBaseSchema.extend({
  source: z.string().min(1).max(100),
  query: z.string().trim().max(200).optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  remote: z.boolean().optional().nullable(),
  employmentType: z.string().trim().max(100).optional().nullable(),
  limit: z.number().int().min(1).max(50).default(20),
});

export type IngestionJobPayload = z.infer<typeof IngestionJobPayloadSchema>;

export const MatchingJobPayloadSchema = QueuePayloadBaseSchema.extend({
  /** Explicit subset (each id re-checked for ownership); omit for batch mode. */
  jobIds: z.array(z.string().min(1).max(200)).max(50).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  mode: MatchModeSchema.optional(),
});

export type MatchingJobPayload = z.infer<typeof MatchingJobPayloadSchema>;

export const GmailSyncJobPayloadSchema = QueuePayloadBaseSchema.extend({
  integrationId: z.string().min(1).max(200),
  maxMessages: z.number().int().min(1).max(100).default(25),
});

export type GmailSyncJobPayload = z.infer<typeof GmailSyncJobPayloadSchema>;

export const NotificationJobPayloadSchema = QueuePayloadBaseSchema.extend({
  type: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  body: z.string().max(500).optional().nullable(),
  applicationId: z.string().min(1).max(200).optional().nullable(),
  emailMessageId: z.string().min(1).max(200).optional().nullable(),
});

export type NotificationJobPayload = z.infer<typeof NotificationJobPayloadSchema>;

export const AnalyticsJobPayloadSchema = QueuePayloadBaseSchema.extend({
  eventType: z.string().min(1).max(100),
  entityId: z.string().min(1).max(200).optional().nullable(),
});

export type AnalyticsJobPayload = z.infer<typeof AnalyticsJobPayloadSchema>;

export const QueuePayloadSchema = z.union([
  IngestionJobPayloadSchema,
  MatchingJobPayloadSchema,
  GmailSyncJobPayloadSchema,
  NotificationJobPayloadSchema,
  AnalyticsJobPayloadSchema,
]);

/** Enqueue request: cancel a queued job by its deterministic id. */
export const CancelQueuedJobSchema = z.object({
  jobId: z.string().min(1).max(500),
});

export type CancelQueuedJobInput = z.infer<typeof CancelQueuedJobSchema>;

/** Retry one dead-letter entry (origin queue + origin job id). */
export const RetryDeadLetterSchema = z.object({
  dlqJobId: z.string().min(1).max(500),
});

export type RetryDeadLetterInput = z.infer<typeof RetryDeadLetterSchema>;

/** Sanitized dead-letter entry (safe metadata only — never payloads). */
export const DeadLetterEntrySchema = z.object({
  id: z.string(),
  queue: QueueNameSchema,
  jobType: QueueJobTypeSchema,
  jobId: z.string(),
  userId: z.string(),
  attemptsMade: z.number().int().nonnegative(),
  failedAt: z.string(),
  code: z.string(),
  message: z.string(),
});

export type DeadLetterEntry = z.infer<typeof DeadLetterEntrySchema>;

/** Async-mode flag shared by existing sync endpoints (backwards compatible). */
export const AsyncRequestSchema = z.object({
  async: z.boolean().default(false),
});

export type AsyncRequest = z.infer<typeof AsyncRequestSchema>;
