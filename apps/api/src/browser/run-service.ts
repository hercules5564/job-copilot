import { prisma, type ApplicationStatus as PrismaStatus } from "@jobcopilot/db";
import {
  type AdapterDescriptor,
  type AnswerStatus,
  type ApplicationRunInfo,
  type ApplicationRunStatus,
  type ApproveAnswersInput,
  type FieldMapping,
  type FormFieldType,
  type InspectedField,
  type ProposedAnswer,
  type ResolveSubmissionInput,
} from "@jobcopilot/shared";
import { canTransition, type ApplicationStatus } from "@jobcopilot/shared";
import { badRequest, conflict, notFound, unprocessable } from "../services/errors.js";
import { ensureUser } from "../services/users.js";
import { transitionApplication } from "../services/applications.js";
import { getApplicationAdapter, getBrowserProvider, listApplicationAdapters } from "./registry.js";
import {
  closeSession,
  createSession,
  getLiveHandle,
  resolveBrowserProviderId,
  setSessionStatus,
  touchSession,
} from "./session-manager.js";
import { applyApprovedContent, getAnswerProvider, type CandidateData } from "./answers.js";
import { getApprovedDraft } from "../services/personalization.js";
import { assertNavigationAllowed } from "./net-guard.js";
import type { PageFormField, PageInspection } from "./types.js";

/**
 * Phase 7 — application run service (human-in-the-loop state machine).
 * Automation prepares; explicit user approval gates filling; a second
 * explicit confirmation gates submission (demo adapter only — generic
 * adapters return SUBMISSION_UNSUPPORTED). Block/verification signals
 * stop the run; nothing is ever bypassed. Logs carry ids and statuses
 * only — never field values, cookies, or tokens.
 */

const RUN_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_RESUMES = 3;

function logRun(event: string, runId: string, userId: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: "info", component: "application-run", event, runId, userId, ...extra }));
}

/**
 * Phase 8 — audit trail. Milestones are recorded as same-status BROWSER
 * events (state unchanged, evidence kept), consistent with the Phase 6
 * precedent. Each milestone fires once per run because the status guards
 * below allow each transition exactly once.
 */
async function recordRunAudit(userId: string, applicationId: string, runId: string, milestone: string): Promise<void> {
  const application = await prisma.application.findFirst({ where: { id: applicationId, userId } });
  if (!application) return;
  await prisma.applicationEvent.create({
    data: {
      applicationId,
      oldStatus: application.status,
      newStatus: application.status,
      source: "BROWSER",
      note: `${milestone} (run ${runId.slice(0, 8)})`,
    },
  });
}

/** Mark a run FAILED and close its browser session (no zombie contexts). */
async function failRun(
  userId: string,
  run: { id: string; sessionId: string | null; applicationId: string },
  code: string,
  message: string,
): Promise<void> {
  await prisma.applicationRun.update({
    where: { id: run.id },
    data: { status: "FAILED", currentStep: "failed", errorCode: code, errorMessage: message, completedAt: new Date() },
  });
  if (run.sessionId) {
    try {
      await closeSession(run.sessionId, userId);
    } catch {
      // Session may already be gone; the run state is authoritative.
    }
  }
  logRun("application_failed", run.id, userId, { code });
  await recordRunAudit(userId, run.applicationId, run.id, "BROWSER_RUN_FAILED");
}

function adapterProviderId(adapterId: string): "demo" | "playwright" {
  // Local-verification escape hatch: run the demo adapter against a real
  // headless browser pointed at the local demo page. Defaults keep the
  // in-memory demo provider (safe, offline). Closed values only.
  if (adapterId === "demo") {
    const override = (process.env.BROWSER_PROVIDER_DEMO ?? "").toLowerCase();
    if (override === "playwright") return "playwright";
    return "demo";
  }
  return resolveBrowserProviderId();
}

async function ownedRun(userId: string, runId: string) {
  const run = await prisma.applicationRun.findFirst({
    where: { id: runId, userId },
    include: { application: true, job: true },
  });
  if (!run) throw notFound("Application run not found");
  return run;
}

function checkRunTimeout(run: { startedAt: Date | null; status: string }): void {
  if (run.startedAt && Date.now() - run.startedAt.getTime() > RUN_TIMEOUT_MS) {
    throw unprocessable("RUN_TIMEOUT: this run exceeded its time budget");
  }
}

async function buildCandidateData(userId: string): Promise<CandidateData> {
  const [user, profile, projects, resumes] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.profile.findUnique({ where: { userId } }),
    prisma.project.findMany({ where: { userId }, take: 50 }),
    prisma.resume.findMany({ where: { userId }, take: 20 }),
  ]);
  if (!user) throw notFound("User not found");
  return {
    fullName: profile?.fullName ?? user.name,
    email: user.email,
    yearsOfExperience: profile?.yearsOfExperience ?? null,
    education: Array.isArray(profile?.education) ? (profile!.education as string[]).filter((e) => typeof e === "string") : [],
    skills: profile?.skills ?? [],
    preferredLocations: profile?.preferredLocations ?? [],
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      technologies: p.technologies,
      role: p.role,
      githubUrl: p.githubUrl,
      liveUrl: p.liveUrl,
    })),
    resumes: resumes.map((r) => ({ id: r.id, name: r.name, targetRoles: r.targetRoles, parsedText: r.parsedText })),
  };
}

