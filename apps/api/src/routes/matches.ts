import { Router } from "express";
import { createHash } from "node:crypto";
import {
  JobMatchUpsertSchema,
  MatchesQuerySchema,
  RunMatchesSchema,
  UpdateJobMatchSchema,
  type RunMatchesInput,
} from "@jobcopilot/shared";
import { QueueUnavailableError, enqueueMatching } from "@jobcopilot/queues";
import { validateBody } from "../middleware/validate.js";
import { ah, requireDb } from "../middleware/db.js";
import { ensureQueueRegistry } from "../queues/queue-init.js";
import {
  upsertMatch,
  listMatches,
  getMatchForJob,
  updateMatch,
} from "../services/matches.js";
import { runMatches } from "../services/match-runner.js";

export const matchesRouter = Router();

/** Deterministic idempotency key for identical match requests. */
function defaultMatchKey(userId: string, body: RunMatchesInput): string {
  return createHash("sha256")
    .update(JSON.stringify({ userId, limit: body.limit, mode: body.mode ?? null }))
    .digest("hex")
    .slice(0, 32);
}

matchesRouter.get(
  "/",
  ah(async (req, res) => {
    const parsed = MatchesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    res.json({ matches: await listMatches(req.userId!, parsed.data) });
  }),
);

matchesRouter.post(
  "/run",
  requireDb,
  validateBody(RunMatchesSchema),
  ah(async (req, res) => {
    // Phase 10A: async mode enqueues (202); sync behavior unchanged otherwise.
    if (req.body.async) {
      try {
        ensureQueueRegistry();
        const enqueued = await enqueueMatching({
          userId: req.userId!,
          limit: req.body.limit,
          mode: req.body.mode ?? undefined,
          idempotencyKey: defaultMatchKey(req.userId!, req.body),
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
    const { matched, matches } = await runMatches(
      req.userId!,
      req.body.limit ?? 20,
      req.body.mode,
    );
    res.json({ matched, matches });
  }),
);

matchesRouter.post(
  "/",
  validateBody(JobMatchUpsertSchema),
  ah(async (req, res) => {
    res.status(201).json({ match: await upsertMatch(req.userId!, req.body) });
  }),
);

matchesRouter.get(
  "/job/:jobId",
  ah(async (req, res) => {
    res.json({ match: await getMatchForJob(req.userId!, req.params.jobId) });
  }),
);

matchesRouter.patch(
  "/:id",
  validateBody(UpdateJobMatchSchema),
  ah(async (req, res) => {
    res.json({ match: await updateMatch(req.userId!, req.params.id, req.body) });
  }),
);
