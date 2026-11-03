import { loadQueueEnv, initRegistry, isRegistryInitialized } from "@jobcopilot/queues";

/**
 * Phase 10A — lazy queue registry bootstrap for the API.
 * The API runs fine without Redis; registry initialization happens on
 * first enqueue. Missing/invalid queue config surfaces as 503 (never a
 * silent fake enqueue).
 */

export function ensureQueueRegistry(): void {
  if (isRegistryInitialized()) return;
  const env = loadQueueEnv();
  if (!env.REDIS_URL) {
    throw new Error("Background queues unavailable (REDIS_URL not configured)");
  }
  initRegistry(env.REDIS_URL);
}