function toAnswerInput(row: {
  fieldId: string;
  label: string;
  fieldType: string;
  required: boolean;
  mapping: string;
  proposedValue: string;
  editedValue: string | null;
  source: string;
  status: string;
  filled: boolean;
}): ProposedAnswer {
  return {
    fieldId: row.fieldId,
    label: row.label,
    fieldType: row.fieldType as FormFieldType,
    required: row.required,
    mapping: row.mapping as FieldMapping,
    proposedValue: row.editedValue ?? row.proposedValue,
    source: row.source,
    status: row.status as AnswerStatus,
  };
}

function toFieldInput(row: {
  fieldId: string;
  label: string;
  fieldType: string;
  required: boolean;
  mapping: string;
}): InspectedField {
  return {
    fieldId: row.fieldId,
    label: row.label,
    name: "",
    type: row.fieldType as FormFieldType,
    required: row.required,
    options: [],
    placeholder: "",
    autocomplete: "",
    mapping: row.mapping as FieldMapping,
  };
}

/** Assemble the safe public run view (no secrets, no live browser state). */
export async function getRunInfo(userId: string, runId: string): Promise<ApplicationRunInfo> {
  const run = await ownedRun(userId, runId);
  const answers = await prisma.applicationAnswer.findMany({ where: { runId: run.id }, orderBy: { fieldId: "asc" } });
  const session = run.sessionId
    ? await prisma.browserSession.findFirst({ where: { id: run.sessionId, userId } })
    : null;
  const adapter = getApplicationAdapter(run.adapter);
  const descriptor = adapter.describe();
  const unsupported = answers.filter((a) => a.mapping === "UNSUPPORTED_SENSITIVE_FIELD").length;
  const missingRequired = answers.filter(
    (a) =>
      a.required &&
      a.mapping !== "UNSUPPORTED_SENSITIVE_FIELD" &&
      a.mapping !== "UNKNOWN" &&
      (a.status === "NEEDS_USER_INPUT" || (a.status !== "REJECTED" && !(a.editedValue ?? a.proposedValue))),
  );
  const warnings: string[] = [];
  if (unsupported > 0) warnings.push(`${unsupported} sensitive field(s) left untouched`);
  if (missingRequired.length > 0) warnings.push(`${missingRequired.length} required field(s) still need input`);
  return {
    id: run.id,
    applicationId: run.applicationId,
    jobId: run.jobId,
    adapter: run.adapter,
    status: run.status as ApplicationRunStatus,
    currentStep: run.currentStep,
    targetUrl: run.targetUrl,
    currentUrl: session?.currentUrl ?? null,
    currentTitle: session?.currentTitle ?? null,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    fields: answers.map(toFieldInput),
    answers: answers.map(toAnswerInput),
    filledFields: answers.filter((a) => a.filled).map((a) => a.fieldId),
    warnings,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    capabilities: descriptor.capabilities,
    submissionMode: descriptor.submissionMode,
    sessionStatus: session?.status ?? null,
    sessionMode: session?.mode ?? null,
    retryCount: run.retryCount,
    resumedFromRunId: run.resumedFromRunId,
    recoveryReason: run.recoveryReason,
    submissionConfirmedAt: run.submissionConfirmedAt?.toISOString() ?? null,
    lastSafeCheckpoint: run.lastSafeCheckpoint,
  };
}

