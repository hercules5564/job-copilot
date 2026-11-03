import type { QueueName } from "@jobcopilot/shared";
import { getQueue } from "./queue-registry.js";

/**
 * Phase 10A — repeatable-job infrastructure (BullMQ v6 JobScheduler API).
 * Registration is idempotent (fixed scheduler ids via upsert). No
 * schedules are enabled by default — each must be opted in via env.
 */

export interface ScheduleDefinition {
  /** Stable scheduler id (upsert key). */
  id: string;
  queue: QueueName;
  name: string;
  data: Record<string, unknown>;
  everyMs?: number;
  pattern?: string;
}

/** Built-in schedules (all disabled unless their env flag is set). */
export function builtInSchedules(env: { QUEUE_SCHEDULE_ANALYTICS: boolean }): ScheduleDefinition[] {
  const out: ScheduleDefinition[] = [];
  if (env.QUEUE_SCHEDULE_ANALYTICS) {
    out.push({
      id: "sched-analytics-rollup",
      queue: "analytics",
      name: "record",
      data: { userId: "system", idempotencyKey: "scheduled-rollup", eventType: "scheduled-rollup" },
      everyMs: 24 * 60 * 60 * 1000,
    });
  }
  return out;
}

/** Register schedules idempotently; returns the ids ensured. */
export async function ensureSchedules(defs: ScheduleDefinition[]): Promise<string[]> {
  const ensured: string[] = [];
  for (const def of defs) {
    const queue = getQueue(def.queue);
    const repeat = def.pattern
      ? { pattern: def.pattern }
      : def.everyMs
        ? { every: def.everyMs }
        : null;
    if (!repeat) continue;
    await queue.upsertJobScheduler(def.id, repeat, { name: def.name, data: def.data });
    ensured.push(def.id);
  }
  return ensured;
}

export async function listSchedules(queue: QueueName): Promise<{ id: string; name: string }[]> {
  const schedulers = await getQueue(queue).getJobSchedulers();
  return schedulers.map((s) => ({ id: String(s.key ?? s.id ?? ""), name: String(s.name ?? "") }));
}

export async function removeSchedule(queue: QueueName, id: string): Promise<boolean> {
  return getQueue(queue).removeJobScheduler(id);
}

export interface DiscoveryScheduleParams {
  userId: string;
  discoveryConfigId: string;
  sourceKeys: string[];
  intervalHours: number;
}

/** Stable scheduler id: exactly one schedule per discovery config. */
export function discoverySchedulerId(discoveryConfigId: string): string {
  const safe = discoveryConfigId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 120) || "x";
  return `sched-discovery-${safe}`;
}

/**
 * Ensure a per-user discovery schedule (idempotent upsert). The template
 * carries references only; each produced run gets a unique BullMQ id and
 * the pipeline itself is idempotent, so repeated runs never duplicate.
 */
export async function ensureDiscoverySchedule(params: DiscoveryScheduleParams): Promise<string> {
  const queue = getQueue("job-discovery");
  const id = discoverySchedulerId(params.discoveryConfigId);
  const everyMs = Math.min(Math.max(Math.round(params.intervalHours * 3600 * 1000), 3600 * 1000), 168 * 3600 * 1000);
  await queue.upsertJobScheduler(
    id,
    { every: everyMs },
    {
      name: "discover",
      data: {
        userId: params.userId,
        discoveryConfigId: params.discoveryConfigId,
        sourceKeys: params.sourceKeys.slice(0, 3),
        requestedAt: new Date().toISOString(),
        idempotencyKey: `sched-${params.discoveryConfigId}`,
      },
      opts: { attempts: 3, backoff: { type: "custom" }, removeOnComplete: { count: 200 }, removeOnFail: { count: 500 } },
    },
  );
  return id;
}

export async function removeDiscoverySchedule(discoveryConfigId: string): Promise<boolean> {
  return getQueue("job-discovery").removeJobScheduler(discoverySchedulerId(discoveryConfigId));
}
