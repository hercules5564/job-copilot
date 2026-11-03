import type { QueueName } from "@jobcopilot/shared";

/**
 * Phase 10A — deterministic BullMQ job ids for queue-level idempotency.
 * Format: q.<queue>.<safe-user>.<safe-key> (dots separate; BullMQ v6
 * forbids ":" in custom ids). Re-enqueue with the same idempotency key
 * returns the existing job instead of duplicating. Business-level
 * idempotency lives in the services, not here.
 */

function safeSegment(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 120) || "x";
}

export function deterministicJobId(queue: QueueName, userId: string, idempotencyKey: string): string {
  return `q.${queue}.${safeSegment(userId)}.${safeSegment(idempotencyKey)}`;
}

/** Route a deterministic id back to its queue (closed enum — rejects junk). */
export function queueFromJobId(jobId: string): QueueName | null {
  const match = /^q\.([A-Za-z-]+)\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.exec(jobId);
  if (!match) return null;
  const name = match[1];
  return (
    ["job-ingestion", "job-matching", "gmail-sync", "notifications", "analytics", "job-discovery"] as const
  ).includes(name as QueueName)
    ? (name as QueueName)
    : null;
}

export const DEAD_LETTER_QUEUE = "dead-letter" as const;

export function deadLetterId(originJobId: string): string {
  return `dlq.${originJobId.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 300)}`;
}
