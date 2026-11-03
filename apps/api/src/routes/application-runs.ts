import { Router } from "express";
import {
  ApproveAnswersSchema,
  ConfirmSubmitSchema,
  CreateApplicationRunSchema,
  RecoverRunSchema,
  ResolveSubmissionSchema,
  ResumeRunSchema,
} from "@jobcopilot/shared";
import { validateBody } from "../middleware/validate.js";
import { ah, requireDb } from "../middleware/db.js";
import * as runs from "../browser/run-service.js";

/** Run endpoints nested under applications (creation + history). */
export const applicationRunsNestedRouter = Router({ mergeParams: true });

applicationRunsNestedRouter.post(
  "/:id/runs",
  requireDb,
  validateBody(CreateApplicationRunSchema),
  ah(async (req, res) => {
    res.status(201).json({ run: await runs.createRun(req.userId!, req.params.id, req.body) });
  }),
);

applicationRunsNestedRouter.get(
  "/:id/runs",
  requireDb,
  ah(async (req, res) => {
    res.json({ runs: await runs.listRuns(req.userId!, req.params.id) });
  }),
);

/** Run lifecycle endpoints. */
export const applicationRunsRouter = Router();

applicationRunsRouter.use(requireDb);

// Literal paths first so Express never treats them as :id.
applicationRunsRouter.get(
  "/adapters",
  ah(async (_req, res) => {
    res.json({ adapters: runs.adapterDescriptors() });
  }),
);

applicationRunsRouter.get(
  "/:id",
  ah(async (req, res) => {
    res.json({ run: await runs.getRunInfo(req.userId!, req.params.id) });
  }),
);

applicationRunsRouter.post(
  "/:id/start",
  ah(async (req, res) => {
    res.json({ run: await runs.startRun(req.userId!, req.params.id) });
  }),
);

applicationRunsRouter.post(
  "/:id/approve",
  validateBody(ApproveAnswersSchema),
  ah(async (req, res) => {
    res.json({ run: await runs.approveRun(req.userId!, req.params.id, req.body) });
  }),
);

applicationRunsRouter.post(
  "/:id/fill",
  ah(async (req, res) => {
    res.json({ run: await runs.fillRun(req.userId!, req.params.id) });
  }),
);

applicationRunsRouter.post(
  "/:id/submit",
  validateBody(ConfirmSubmitSchema),
  ah(async (req, res) => {
    res.json({ run: await runs.submitRun(req.userId!, req.params.id) });
  }),
);

applicationRunsRouter.post(
  "/:id/cancel",
  ah(async (req, res) => {
    res.json({ run: await runs.cancelRun(req.userId!, req.params.id) });
  }),
);

applicationRunsRouter.post(
  "/:id/resume",
  validateBody(ResumeRunSchema),
  ah(async (req, res) => {
    res.json({ run: await runs.resumeRun(req.userId!, req.params.id, req.body.reason) });
  }),
);

applicationRunsRouter.post(
  "/:id/recover",
  validateBody(RecoverRunSchema),
  ah(async (req, res) => {
    res.json({ run: await runs.recoverRun(req.userId!, req.params.id, req.body.reason) });
  }),
);

applicationRunsRouter.post(
  "/:id/resolve",
  validateBody(ResolveSubmissionSchema),
  ah(async (req, res) => {
    res.json({ run: await runs.resolveSubmission(req.userId!, req.params.id, req.body) });
  }),
);

applicationRunsRouter.get(
  "/:id/status",
  ah(async (req, res) => {
    const run = await runs.getRunInfo(req.userId!, req.params.id);
    res.json({
      status: {
        id: run.id,
        status: run.status,
        currentStep: run.currentStep,
        adapter: run.adapter,
        sessionStatus: run.sessionStatus,
        sessionMode: run.sessionMode,
        errorCode: run.errorCode,
        errorMessage: run.errorMessage,
        submissionConfirmedAt: run.submissionConfirmedAt,
        retryCount: run.retryCount,
        updatedAt: run.updatedAt,
      },
    });
  }),
);