export async function listRuns(userId: string, applicationId: string): Promise<ApplicationRunInfo[]> {
  const app = await prisma.application.findFirst({ where: { id: applicationId, userId } });
  if (!app) throw notFound("Application not found");
  const runs = await prisma.applicationRun.findMany({
    where: { userId, applicationId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const infos: ApplicationRunInfo[] = [];
  for (const run of runs) infos.push(await getRunInfo(userId, run.id));
  return infos;
}

export async function createRun(
  userId: string,
  applicationId: string,
  input: { adapter: string; targetUrl?: string },
): Promise<ApplicationRunInfo> {
  await ensureUser(userId);
  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    include: { job: true },
  });
  if (!application) throw notFound("Application not found");
  const adapter = getApplicationAdapter(input.adapter);
  const target = adapter.resolveTarget(application.job, input.targetUrl);
  const providerId = adapterProviderId(adapter.id);
  const session = await createSession(userId, providerId, adapter.id);
  const run = await prisma.applicationRun.create({
    data: {
      userId,
      applicationId: application.id,
      jobId: application.jobId,
      sessionId: session.id,
      adapter: adapter.id,
      status: "CREATED",
      currentStep: "created",
      targetUrl: target.targetUrl,
    },
  });
  logRun("application_run_started", run.id, userId, { adapter: adapter.id });
  await recordRunAudit(userId, application.id, run.id, "BROWSER_SESSION_STARTED");
  // Stash allowed origins on the run via currentStep metadata? No — recompute
  // deterministically from the adapter + target on every step instead.
  return getRunInfo(userId, run.id);
}

/** Recompute navigation guard from adapter policy (never trusts stored URLs alone). */
async function navigationGuard(
  userId: string,
  runId: string,
): Promise<{ targetUrl: string; allowedOrigins: string[] }> {
  const run = await ownedRun(userId, runId);
  const adapter = getApplicationAdapter(run.adapter);
  const application = await prisma.application.findFirst({
    where: { id: run.applicationId, userId },
    include: { job: true },
  });
  if (!application) throw notFound("Application not found");
  // run.targetUrl was validated at creation; re-derive the guard from policy.
  const target = adapter.resolveTarget(application.job, run.targetUrl ?? undefined);
  return { targetUrl: target.targetUrl, allowedOrigins: target.allowedOrigins };
}

export async function startRun(userId: string, runId: string): Promise<ApplicationRunInfo> {
  const run = await ownedRun(userId, runId);
  if (run.status !== "CREATED") throw unprocessable(`Run cannot start from status ${run.status}`);
  checkRunTimeout(run);
  const info = await openAndPropose(userId, run.id);
  await recordRunAudit(userId, run.applicationId, run.id, "BROWSER_FORM_INSPECTED");
  return info;
}

/**
 * Shared open → inspect → block-check → target-verify → map → propose
 * pipeline used by start (fresh run) and resume (recovery).
 */
async function openAndPropose(
  userId: string,
  runId: string,
): Promise<ApplicationRunInfo> {
  const run = await ownedRun(userId, runId);
  const adapter = getApplicationAdapter(run.adapter);
  const provider = getBrowserProvider(adapterProviderId(adapter.id));
  if (!run.sessionId) throw unprocessable("Run has no browser session");
  const { handle } = await getLiveHandle(run.sessionId, userId);
  const guard = await navigationGuard(userId, runId);

  await prisma.applicationRun.update({
    where: { id: run.id },
    data: { status: "OPENING", currentStep: "opening", startedAt: run.startedAt ?? new Date() },
  });
  await setSessionStatus(run.sessionId, "RUNNING");
  let inspection: PageInspection;
  try {
    const snapshot = await provider.navigate(handle, guard.targetUrl, guard.allowedOrigins);
    await touchSession(run.sessionId, snapshot);
    await prisma.applicationRun.update({ where: { id: run.id }, data: { status: "INSPECTING", currentStep: "inspecting" } });
    inspection = await provider.inspectForm(handle);
  } catch (err) {
    await failRun(userId, run, "NAVIGATION_FAILED", "Could not open the application page. Check the target URL and try again.");
    return getRunInfo(userId, run.id);
  }
  logRun("application_form_inspected", run.id, userId, { fieldCount: inspection.fields.length });

  const block = adapter.detectBlock(inspection);
  if (block.blocked) {
    await prisma.applicationRun.update({
      where: { id: run.id },
      data: { status: "BLOCKED", currentStep: "blocked", errorCode: block.code, errorMessage: block.message },
    });
    await setSessionStatus(run.sessionId, block.code === "LOGIN_REQUIRED" ? "WAITING_FOR_LOGIN" : "BLOCKED");
    logRun("application_blocked", run.id, userId, { code: block.code });
    await recordRunAudit(
      userId,
      run.applicationId,
      run.id,
      block.code === "LOGIN_REQUIRED" ? "BROWSER_LOGIN_REQUIRED" : "BROWSER_SUBMISSION_BLOCKED",
    );
    return getRunInfo(userId, run.id);
  }

  // Production adapters verify the page belongs to the expected job.
  if (adapter.verifyTarget) {
    const check = adapter.verifyTarget(inspection, { title: run.job.title, companyName: run.job.companyName });
    if (!check.ok) {
      await failRun(userId, run, "FORM_CHANGED", check.reason ?? "The application page does not match the expected job");
      return getRunInfo(userId, run.id);
    }
  }

  await prisma.applicationRun.update({ where: { id: run.id }, data: { status: "MAPPING", currentStep: "mapping" } });
  const candidate = await buildCandidateData(userId);
  const answerProvider = getAnswerProvider();
  // Phase 16 — approved personalization overlay: latest APPROVED draft only
  // (null when none). REVIEW_REQUIRED content never reaches proposals.
  // Best-effort: personalization failures never block answer generation.
  let approvedContent: { coverLetterText: string | null; selectedProjectIds: string[] } | null = null;
  try {
    const approved = await getApprovedDraft(userId, run.applicationId);
    if (approved) {
      const content = approved.content as {
        coverLetter?: { text: string } | null;
        selectedProjects?: { projectId: string }[];
      };
      approvedContent = {
        coverLetterText: content.coverLetter?.text ?? null,
        selectedProjectIds: (content.selectedProjects ?? []).map((p) => p.projectId),
      };
    }
  } catch {
    approvedContent = null;
  }
  const job = { title: run.job.title, companyName: run.job.companyName, description: run.job.description };
  let proposed = 0;
  let needsInput = 0;
  for (const field of inspection.fields as PageFormField[]) {
    const mapped = adapter.mapField(field);
    if (mapped.mapping === "UNSUPPORTED_SENSITIVE_FIELD") {
      await prisma.applicationAnswer.upsert({
        where: { runId_fieldId: { runId: run.id, fieldId: field.ref } },
        update: {},
        create: {
          runId: run.id,
          fieldId: field.ref,
          label: field.label,
          fieldType: mapped.fieldType,
          required: field.required,
          mapping: mapped.mapping,
          proposedValue: "",
          source: "none",
          status: "NEEDS_USER_INPUT",
        },
      });
      needsInput += 1;
      continue;
    }
    const resolved = applyApprovedContent(
      mapped.mapping,
      answerProvider.resolve(mapped.mapping, candidate, job),
      candidate,
      approvedContent,
    );
    await prisma.applicationAnswer.upsert({
      where: { runId_fieldId: { runId: run.id, fieldId: field.ref } },
      update: {},
      create: {
        runId: run.id,
        fieldId: field.ref,
        label: field.label,
        fieldType: mapped.fieldType,
        required: field.required,
        mapping: mapped.mapping,
        proposedValue: resolved.value,
        source: resolved.source,
        status: resolved.needsInput ? "NEEDS_USER_INPUT" : "PROPOSED",
      },
    });
    if (resolved.needsInput) needsInput += 1;
    else proposed += 1;
  }
  await prisma.applicationRun.update({
    where: { id: run.id },
    data: { status: "WAITING_FOR_REVIEW", currentStep: "review", lastSafeCheckpoint: "review", errorCode: null, errorMessage: null },
  });
  await setSessionStatus(run.sessionId, "WAITING_FOR_USER");
  logRun("application_answers_generated", run.id, userId, { proposed, needsInput });
  await recordRunAudit(userId, run.applicationId, run.id, "BROWSER_ANSWERS_GENERATED");
  return getRunInfo(userId, run.id);
}

export async function approveRun(userId: string, runId: string, input: ApproveAnswersInput): Promise<ApplicationRunInfo> {
  const run = await ownedRun(userId, runId);
  if (run.status !== "WAITING_FOR_REVIEW") throw unprocessable(`Run cannot be approved from status ${run.status}`);
  checkRunTimeout(run);
  for (const item of input.answers) {
    const row = await prisma.applicationAnswer.findUnique({
      where: { runId_fieldId: { runId: run.id, fieldId: item.fieldId } },
    });
    if (!row) throw badRequest(`Unknown field: ${item.fieldId}`);
    if (row.mapping === "UNSUPPORTED_SENSITIVE_FIELD") {
      throw unprocessable(`Sensitive field cannot be approved: ${item.fieldId}`);
    }
    if (item.rejected) {
      await prisma.applicationAnswer.update({ where: { id: row.id }, data: { status: "REJECTED" } });
    } else if (item.value !== undefined) {
      await prisma.applicationAnswer.update({
        where: { id: row.id },
        data: { status: "EDITED", editedValue: item.value },
      });
    } else {
      await prisma.applicationAnswer.update({ where: { id: row.id }, data: { status: "APPROVED" } });
    }
  }
  const info = await getRunInfo(userId, run.id);
  const blocking = info.answers.filter(
    (a) =>
      a.required &&
      a.mapping !== "UNSUPPORTED_SENSITIVE_FIELD" &&
      a.mapping !== "UNKNOWN" &&
      a.status !== "REJECTED" &&
      !a.proposedValue,
  );
  if (blocking.length === 0) {
    await prisma.applicationRun.update({
      where: { id: run.id },
      data: { status: "READY_TO_FILL", currentStep: "approved", lastSafeCheckpoint: "approved" },
    });
    logRun("application_approved", run.id, userId, {});
    await recordRunAudit(userId, run.applicationId, run.id, "BROWSER_REVIEW_APPROVED");
    return getRunInfo(userId, run.id);
  }
  logRun("application_approved", run.id, userId, { stillMissing: blocking.length });
  return { ...(await getRunInfo(userId, run.id)), warnings: [...info.warnings, `${blocking.length} required field(s) still need values before filling`] };
}

export async function fillRun(userId: string, runId: string): Promise<ApplicationRunInfo> {
  const run = await ownedRun(userId, runId);
  if (run.status !== "READY_TO_FILL") throw unprocessable("Run must be approved (READY_TO_FILL) before filling");
  checkRunTimeout(run);
  const adapter = getApplicationAdapter(run.adapter);
  const provider = getBrowserProvider(adapterProviderId(adapter.id));
  if (!run.sessionId) throw unprocessable("Run has no browser session");
  const { handle } = await getLiveHandle(run.sessionId, userId);
  await prisma.applicationRun.update({ where: { id: run.id }, data: { status: "FILLING", currentStep: "filling" } });
  await setSessionStatus(run.sessionId, "RUNNING");
  logRun("application_fill_started", run.id, userId, {});

  const rows = await prisma.applicationAnswer.findMany({ where: { runId: run.id } });
  // Fill policy: approved mapped answers fill automatically; UNKNOWN fields
  // fill ONLY when the user explicitly supplied a value (EDITED) — never
  // blindly. Sensitive fields and file uploads never fill.
  const fillable = rows.filter((a) => {
    if (a.mapping === "UNSUPPORTED_SENSITIVE_FIELD" || a.fieldType === "file") return false;
    const value = a.editedValue ?? a.proposedValue;
    if (!value) return false;
    if (a.status === "EDITED") return true;
    return a.status === "APPROVED" && a.mapping !== "UNKNOWN";
  });
  const outcome = await provider.fillFields(
    handle,
    fillable.map((a) => ({ ref: a.fieldId, value: (a.editedValue ?? a.proposedValue) as string })),
  );
  const mismatched = outcome.filled.filter((f) => !f.matched);
  if (outcome.errors.length > 0 || mismatched.length > 0) {
    const filledRefs = new Set(outcome.filled.filter((f) => f.matched).map((f) => f.ref));
    for (const row of rows) {
      if (filledRefs.has(row.fieldId)) {
        await prisma.applicationAnswer.update({ where: { id: row.id }, data: { filled: true } });
      }
    }
    const detail = [...outcome.errors, ...mismatched.map((m) => `verification mismatch: ${m.ref}`)].slice(0, 5).join("; ");
    await failRun(userId, run, "FORM_VALIDATION_ERROR", `Form validation failed: ${detail}`);
    return getRunInfo(userId, run.id);
  }
  for (const row of fillable) {
    await prisma.applicationAnswer.update({ where: { id: row.id }, data: { filled: true } });
  }
  const snapshot = await provider.snapshot(handle);
  await touchSession(run.sessionId, snapshot);
  await prisma.applicationRun.update({
    where: { id: run.id },
    data: { status: "WAITING_FOR_SUBMISSION", currentStep: "ready-for-submission", lastSafeCheckpoint: "filled" },
  });
  await setSessionStatus(run.sessionId, "WAITING_FOR_USER");
  logRun("application_waiting_submission", run.id, userId, { filled: fillable.length });
  await recordRunAudit(userId, run.applicationId, run.id, "BROWSER_WAITING_FOR_SUBMISSION");
  return getRunInfo(userId, run.id);
}

export async function submitRun(userId: string, runId: string): Promise<ApplicationRunInfo> {
  const guard = await verifySubmissionSafety(userId, runId);
  const { run, adapter, provider, handle } = guard;
  if (!run.sessionId) throw unprocessable("Run has no browser session");
  try {
    await provider.clickSubmit(handle);
  } catch (err) {
    const code =
      err instanceof Error && /BLOCKED|CAPTCHA|LOGIN|verification/i.test(err.message)
        ? "BLOCKED"
        : "FORM_VALIDATION_ERROR";
    const message =
      code === "BLOCKED"
        ? "Submission stopped: the site presents a verification challenge. Continue manually."
        : `Form submission failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}`;
    if (code === "BLOCKED") {
      await prisma.applicationRun.update({
        where: { id: run.id },
        data: { status: "BLOCKED", currentStep: "submitting", errorCode: code, errorMessage: message },
      });
      logRun("application_blocked", run.id, userId, { code });
    } else {
      await failRun(userId, run, code, message);
    }
    return getRunInfo(userId, run.id);
  }
  const detection = await provider.detectSubmission(handle);
  if (!detection.submitted) {
    // Ambiguous outcome: stay submittable-manually, flag it, never auto-retry.
    await prisma.applicationRun.update({
      where: { id: run.id },
      data: {
        errorCode: "SUBMISSION_STATUS_UNKNOWN",
        errorMessage: "Submission status could not be confirmed. Verify manually before retrying; automatic retry is disabled.",
        submissionUnverified: true,
      },
    });
    logRun("application_failed", run.id, userId, { code: "SUBMISSION_STATUS_UNKNOWN" });
    return getRunInfo(userId, run.id);
  }
  await prisma.applicationRun.update({
    where: { id: run.id },
    data: { status: "SUBMITTED", currentStep: "submitted", completedAt: new Date(), submissionConfirmedAt: new Date() },
  });
  await setSessionStatus(run.sessionId, "COMPLETED");
  await closeSession(run.sessionId, userId);
  await recordBrowserSubmission(userId, run.applicationId, detection.confirmationText, detection.confirmationUrl);
  logRun("application_submitted", run.id, userId, {});
  return getRunInfo(userId, run.id);
}

/**
 * Phase 8 — 14-point pre-submission safety verification. Every check that
 * fails aborts with a typed, user-safe error before any click happens:
 * 1 run owned · 2 application owned · 3 job owned · 4 session owned ·
 * 5 adapter matches · 6 origin allowed · 7 target URL allowed ·
 * 8 required fields approved · 9 no sensitive fills ·
 * 10 status WAITING_FOR_SUBMISSION (11 confirm=true enforced by Zod route) ·
 * 12 not already confirmed · duplicate-event check · ambiguous flag check ·
 * 13 session active · 14 HUMAN_CONFIRMED capability.
 */
async function verifySubmissionSafety(userId: string, runId: string) {
  // 1. Run belongs to the authenticated user.
  const run = await ownedRun(userId, runId);
  // 2. Application belongs to the user.
  const application = await prisma.application.findFirst({
    where: { id: run.applicationId, userId },
    include: { job: true },
  });
  if (!application) throw notFound("Application not found");
  // 3. Job belongs to the user.
  const job = await prisma.job.findFirst({ where: { id: run.jobId, userId } });
  if (!job || job.id !== application.jobId) throw notFound("Job not found");
  // 5. Adapter matches the run (closed registry; never arbitrary).
  const adapter = getApplicationAdapter(run.adapter);
  // 10. Correct state (checked before touching the browser).
  if (run.status !== "WAITING_FOR_SUBMISSION") {
    throw unprocessable("Final submission requires an explicitly filled run (WAITING_FOR_SUBMISSION)");
  }
  // 12. Not already confirmed + no duplicate submission on record.
  if (run.submissionConfirmedAt) {
    throw conflict("ALREADY_SUBMITTED: this run already submitted the application");
  }
  const priorSubmission = await prisma.applicationEvent.findFirst({
    where: { applicationId: run.applicationId, source: "BROWSER", note: { contains: "Browser-assisted submission" } },
  });
  if (priorSubmission) {
    throw conflict("ALREADY_SUBMITTED: this application was already submitted through browser assistance");
  }
  // Ambiguous prior outcome: manual verification required, never auto-retry.
  if (run.submissionUnverified) {
    throw conflict("SUBMISSION_STATUS_UNKNOWN: verify the application manually before retrying");
  }
  // 14. Adapter declares HUMAN_CONFIRMED submission.
  const descriptor = adapter.describe();
  if (descriptor.submissionMode !== "HUMAN_CONFIRMED" || !adapter.supportsSubmit()) {
    throw unprocessable("SUBMISSION_UNSUPPORTED: this adapter cannot verify automated submission; submit manually on the application page");
  }
  // 4 + 13. Session exists, is owned, and is live.
  if (!run.sessionId) throw unprocessable("Run has no browser session");
  const sessionRow = await prisma.browserSession.findFirst({ where: { id: run.sessionId, userId } });
  if (!sessionRow) throw notFound("Browser session not found");
  const { handle } = await getLiveHandle(run.sessionId, userId);
  const provider = getBrowserProvider(adapterProviderId(adapter.id));
  // 6 + 7. Current origin and target URL are allowed by adapter policy.
  const guard = await navigationGuard(userId, runId);
  const snapshot = await provider.snapshot(handle);
  try {
    assertNavigationAllowed(snapshot.url, guard.allowedOrigins);
  } catch {
    throw unprocessable("ORIGIN_NOT_ALLOWED: the browser is outside the approved application origin");
  }
  // 8. Required fields are approved with values.
  const answers = await prisma.applicationAnswer.findMany({ where: { runId: run.id } });
  const missing = answers.filter(
    (a) =>
      a.required &&
      a.mapping !== "UNSUPPORTED_SENSITIVE_FIELD" &&
      a.mapping !== "UNKNOWN" &&
      (a.status === "NEEDS_USER_INPUT" || !(a.editedValue ?? a.proposedValue)),
  );
  if (missing.length > 0) {
    throw unprocessable(`Required fields are not approved: ${missing.map((m) => m.fieldId).slice(0, 5).join(", ")}`);
  }
  // 9. No sensitive field may be filled.
  const sensitive = answers.filter(
    (a) => a.mapping === "UNSUPPORTED_SENSITIVE_FIELD" && (a.status === "APPROVED" || a.status === "EDITED" || a.filled),
  );
  if (sensitive.length > 0) {
    throw unprocessable(`Sensitive fields must never be filled: ${sensitive.map((s) => s.fieldId).slice(0, 5).join(", ")}`);
  }
  checkRunTimeout(run);
  return { run, adapter, provider, handle };
}

async function recordBrowserSubmission(
  userId: string,
  applicationId: string,
  confirmationText: string | null,
  confirmationUrl: string | null,
): Promise<void> {
  const application = await prisma.application.findFirst({ where: { id: applicationId, userId } });
  if (!application) return;
  const from = application.status as ApplicationStatus;
  const evidence = `Browser-assisted submission${confirmationText ? `: "${confirmationText.slice(0, 160)}"` : ""}${confirmationUrl ? ` (${confirmationUrl.slice(0, 200)})` : ""}`;
  if (canTransition(from, "APPLIED")) {
    await transitionApplication(userId, applicationId, "APPLIED", evidence, "BROWSER");
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.applicationEvent.create({
      data: {
        applicationId,
        oldStatus: from as PrismaStatus,
        newStatus: from as PrismaStatus,
        source: "BROWSER",
        note: `${evidence} (status unchanged: transition not permitted from ${from})`,
      },
    });
  });
}

