import { prisma } from "@jobcopilot/db";
import {
  AutopilotRunRequestSchema,
  type AutopilotItem,
  type AutopilotSummary,
} from "@jobcopilot/shared";
import { notFound, unprocessable } from "./errors.js";
import { createApplication, transitionApplication } from "./applications.js";
import * as runs from "../browser/run-service.js";
import { isLikelyEnglish } from "./language.js";

const BLOCKED_HOSTS = [
  /(^|\.)linkedin\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
];

interface AdapterChoice {
  adapter: "demo" | "fixture-ats" | "generic";
  targetUrl: string | null;
}

/**
 * Phase 20 — autopilot.
 * Picks high-scoring matches, creates the application, starts the browser
 * run, approves deterministic answers, and fills the form. It stops at
 * WAITING_FOR_SUBMISSION: the human still confirms submission.
 */
export async function runAutopilot(
  userId: string,
  rawInput: unknown,
): Promise<AutopilotSummary> {
  const startedAt = Date.now();
  const input = AutopilotRunRequestSchema.parse(rawInput ?? {});
  const config = await prisma.discoveryConfig.findUnique({ where: { userId } });
  if (!config) throw notFound("Discovery is not configured");
  if (!config.autopilotEnabled) {
    throw unprocessable("Autopilot is disabled. Enable it and save the configuration first.");
  }

  const minScore = input.minScore ?? config.autopilotMinScore;
  const limit = Math.min(input.limit ?? config.autopilotMaxPerRun, 10);
  const resumeId = await resolveResumeId(userId, config.autopilotResumeId);

  const candidates = await prisma.jobMatch.findMany({
    where: {
      userId,
      overallScore: { gte: minScore },
      ...(input.jobIds && input.jobIds.length > 0 ? { jobId: { in: input.jobIds } } : {}),
      job: {
        userId,
        sourceUrl: { not: null },
        applications: { none: { userId } },
      },
    },
    orderBy: { overallScore: "desc" },
    take: Math.min(limit * 4, 200),
    include: { job: true },
  });
  const matches = candidates
    .filter((match) => isLikelyEnglish(match.job.title, match.job.description))
    .slice(0, limit);

  const items: AutopilotItem[] = [];
  for (const match of matches) {
    items.push(
      await prepareOne(userId, {
        jobId: match.jobId,
        title: match.job.title,
        companyName: match.job.companyName,
        score: match.overallScore,
        sourceUrl: match.job.sourceUrl,
        resumeId,
      }),
    );
  }

  const summary: AutopilotSummary = {
    evaluated: matches.length,
    attempted: items.filter((i) => i.status !== "skipped").length,
    filled: items.filter((i) => i.status === "filled").length,
    needsInput: items.filter((i) => i.status === "needs_input").length,
    skipped: items.filter((i) => i.status === "skipped").length,
    failed: items.filter((i) => i.status === "failed" || i.status === "blocked").length,
    items,
    durationMs: Date.now() - startedAt,
  };

  await prisma.discoveryConfig.update({
    where: { id: config.id },
    data: {
      autopilotLastRunAt: new Date(),
      autopilotLastSummary: { ...summary } as never,
    },
  });
  return summary;
}

async function resolveResumeId(
  userId: string,
  configuredId: string | null,
): Promise<string | null> {
  if (configuredId) {
    const owned = await prisma.resume.findFirst({ where: { id: configuredId, userId } });
    if (owned) return owned.id;
  }
  const active = await prisma.resume.findFirst({
    where: { userId, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  return active?.id ?? null;
}

function chooseAdapter(sourceUrl: string | null): AdapterChoice | null {
  if (!sourceUrl) return null;
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (BLOCKED_HOSTS.some((p) => p.test(url.hostname))) return null;
  if (url.pathname.startsWith("/ats-demo/")) {
    return { adapter: "fixture-ats", targetUrl: sourceUrl };
  }
  if (url.pathname.startsWith("/demo-application")) {
    return { adapter: "demo", targetUrl: sourceUrl };
  }
  // Generic adapter derives the target from the job URL itself; overrides
  // are only accepted for local hosts, so do not pass one here.
  return { adapter: "generic", targetUrl: null };
}

async function prepareOne(
  userId: string,
  job: {
    jobId: string;
    title: string;
    companyName: string;
    score: number;
    sourceUrl: string | null;
    resumeId: string | null;
  },
): Promise<AutopilotItem> {
  const base = {
    jobId: job.jobId,
    title: job.title,
    companyName: job.companyName,
    score: job.score,
    applicationId: null as string | null,
    runId: null as string | null,
    adapter: null as string | null,
    targetUrl: job.sourceUrl,
    message: null as string | null,
  };
  const choice = chooseAdapter(job.sourceUrl);
  if (!choice) {
    return {
      ...base,
      status: "skipped",
      message: "No supported application URL (LinkedIn/X or missing URL).",
    };
  }
  base.adapter = choice.adapter;

  try {
    const app = await createApplication(userId, {
      jobId: job.jobId,
      resumeId: job.resumeId,
      mode: "APPROVAL",
    });
    base.applicationId = app.id;

    const run = await runs.createRun(userId, app.id, {
      adapter: choice.adapter,
      ...(choice.targetUrl ? { targetUrl: choice.targetUrl } : {}),
    });
    base.runId = run.id;

    const started = await runs.startRun(userId, run.id);
    if (started.status === "BLOCKED" || started.status === "FAILED") {
      return {
        ...base,
        status: "blocked",
        message: started.errorMessage ?? started.errorCode ?? "The site blocked automation.",
      };
    }
    if (started.status !== "WAITING_FOR_REVIEW") {
      return {
        ...base,
        status: "needs_input",
        message: `Run stopped at ${started.status}.`,
      };
    }

    const approvable = started.answers.filter(
      (a) =>
        a.mapping !== "UNSUPPORTED_SENSITIVE_FIELD" &&
        a.mapping !== "UNKNOWN" &&
        a.fieldType !== "file" &&
        a.status !== "REJECTED" &&
        a.proposedValue.trim() !== "",
    );
    if (approvable.length === 0) {
      return {
        ...base,
        status: "needs_input",
        message: "No deterministic answers could be approved; fill the form manually.",
      };
    }

    const approved = await runs.approveRun(userId, run.id, {
      answers: approvable.map((a) => ({ fieldId: a.fieldId, rejected: false })),
    });
    if (approved.status !== "READY_TO_FILL") {
      return {
        ...base,
        status: "needs_input",
        message: approved.warnings.join(" ") || "Required fields still need input.",
      };
    }

    const filled = await runs.fillRun(userId, run.id);
    if (filled.status === "WAITING_FOR_SUBMISSION") {
      await markApplicationReady(userId, app.id);
      return {
        ...base,
        status: "filled",
        message: "Form filled. Review it and confirm submission manually.",
      };
    }
    return {
      ...base,
      status: filled.status === "BLOCKED" ? "blocked" : "needs_input",
      message: filled.errorMessage ?? `Run stopped at ${filled.status}.`,
    };
  } catch (err) {
    return {
      ...base,
      status: "failed",
      message: err instanceof Error ? err.message.slice(0, 300) : "Autopilot step failed",
    };
  }
}

/** Best-effort status progression; never fails the autopilot item. */
async function markApplicationReady(userId: string, applicationId: string): Promise<void> {
  for (const next of ["MATCHED", "REVIEW", "READY"] as const) {
    try {
      await transitionApplication(userId, applicationId, next, "Autopilot filled the form", "SYSTEM");
    } catch {
      return;
    }
  }
}
