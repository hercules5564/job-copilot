import { Router } from "express";
import { SaveJobSchema } from "@jobcopilot/shared";
import { validateBody } from "../middleware/validate.js";
import { ah } from "../middleware/db.js";
import { listSavedJobs, saveJob, unsaveJob } from "../services/saved-jobs.js";

export const savedJobsRouter = Router();

savedJobsRouter.get(
  "/",
  ah(async (req, res) => {
    res.json({ savedJobs: await listSavedJobs(req.userId!) });
  }),
);

savedJobsRouter.post(
  "/",
  validateBody(SaveJobSchema),
  ah(async (req, res) => {
    res.status(201).json({ savedJob: await saveJob(req.userId!, req.body.jobId) });
  }),
);

savedJobsRouter.delete(
  "/:jobId",
  ah(async (req, res) => {
    await unsaveJob(req.userId!, req.params.jobId);
    res.json({ ok: true });
  }),
);