export async function cancelRun(userId: string, runId: string): Promise<ApplicationRunInfo> {
  const run = await ownedRun(userId, runId);
  if (["SUBMITTED", "CANCELLED"].includes(run.status)) {
    throw unprocessable(`Run cannot be cancelled from status ${run.status}`);
  }
  if (run.sessionId) {
    try {
      await closeSession(run.sessionId, userId);
    } catch {
      // Session may already be gone; the run state is authoritative.
    }
  }
  await prisma.applicationRun.update({
    where: { id: run.id },
    data: { status: "CANCELLED", currentStep: "cancelled", completedAt: new Date() },
  });
  logRun("application_cancelled", run.id, userId, {});
  await recordRunAudit(userId, run.applicationId, run.id, "BROWSER_RUN_CANCELLED");
  return getRunInfo(userId, run.id);
}

export function supportedAdapters(): { id: string; name: string }[] {
  return listApplicationAdapters().map((a) => ({ id: a.id, name: a.name }));
}

export function adapterDescriptors(): AdapterDescriptor[] {
  return listApplicationAdapters().map((a) => a.describe());
}

/**
 * Phase 8 — resume a run from a safe state (BLOCKED, WAITING_FOR_REVIEW,
 * READY_TO_FILL, WAITING_FOR_SUBMISSION, or non-submission FAILED).
 * Relaunches a fresh browser session (manual logins and filled values do
 * not survive context loss), re-inspects, and restores the checkpoint:
 * review → WAITING_FOR_REVIEW; approved → READY_TO_FILL (re-verified);
 * filled → answers kept, filled flags reset, back to READY_TO_FILL for an
 * explicit re-fill. Bounded by MAX_RESUMES. Never resumes SUBMITTED runs
 * and never retries ambiguous submissions (resolve first).
 */
