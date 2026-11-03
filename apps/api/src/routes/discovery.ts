import { Router } from "express";
import {
  DiscoveryConfigSchema,
  DiscoveryRunRequestSchema,
} from "@jobcopilot/shared";
import {
  QueueUnavailableError,
  enqueueDiscovery,
  ensureDiscoverySchedule,
  getQueue,
  removeDiscoverySchedule,
} from "@jobcopilot/queues";
import { validateBody } from "../middleware/validate.js";
import { ah, requireDb } from "../middleware/db.js";
import { notFound, unprocessable } from "../services/errors.js";
import { getSource } from "../sources/registry.js";
import { ensureQueueRegistry } from "../queues/queue-init.js";
import {
  getDiscoveryConfig,
  upsertDiscoveryConfig,
} from "../services/job-discovery.js";

/**
 * Phase 10B — discovery configuration + manual runs + status.
 * All endpoints require auth + DB. Runs always enqueue (202); the worker
 * does the fetching. Schedule sync is best-effort with explicit state.
 */
export const discoveryRouter = Router();

discoveryRouter.use(requireDb);

discoveryRouter.get(
  "/config",
  ah(async (req, res) => {
    res.json({ config: await getDiscoveryConfig(req.userId!) });
  }),
);

discoveryRouter.put(
  "/config",
  validateBody(DiscoveryConfigSchema),
  ah(async (req, res) => {
    const config = await upsertDiscoveryConfig(req.userId!, req.body);
    let schedule: "active" | "removed" | "unavailable" = "removed";
    if (config.scheduleEnabled && config.enabled) {
      try {
        ensureQueueRegistry();
        await ensureDiscoverySchedule({
          userId: req.userId!,
          discoveryConfigId: config.id,
          sourceKeys: config.sourceKeys,
          intervalHours: config.scheduleIntervalHours,
        });
        schedule = "active";
      } catch {
        schedule = "unavailable";
      }
    } else {
      try {
        ensureQueueRegistry();
        await removeDiscoverySchedule(config.id);
      } catch {
        // Registry unavailable: nothing to remove; report removed anyway
        // only when we are sure — here we cannot be, so mark unavailable.
        schedule = "unavailable";
      }
    }
    res.json({ config, schedule });
  }),
);

discoveryRouter.post(
  "/run",
  validateBody(DiscoveryRunRequestSchema),
  ah(async (req, res) => {
    const config = await getDiscoveryConfig(req.userId!);
    if (!config) throw notFound("Discovery is not configured");
    if (!config.enabled) throw unprocessable("Discovery is disabled for this user");
    const sourceKeys = (req.body.sourceKeys ?? config.sourceKeys).slice(0, 3);
    for (const key of sourceKeys) getSource(key); // 404 early for unknown sources
    try {
      ensureQueueRegistry();
      const requestedAt = new Date().toISOString();
      const enqueued = await enqueueDiscovery({
        userId: req.userId!,
        discoveryConfigId: config.id,
        sourceKeys,
        requestedAt,
        idempotencyKey: `manual-${config.id}-${requestedAt}`,
      });
      res.status(202).json({ queued: true, jobId: enqueued.jobId, queue: enqueued.queue });
    } catch (err) {
      if (err instanceof QueueUnavailableError) {
        res.status(503).json({ error: "Background queues unavailable" });
        return;
      }
      throw err;
    }
  }),
);

discoveryRouter.get(
  "/status",
  ah(async (req, res) => {
    const config = await getDiscoveryConfig(req.userId!);
    const recentJobs: { jobId: string; queue: string; state: string; finishedOn: number | null }[] = [];
    try {
      ensureQueueRegistry();
      for (const queueName of ["job-discovery", "job-ingestion", "job-matching"] as const) {
        const queue = getQueue(queueName);
        const jobs = await queue.getJobs(["waiting", "active", "completed", "failed", "delayed"], 0, 30);
        for (const job of jobs) {
          if ((job.data as { userId?: unknown })?.userId !== req.userId) continue;
          recentJobs.push({
            jobId: job.id ?? "",
            queue: queueName,
            state: await job.getState(),
            finishedOn: job.finishedOn ?? null,
          });
          if (recentJobs.length >= 20) break;
        }
        if (recentJobs.length >= 20) break;
      }
    } catch {
      // Queue inspection is best-effort; config status is authoritative.
    }
    res.json({
      config: config
        ? { lastRunAt: config.lastRunAt, lastStatus: config.lastStatus, lastSummary: config.lastSummary }
        : null,
      recentJobs,
    });
  }),
);
