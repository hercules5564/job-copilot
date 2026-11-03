/**
 * Phase 10A — worker health state machine (in-process, safe snapshot).
 * States: starting → ready | degraded, stopping → stopped.
 * Snapshots contain operational facts only — never URLs or secrets.
 */

export type WorkerStatus = "starting" | "ready" | "degraded" | "stopping" | "stopped";

export interface QueueHealthEntry {
  queue: string;
  state: "ready" | "error";
  detail?: string;
}

interface HealthState {
  status: WorkerStatus;
  startedAt: string | null;
  redis: "up" | "down" | "unknown";
  database: "up" | "down" | "unknown";
  queues: QueueHealthEntry[];
}

const state: HealthState = {
  status: "starting",
  startedAt: null,
  redis: "unknown",
  database: "unknown",
  queues: [],
};

export function setWorkerStatus(status: WorkerStatus): void {
  state.status = status;
  if (status === "ready" && !state.startedAt) {
    state.startedAt = new Date().toISOString();
  }
}

export function setInfraHealth(redis: HealthState["redis"], database: HealthState["database"]): void {
  state.redis = redis;
  state.database = database;
}

export function setQueueHealth(entries: QueueHealthEntry[]): void {
  state.queues = entries;
}

export function getHealthSnapshot(): HealthState & { uptimeMs: number | null } {
  return {
    ...state,
    queues: state.queues.map((q) => ({ ...q })),
    uptimeMs: state.startedAt ? Date.now() - new Date(state.startedAt).getTime() : null,
  };
}

/** Test hook: reset to a fresh starting state. */
export function resetHealthState(): void {
  state.status = "starting";
  state.startedAt = null;
  state.redis = "unknown";
  state.database = "unknown";
  state.queues = [];
}