const RESUMABLE_STATUSES = ["BLOCKED", "WAITING_FOR_REVIEW", "READY_TO_FILL", "WAITING_FOR_SUBMISSION", "FAILED"];

export async function resumeRun(userId: string, runId: string, reason?: string): Promise<ApplicationRunInfo> {
  const run = await ownedRun(userId, runId);
  if (!RESUMABLE_STATUSES.includes(run.status)) {
    throw unprocessable(`Run cannot resume from status ${run.status}`);
  }
  if (run.submissionUnverified) {
    throw conflict("SUBMISSION_STATUS_UNKNOWN: resolve the ambiguous submission before resuming");
  }
  if (run.retryCount >= MAX_RESUMES) {
    throw unprocessable("RESOURCE_LIMIT: this run has exhausted its resume budget; recover into a new run instead");
  }
  checkRunTimeout(run);
  const adapter = getApplicationAdapter(run.adapter);
  const provider = getBrowserProvider(adapterProviderId(adapter.id));

  // Fresh context: close the old session if it is still live.
  if (run.sessionId) {
    try {
      await closeSession(run.sessionId, userId);
    } catch {
      // Already gone; a new session is created below regardless.
    }
  }
  const session = await createSession(userId, adapterProviderId(adapter.id), adapter.id);
  await prisma.applicationRun.update({
    where: { id: run.id },
    data: {
      sessionId: session.id,
      retryCount: run.retryCount + 1,
      recoveryReason: reason?.slice(0, 500) ?? run.recoveryReason,
      errorCode: null,
      errorMessage: null,
    },
  });
  const info = await openAndPropose(userId, run.id);
  if (!["WAITING_FOR_REVIEW", "BLOCKED", "FAILED"].includes(info.status)) {
    throw unprocessable(`Resume produced unexpected status ${info.status}`);
  }
  if (info.status !== "WAITING_FOR_REVIEW") return info;

  // Restore the checkpoint on the fresh inspection.
  const checkpoint = run.lastSafeCheckpoint;
  const answers = await prisma.applicationAnswer.findMany({ where: { runId: run.id } });
  if (checkpoint === "approved" || checkpoint === "filled") {
    const missing = answers.filter(
      (a) =>
        a.required &&
        a.mapping !== "UNSUPPORTED_SENSITIVE_FIELD" &&
        a.mapping !== "UNKNOWN" &&
        !(a.editedValue ?? a.proposedValue),
    );
    if (missing.length > 0) {
      return info; // approvals no longer complete: stay in review.
    }
    // Approvals carry over (user-approved values are preserved); filled
    // flags reset because the browser context is new — re-fill explicitly.
    await prisma.applicationAnswer.updateMany({ where: { runId: run.id }, data: { filled: false } });
    await prisma.applicationRun.update({
      where: { id: run.id },
      data: { status: "READY_TO_FILL", currentStep: "resumed-approved" },
    });
    logRun("application_resumed", run.id, userId, { checkpoint });
    await recordRunAudit(userId, run.applicationId, run.id, "BROWSER_RUN_RESUMED");
    return getRunInfo(userId, run.id);
  }
  logRun("application_resumed", run.id, userId, { checkpoint: checkpoint ?? "review" });
  await recordRunAudit(userId, run.applicationId, run.id, "BROWSER_RUN_RESUMED");
  return info;
}

