import { Router } from "express";
import { CancelQueuedJobSchema, RetryDeadLetterSchema } from "@jobcopilot/shared";
import { validateBody } from "../middleware/validate.js";
import { ah, requireDb } from "../middleware/db.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { isDbConfigured } from "@jobcopilot/db";
import {
  QueueUnavailableError,
  cancelJob,
  deadLetterCount,
  getJobStatus,
  listDeadLetters,
  queueCounts,
  registryHealth,
  retryDeadLetter,
} from "@jobcopilot/queues";
import { ensureQueueRegistry } from "../queues/queue-init.js";

/**
 * Phase 10A — queue operations (local/dev observability + job control).
 * All endpoints require authentication. Payloads are never returned —
 * only safe metadata (counts, states, sanitized errors). Dead-letter
 * listings are scoped to the requester.
 */
export const queuesRouter = Router();

queuesRouter.use(requireDb);
queuesRouter.use(rateLimit("queues", { windowMs: 60_000, max: 120 }));

/** Every queue endpoint needs Redis: fail 503 when unavailable (never fake). */
queuesRouter.use(((_req, res, next) => {
  try {
    ensureQueueRegistry();
    next();
  } catch {
    res.status(503).json({ error: "Background queues unavailable" });
  }
}) as import("express").RequestHandler);

queuesRouter.get(
  "/health",
  ah(async (_req, res) => {
    const [redis, counts, deadLetter] = await Promise.all([
      registryHealth(),
      queueCounts().catch(() => []),
      deadLetterCount().catch(() => 0),
    ]);
    const database = isDbConfigured() ? "up" : "down";
    const ready = redis.redis === "up" && database === "up";
    res.json({
      status: ready ? "ready" : "degraded",
      redis: redis.redis,
      redisHost: redis.host,
      database,
      queues: counts,
      deadLetter,
    });
  }),
);

queuesRouter.get(
  "/status/:jobId",
  ah(async (req, res) => {
    const status = await getJobStatus(req.params.jobId);
    if (!status || status.userId !== req.userId!) {
      res.status(404).json({ error: "Queued job not found" });
      return;
    }
    const { userId: _owner, ...safe } = status;
    res.json({ job: safe });
  }),
);

queuesRouter.post(
  "/cancel",
  validateBody(CancelQueuedJobSchema),
  ah(async (req, res) => {
    const result = await cancelJob(req.body.jobId, req.userId!);
    if (!result.cancelled && result.state === null) {
      res.status(404).json({ error: "Queued job not found" });
      return;
    }
    res.json({ cancellation: result });
  }),
);

queuesRouter.get(
  "/dlq",
  ah(async (req, res) => {
    res.json({ failures: await listDeadLetters(req.userId!) });
  }),
);

queuesRouter.post(
  "/dlq/retry",
  validateBody(RetryDeadLetterSchema),
  ah(async (req, res) => {
    const result = await retryDeadLetter(req.body.dlqJobId, req.userId!);
    if (!result.retried) {
      res.status(404).json({ error: "Failed job not found or no longer retryable" });
      return;
    }
    res.json({ retried: true });
  }),
);
