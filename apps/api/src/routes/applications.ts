import { Router } from "express";
import { isDbConfigured } from "@jobcopilot/db";
import {
  CreateApplicationSchema,
  TransitionApplicationSchema,
  UpdateApplicationSchema,
  canTransition,
  type ApplicationStatus,
} from "@jobcopilot/shared";
import { validateBody } from "../middleware/validate.js";
import { ah } from "../middleware/db.js";
import { store } from "../services/store.js";
import * as apps from "../services/applications.js";

export const applicationsRouter = Router();

applicationsRouter.get(
  "/",
  ah(async (req, res) => {
    if (!isDbConfigured()) {
      res.json({ applications: store.listApplications() });
      return;
    }
    res.json({ applications: await apps.listApplications(req.userId!) });
  }),
);

applicationsRouter.post(
  "/",
  validateBody(CreateApplicationSchema),
  ah(async (req, res) => {
    if (!isDbConfigured()) {
      const { jobId } = req.body as { jobId: string };
      const jobExists = store.listJobs().some((j) => j.id === jobId);
      if (!jobExists) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      res.status(201).json({ application: store.createApplication(jobId) });
      return;
    }
    const { jobId, resumeId, mode } = req.body as {
      jobId: string;
      resumeId?: string | null;
      mode?: string;
    };
    res.status(201).json({
      application: await apps.createApplication(req.userId!, { jobId, resumeId, mode }),
    });
  }),
);

applicationsRouter.get(
  "/:id",
  ah(async (req, res) => {
    if (!isDbConfigured()) {
      const app = store.listApplications().find((a) => a.id === req.params.id);
      if (!app) {
        res.status(404).json({ error: "Application not found" });
        return;
      }
      res.json({ application: app });
      return;
    }
    res.json({ application: await apps.getApplication(req.userId!, req.params.id) });
  }),
);

applicationsRouter.get(
  "/:id/events",
  ah(async (req, res) => {
    if (!isDbConfigured()) {
      res.status(503).json({ error: "Application events require DATABASE_URL" });
      return;
    }
    res.json({ events: await apps.listApplicationEvents(req.userId!, req.params.id) });
  }),
);

applicationsRouter.patch(
  "/:id/status",
  validateBody(TransitionApplicationSchema),
  ah(async (req, res) => {
    const { toStatus, note } = req.body as {
      toStatus: ApplicationStatus;
      note?: string | null;
    };
    if (!isDbConfigured()) {
      const current = store.listApplications().find((a) => a.id === req.params.id);
      if (!current) {
        res.status(404).json({ error: "Application not found" });
        return;
      }
      if (!canTransition(current.status as ApplicationStatus, toStatus)) {
        res.status(422).json({
          error: `Transition ${current.status} -> ${toStatus} is not allowed`,
        });
        return;
      }
      res.json({
        application: store.transitionApplication(current.id, toStatus, note ?? null),
      });
      return;
    }
    res.json({
      application: await apps.transitionApplication(
        req.userId!,
        req.params.id,
        toStatus,
        note ?? null,
      ),
    });
  }),
);

applicationsRouter.patch(
  "/:id",
  validateBody(UpdateApplicationSchema),
  ah(async (req, res) => {
    if (!isDbConfigured()) {
      res.status(503).json({ error: "Application updates require DATABASE_URL" });
      return;
    }
    res.json({
      application: await apps.updateApplication(req.userId!, req.params.id, req.body),
    });
  }),
);

applicationsRouter.delete(
  "/:id",
  ah(async (req, res) => {
    if (!isDbConfigured()) {
      res.status(503).json({ error: "Application deletion requires DATABASE_URL" });
      return;
    }
    await apps.deleteApplication(req.userId!, req.params.id);
    res.json({ ok: true });
  }),
);