/**
 * Phase 8 — recover into a NEW run from a terminal safe run
 * (FAILED, BLOCKED, CANCELLED). Approved/edited answers carry over as
 * EDITED values; SUBMITTED runs can never be replayed. Bounded by the
 * source run's resume budget.
 */
export async function recoverRun(userId: string, runId: string, reason: string): Promise<ApplicationRunInfo> {
  const source = await ownedRun(userId, runId);
  if (!["FAILED", "BLOCKED", "CANCELLED"].includes(source.status)) {
    throw unprocessable(`Only terminal safe runs can be recovered (status ${source.status})`);
  }
  if (source.submissionUnverified) {
    throw conflict("SUBMISSION_STATUS_UNKNOWN: resolve the ambiguous submission before recovering");
  }
  if (source.retryCount >= MAX_RESUMES) {
    throw unprocessable("RESOURCE_LIMIT: this run has exhausted its recovery budget");
  }
  // The source run is terminal: close its session (if still live) so
  // recovery never leaks browser contexts.
  if (source.sessionId) {
    try {
      await closeSession(source.sessionId, userId);
    } catch {
      // Already gone; the new session is created below regardless.
    }
  }
  const adapter = getApplicationAdapter(source.adapter);
  const target = adapter.resolveTarget(source.job, source.targetUrl ?? undefined);
  const providerId = adapterProviderId(adapter.id);
  const session = await createSession(userId, providerId, adapter.id);
  const created = await prisma.applicationRun.create({
    data: {
      userId,
      applicationId: source.applicationId,
      jobId: source.jobId,
      sessionId: session.id,
      adapter: adapter.id,
      status: "CREATED",
      currentStep: "created",
      targetUrl: target.targetUrl,
      retryCount: source.retryCount + 1,
      resumedFromRunId: source.id,
      recoveryReason: reason.slice(0, 500),
    },
  });
  // Carry over user-approved/edited values (never sensitive mappings).
  const prior = await prisma.applicationAnswer.findMany({ where: { runId: source.id } });
  for (const row of prior) {
    if (row.mapping === "UNSUPPORTED_SENSITIVE_FIELD") continue;
    const value = row.editedValue ?? row.proposedValue;
    if (!value) continue;
    if (row.status !== "APPROVED" && row.status !== "EDITED") continue;
    await prisma.applicationAnswer.upsert({
      where: { runId_fieldId: { runId: created.id, fieldId: row.fieldId } },
      update: {},
      create: {
        runId: created.id,
        fieldId: row.fieldId,
        label: row.label,
        fieldType: row.fieldType,
        required: row.required,
        mapping: row.mapping,
        proposedValue: value,
        source: row.source,
        status: "EDITED",
      },
    });
  }
  logRun("application_recovered", created.id, userId, { from: source.id });
  await recordRunAudit(userId, created.applicationId, created.id, "BROWSER_RUN_RECOVERED");
  return getRunInfo(userId, created.id);
}

