import { Redis } from "ioredis";

/**
 * Phase 10A — centralized Redis connections for BullMQ.
 * BullMQ requires `maxRetriesPerRequest: null` (blocking clients).
 * Credentials in REDIS_URL are never logged — only a redacted host label.
 */

export function redisHostLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || "6379"}`;
  } catch {
    return "redis://<invalid-url>";
  }
}

/** Producer/shared connection (non-blocking usage). */
export function createRedisConnection(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
}

/** Dedicated blocking connection for a BullMQ Worker. */
export function createWorkerConnection(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
}

export async function pingRedis(client: Redis, timeoutMs = 3000): Promise<boolean> {
  try {
    const result = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("ping timeout")), timeoutMs);
      }),
    ]);
    return result === "PONG";
  } catch {
    return false;
  }
}
