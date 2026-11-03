import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { QueueName } from "@jobcopilot/shared";
import { createRedisConnection, pingRedis, redisHostLabel } from "./redis-config.js";
import { DEAD_LETTER_QUEUE } from "./job-ids.js";

/**
 * Phase 10A — centralized BullMQ queue registry.
 * Closed queue set (QueueName enum); test-only handles via getTestQueue()
 * which refuses to run in production. One shared producer connection.
 */

export const QUEUE_NAMES: readonly QueueName[] = [
  "job-ingestion",
  "job-matching",
  "gmail-sync",
  "notifications",
  "analytics",
  "job-discovery",
];

export class QueueUnavailableError extends Error {
  constructor(message = "Queue infrastructure is unavailable (REDIS_URL not configured)") {
    super(message);
    this.name = "QueueUnavailableError";
  }
}

interface RegistryState {
  redisUrl: string;
  producer: Redis;
  queues: Map<string, Queue>;
}

let state: RegistryState | null = null;

export function isRegistryInitialized(): boolean {
  return state !== null;
}

/** Initialize once per process (API boot, worker boot, tests). */
export function initRegistry(redisUrl: string): void {
  if (state) {
    if (state.redisUrl === redisUrl) return;
    throw new Error("Queue registry already initialized with a different REDIS_URL");
  }
  if (!redisUrl) throw new QueueUnavailableError();
  state = { redisUrl, producer: createRedisConnection(redisUrl), queues: new Map() };
}

function requireState(): RegistryState {
  if (!state) throw new QueueUnavailableError("Queue registry not initialized");
  return state;
}

export function getQueue(name: QueueName): Queue {
  const s = requireState();
  let queue = s.queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: s.producer });
    s.queues.set(name, queue);
  }
  return queue;
}

/** Durable failure store (sanitized metadata only — never payloads). */
export function getDeadLetterQueue(): Queue {
  const s = requireState();
  let queue = s.queues.get(DEAD_LETTER_QUEUE);
  if (!queue) {
    queue = new Queue(DEAD_LETTER_QUEUE, { connection: s.producer });
    s.queues.set(DEAD_LETTER_QUEUE, queue);
  }
  return queue;
}

/**
 * Test-only queue handle (isolated names like "test-<case>-<ts>").
 * Refuses production. Lets tests exercise mechanics without touching
 * the closed production registry.
 */
export function getTestQueue(name: string): Queue {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Test queues are unavailable in production");
  }
  if (!/^test-[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error("Test queue names must match test-[A-Za-z0-9._-]");
  }
  const s = requireState();
  let queue = s.queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: s.producer });
    s.queues.set(name, queue);
  }
  return queue;
}

export async function closeRegistry(): Promise<void> {
  if (!state) return;
  const queues = [...state.queues.values()];
  state.queues.clear();
  await Promise.all(queues.map((q) => q.close().catch(() => undefined)));
  const producer = state.producer;
  state = null;
  try {
    producer.disconnect();
  } catch {
    // Best-effort close.
  }
}

/** Safe readiness probe (host label only — never the URL). */
export async function registryHealth(): Promise<{ redis: "up" | "down"; host: string }> {
  if (!state) return { redis: "down", host: "uninitialized" };
  const up = await pingRedis(state.producer);
  return { redis: up ? "up" : "down", host: redisHostLabel(state.redisUrl) };
}

export function registryRedisUrl(): string {
  return requireState().redisUrl;
}
