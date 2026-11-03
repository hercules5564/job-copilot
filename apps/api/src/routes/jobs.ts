import { Router } from "express";
import { createHash } from "node:crypto";
import { isDbConfigured } from "@jobcopilot/db";
import { CreateJobSchema, UpdateJobSchema, IngestJobsSchema, MatchRequestModeSchema, type IngestJobsInput } from "@jobcopilot/shared";
import { QueueUnavailableError, enqueueIngestion } from "@jobcopilot/queues";
import { validateBody } from "../middleware/validate.js";
import { ah, requireDb } from "../middleware/db.js";
import { store } from "../services/store.js";
import * as jobs from "../services/jobs.js";
import { ingestJobs } from "../services/job-ingestion.js";
import { getSavedMatch, runMatchForJob } from "../services/match-runner.js";
import { getSource, listSourceInfos } from "../sources/index.js";
import { ensureQueueRegistry } from "../queues/queue-init.js";

/** Deterministic idempotency key for identical ingest requests. */
function defaultIngestKey(userId: string, body: IngestJobsInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        userId,
        source: body.source,
        query: body.query ?? null,
        location: body.location ?? null,
        remote: body.remote ?? null,
        employmentType: body.employmentType ?? null,
        limit: body.limit,
      }),
    )
    .digest("hex")
    .slice(0, 32);
}

export const jobsRouter = Router();

// NOTE: literal paths must precede "/:id" so Express doesn't treat them as IDs.
jobsRouter.get(
  "/sources",
  ah(async (_req, res) => {
    res.json({ sources: listSourceInfos() });
  }),
);

jobsRouter.post(
  "/ingest",
  requireDb,
  validateBody(IngestJobsSchema),
  ah(async (req, res) => {
    // Phase 10A: async mode enqueues (202) instead of running inline.
    // Sync behavior is unchanged when `async` is false/absent.
    if (req.body.async) {
      try {
        ensureQueueRegistry();
        getSource(req.body.source); // 400 early for unknown sources
        const enqueued = await enqueueIngestion({
          userId: req.userId!,
          source: req.body.source,
          query: req.body.query ?? null,
          location: req.body.location ?? null,
          remote: req.body.remote ?? null,
          employmentType: req.body.employmentType ?? null,
          limit: req.body.limit,
          idempotencyKey: defaultIngestKey(req.userId!, req.body),
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
    const result = await ingestJobs(req.userId!, req.body);
    res.json({ ingestion: result });
  }),
);

jobsRouter.get(
  "/",
  ah(async (req, res) => {
    if (!isDbConfigured()) {
      res.json({ jobs: store.listJobs() });
      return;
    }
    res.json({ jobs: await jobs.listJobs(req.userId!) });
  }),
);

jobsRouter.post(
  "/",
  validateBody(CreateJobSchema),
  ah(async (req, res) => {
    if (!isDbConfigured()) {
      const b = req.body as {
        title: string;
        company: string;
        location?: string | null;
        remote?: boolean;
        description: string;
        sourceUrl?: string | null;
      };
      const job = store.createJob({
        title: b.title,
        company: b.company,
        location: b.location ?? null,
        remote: b.remote ?? false,
        description: b.description,
        sourceUrl: b.sourceUrl ?? null,
      });
      res.status(201).json({ job });
      return;
    }
    const { job, deduplicated } = await jobs.createJob(req.userId!, req.body);
    res.status(deduplicated ? 200 : 201).json({ job });
  }),
);

jobsRouter.post(
  "/:id/match",
  requireDb,
  validateBody(MatchRequestModeSchema),
  ah(async (req, res) => {
    res.json({ match: await runMatchForJob(req.userId!, req.params.id, req.body.mode) });
  }),
);

jobsRouter.get(
  "/:id/match",
  requireDb,
  ah(async (req, res) => {
    res.json({ match: await getSavedMatch(req.userId!, req.params.id) });
  }),
);

jobsRouter.get(
  "/:id",
  ah(async (req, res) => {
    if (!isDbConfigured()) {
      const job = store.listJobs().find((j) => j.id === req.params.id);
      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      res.json({ job });
      return;
    }
    res.json({ job: await jobs.getJob(req.userId!, req.params.id) });
  }),
);

jobsRouter.patch(
  "/:id",
  validateBody(UpdateJobSchema),
  ah(async (req, res) => {
    if (!isDbConfigured()) {
      res.status(503).json({ error: "Job updates require DATABASE_URL" });
      return;
    }
    res.json({ job: await jobs.updateJob(req.userId!, req.params.id, req.body) });
  }),
);

jobsRouter.delete(
  "/:id",
  ah(async (req, res) => {
    if (!isDbConfigured()) {
      res.status(503).json({ error: "Job deletion requires DATABASE_URL" });
      return;
    }
    await jobs.deleteJob(req.userId!, req.params.id);
    res.json({ ok: true });
  }),
);
