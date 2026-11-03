import "dotenv/config";
import { prisma } from "@jobcopilot/db";
import {
  builtInSchedules,
  closeRegistry,
  ensureSchedules,
  initRegistry,
  loadQueueEnv,
  pingRedis,
  createRedisConnection,
  redisHostLabel,
  registryHealth,
} from "@jobcopilot/queues";
import { registerDefaultSources } from "../../api/src/sources/index.js";
import {
  getHealthSnapshot,
  resetHealthState,
  setInfraHealth,
  setWorkerStatus,
} from "./health-state.js";
import { QUEUE_LIST, startWorkers } from "./registration.js";

/**
 * Phase 10A — worker entrypoint (NOT an HTTP API).
 * Startup: validate env → connect Redis → verify DB → register sources →
 * register queues/processors → schedules → ready. SIGINT/SIGTERM trigger
 * bounded graceful shutdown (stop polling, finish active work, close
 * workers/Redis/Prisma, exit). Missing infrastructure fails clearly —
 * never a silent healthy.
 */

function logWorker(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: "info", component: "worker-host", event, ...fields }));
}

function fail(message: string): never {
  console.error(JSON.stringify({ level: "error", component: "worker-host", event: "startup_failed", message }));
  process.exit(1);
}

async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  resetHealthState();
  setWorkerStatus("starting");

  let env;
  try {
    env = loadQueueEnv();
  } catch {
    fail("Invalid queue/worker configuration (check QUEUE_* / WORKER_* variables)");
  }

  if (!env.WORKER_ENABLED) {
    logWorker("worker_disabled");
    process.exit(0);
  }
  if (!process.env.DATABASE_URL) {
    fail("DATABASE_URL is not configured");
  }

  initRegistry(env.REDIS_URL);
  const probe = createRedisConnection(env.REDIS_URL);
  const redisUp = await pingRedis(probe);
  try {
    probe.disconnect();
  } catch {
    // Best-effort close.
  }
  if (!redisUp) {
    fail(`Redis is unreachable (host: ${redisHostLabel(env.REDIS_URL)}). Start it with: docker compose up -d redis`);
  }

  const dbUp = await checkDatabase();
  if (!dbUp) {
    fail("PostgreSQL is unreachable. Start it with: docker compose up -d postgres");
  }
  setInfraHealth("up", "up");

  // Business registries live in the API sources tree (shared in-process).
  registerDefaultSources();

  let closeWorkers: (() => Promise<void>) | null = null;
  try {
    const started = await startWorkers(env, env.REDIS_URL);
    closeWorkers = started.closeAll;
  } catch (err) {
    fail(`Worker registration failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}`);
  }

  const schedules = await ensureSchedules(builtInSchedules(env)).catch(() => [] as string[]);
  setWorkerStatus("ready");
  logWorker("worker_ready", {
    queues: QUEUE_LIST,
    schedules,
    health: getHealthSnapshot(),
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    setWorkerStatus("stopping");
    logWorker("shutdown_started", { signal });
    const force = setTimeout(() => {
      console.error(JSON.stringify({ level: "error", component: "worker-host", event: "shutdown_timeout" }));
      process.exit(1);
    }, env.WORKER_SHUTDOWN_TIMEOUT_MS);
    // Avoid keeping the loop alive on the force timer alone.
    (force as unknown as { unref?: () => void }).unref?.();
    void (async () => {
      try {
        if (closeWorkers) await closeWorkers();
        await closeRegistry();
        await prisma.$disconnect();
        setWorkerStatus("stopped");
        logWorker("shutdown_complete");
        clearTimeout(force);
        process.exit(0);
      } catch (err) {
        console.error(
          JSON.stringify({
            level: "error",
            component: "worker-host",
            event: "shutdown_failed",
            message: err instanceof Error ? err.message.slice(0, 200) : "unknown",
          }),
        );
        clearTimeout(force);
        process.exit(1);
      }
    })();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Surface registry health for local/dev operators (logs only, no HTTP).
  void registryHealth().catch(() => ({ redis: "down" as const, host: "unknown" }));
}

void main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message.slice(0, 200) : "worker crashed during startup");
});
