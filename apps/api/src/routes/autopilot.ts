import { Router } from "express";
import { prisma } from "@jobcopilot/db";
import { AutopilotRunRequestSchema } from "@jobcopilot/shared";
import { validateBody } from "../middleware/validate.js";
import { ah, requireDb } from "../middleware/db.js";
import { runAutopilot } from "../services/autopilot.js";
import { getDiscoveryConfig } from "../services/job-discovery.js";

/**
 * Phase 20 — autopilot endpoints.
 * POST /run prepares applications synchronously (browser handles live in
 * the API process). It stops at WAITING_FOR_SUBMISSION; submission is still
 * a separate human-confirmed call.
 */
export const autopilotRouter = Router();

autopilotRouter.use(requireDb);

autopilotRouter.get(
  "/status",
  ah(async (req, res) => {
    const config = await getDiscoveryConfig(req.userId!);
    const recentRuns = await prisma.applicationRun.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { application: { include: { job: true } } },
    });
    res.json({
      autopilot: config
        ? {
            enabled: config.autopilotEnabled,
            minScore: config.autopilotMinScore,
            maxPerRun: config.autopilotMaxPerRun,
            resumeId: config.autopilotResumeId,
            lastRunAt: config.autopilotLastRunAt,
            lastSummary: config.autopilotLastSummary,
          }
        : null,
      recentRuns: recentRuns.map((run) => ({
        runId: run.id,
        applicationId: run.applicationId,
        jobId: run.jobId,
        title: run.application.job.title,
        companyName: run.application.job.companyName,
        adapter: run.adapter,
        status: run.status,
        targetUrl: run.targetUrl,
        createdAt: run.createdAt.toISOString(),
      })),
    });
  }),
);

autopilotRouter.post(
  "/run",
  validateBody(AutopilotRunRequestSchema),
  ah(async (req, res) => {
    const summary = await runAutopilot(req.userId!, req.body);
    res.json({ autopilot: summary });
  }),
);