/**
 * Phase 8 — user attests an ambiguous submission outcome after MANUAL
 * verification. "submitted" completes the run without clicking anything;
 * "not-submitted" clears the flag back to WAITING_FOR_SUBMISSION.
 * Never auto-retries.
 */
export async function resolveSubmission(
  userId: string,
  runId: string,
  input: ResolveSubmissionInput,
): Promise<ApplicationRunInfo> {
  const run = await ownedRun(userId, runId);
  if (!run.submissionUnverified) {
    throw unprocessable("This run has no ambiguous submission to resolve");
  }
  if (input.outcome === "submitted") {
    const prior = await prisma.applicationEvent.findFirst({
      where: { applicationId: run.applicationId, source: "BROWSER", note: { contains: "Browser-assisted submission" } },
    });
    await prisma.applicationRun.update({
      where: { id: run.id },
      data: {
        status: "SUBMITTED",
        currentStep: "submitted-manually-verified",
        completedAt: new Date(),
        submissionConfirmedAt: new Date(),
        submissionUnverified: false,
        errorCode: null,
        errorMessage: null,
      },
    });
    if (!prior) {
      await recordBrowserSubmission(userId, run.applicationId, "Manually verified by user", null);
    }
    if (run.sessionId) {
      try {
        await closeSession(run.sessionId, userId);
      } catch {
        // Best-effort cleanup.
      }
    }
    logRun("application_submitted", run.id, userId, { manuallyVerified: true });
    return getRunInfo(userId, run.id);
  }
  await prisma.applicationRun.update({
    where: { id: run.id },
    data: { submissionUnverified: false, errorCode: null, errorMessage: null },
  });
  logRun("application_submission_cleared", run.id, userId, {});
  return getRunInfo(userId, run.id);
}
