import { Router } from "express";
import { createHash } from "node:crypto";
import {
  RecommendationsQuerySchema,
  RunRecommendationsSchema,
} from "@jobcopilot/shared";
import { QueueUnavailableError, enqueueMatching } from "@jobcopilot/queues";
import { validateBody } from "../middleware/validate.js";
import { ah } from "../middleware/db.js";
import { ensureQueueRegistry } from "../queues/queue-init.js";
import {
  getRecommendationDetail,
  listRecommendations,
  profileCompleteness,
  runRecommendations,
} from "../services/recommendations.js";

export const recommendationsRouter = Router();

recommendationsRouter.get(
  "/completeness",
  ah(async (req, res) => {
    res.json(await profileCompleteness(req.userId!));
  }),
);

recommendationsRouter.post(
  "/run",
  validateBody(RunRecommendationsSchema),
  ah(async (req, res) => {
    if (req.body.async) {
      try {
        ensureQueueRegistry();
        const idempotencyKey = createHash("sha256")
          .update(JSON.stringify({ userId: req.userId, limit: req.body.limit, mode: req.body.mode ?? null }))
          .digest("hex")
          .slice(0, 32);
        const enqueued = await enqueueMatching({
          userId: req.userId!,
          limit: req.body.limit,
          mode: req.body.mode ?? undefined,
          idempotencyKey,
        });
        res.status(202).json({ queued: true, jobId: enqueued.jobId, queue: enqueued.queue });
        return;
      } catch (err) {
        if (err instanceof QueueUnavailableError) {
          res.status(503).json({ error: "Background queues unavailable" });
          return;
        }
        throw err;
      }
    }
    res.json(await runRecommendations(req.userId!, req.body));
  }),
);

recommendationsRouter.get(
  "/",
  ah(async (req, res) => {
    const parsed = RecommendationsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    res.json(await listRecommendations(req.userId!, parsed.data));
  }),
);

recommendationsRouter.get(
  "/:jobId",
  ah(async (req, res) => {
    res.json({ recommendation: await getRecommendationDetail(req.userId!, req.params.jobId) });
  }),
);
