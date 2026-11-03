import { z } from "zod";

/**
 * Phase 7 — browser-assisted application contracts.
 * Human-in-the-loop: automation prepares, the user approves and submits.
 * No CAPTCHA solving, no stealth, no credential handling.
 */

export const BrowserSessionStatusSchema = z.enum([
  "CREATED",
  "STARTING",
  "READY",
  "WAITING_FOR_USER",
  "RUNNING",
  "BLOCKED",
  "FAILED",
  "COMPLETED",
  "EXPIRED",
  "CLOSED",
]);

export type BrowserSessionStatus = z.infer<typeof BrowserSessionStatusSchema>;

export const ApplicationRunStatusSchema = z.enum([
  "CREATED",
  "OPENING",
  "INSPECTING",
  "MAPPING",
  "WAITING_FOR_REVIEW",
  "READY_TO_FILL",
  "FILLING",
  "WAITING_FOR_SUBMISSION",
  "SUBMITTED",
  "BLOCKED",
  "FAILED",
  "CANCELLED",
]);

export type ApplicationRunStatus = z.infer<typeof ApplicationRunStatusSchema>;

/** Form field types the inspector may report (never passwords/credentials). */
export const FormFieldTypeSchema = z.enum([
  "text",
  "email",
  "phone",
  "url",
  "textarea",
  "select",
  "radio",
  "checkbox",
  "file",
  "unknown",
  "unsupported",
]);

export type FormFieldType = z.infer<typeof FormFieldTypeSchema>;

/** Deterministic mapping targets (candidate data keys). */
export const FieldMappingSchema = z.enum([
  "candidate.fullName",
  "candidate.email",
  "candidate.phone",
  "candidate.githubUrl",
  "candidate.portfolioUrl",
  "candidate.linkedinUrl",
  "candidate.experience",
  "candidate.education",
  "candidate.skills",
  "candidate.location",
  "candidate.coverLetter",
  "candidate.projects",
  "candidate.resume",
  "UNKNOWN",
  "UNSUPPORTED_SENSITIVE_FIELD",
]);

export type FieldMapping = z.infer<typeof FieldMappingSchema>;

export const AnswerStatusSchema = z.enum([
  "PROPOSED",
  "APPROVED",
  "EDITED",
  "REJECTED",
  "NEEDS_USER_INPUT",
]);

export type AnswerStatus = z.infer<typeof AnswerStatusSchema>;

export const InspectedFieldSchema = z.object({
  fieldId: z.string().min(1).max(300),
  label: z.string().max(500).default(""),
  name: z.string().max(300).default(""),
  type: FormFieldTypeSchema,
  required: z.boolean().default(false),
  options: z.array(z.string().max(300)).default([]),
  placeholder: z.string().max(500).default(""),
  autocomplete: z.string().max(100).default(""),
  mapping: FieldMappingSchema,
});

export type InspectedField = z.infer<typeof InspectedFieldSchema>;

export const ProposedAnswerSchema = z.object({
  fieldId: z.string().min(1).max(300),
  label: z.string().max(500).default(""),
  fieldType: FormFieldTypeSchema,
  required: z.boolean().default(false),
  mapping: FieldMappingSchema,
  proposedValue: z.string().max(8000).default(""),
  /** Where the value came from: profile | resume | project:<id> | user | none */
  source: z.string().max(300).default("none"),
  status: AnswerStatusSchema,
});

export type ProposedAnswer = z.infer<typeof ProposedAnswerSchema>;

/** POST /api/applications/:id/runs */
export const CreateApplicationRunSchema = z.object({
  /** Closed adapter ids only. No arbitrary execution. */
  adapter: z.enum(["demo", "generic", "fixture-ats"]).default("demo"),
  /** Override target URL (tests/demo/fixture only; validated same-origin policy server-side). */
  targetUrl: z.string().url().max(2000).optional(),
});

export type CreateApplicationRunInput = z.infer<typeof CreateApplicationRunSchema>;

/** POST /api/application-runs/:id/approve */
export const ApproveAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        fieldId: z.string().min(1).max(300),
        /** User-edited value (marks answer EDITED). Omit to approve as proposed. */
        value: z.string().max(8000).optional(),
        /** Explicitly reject a proposed answer. */
        rejected: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(100),
});

export type ApproveAnswersInput = z.infer<typeof ApproveAnswersSchema>;

/** POST /api/application-runs/:id/submit — second explicit confirmation. */
export const ConfirmSubmitSchema = z.object({
  confirm: z.literal(true),
});

export type ConfirmSubmitInput = z.infer<typeof ConfirmSubmitSchema>;

/* ------------------------------------------------------------------ */
/* Phase 8 — explicit adapter capabilities, safe errors, recovery.     */
/* ------------------------------------------------------------------ */

/** What an adapter may do. Declared explicitly per adapter, never assumed. */
export const AdapterCapabilitySchema = z.enum([
  "inspect",
  "mapFields",
  "generateAnswers",
  "fill",
  "submit",
  "manualLogin",
  "resume",
  "fileUpload",
  "externalNavigation",
]);

export type AdapterCapability = z.infer<typeof AdapterCapabilitySchema>;

/**
 * Submission posture. There is deliberately NO unrestricted automatic mode:
 * - UNSUPPORTED: adapter never submits (unknown/unverified sites).
 * - MANUAL_ONLY: user always submits manually on the target site.
 * - HUMAN_CONFIRMED: adapter may click submit only after explicit user
 *   confirmation on a verified, supported flow.
 */
export const SubmissionModeSchema = z.enum(["UNSUPPORTED", "MANUAL_ONLY", "HUMAN_CONFIRMED"]);

export type SubmissionMode = z.infer<typeof SubmissionModeSchema>;

export const AdapterDescriptorSchema = z.object({
  adapterId: z.string(),
  displayName: z.string(),
  submissionMode: SubmissionModeSchema,
  capabilities: z.array(AdapterCapabilitySchema),
  manualLogin: z.boolean(),
});

export type AdapterDescriptor = z.infer<typeof AdapterDescriptorSchema>;

/** Structured, safe browser/run error codes (no secrets, no stack traces). */
export const BrowserErrorCodeSchema = z.enum([
  "CAPTCHA_DETECTED",
  "LOGIN_REQUIRED",
  "ACCESS_DENIED",
  "ORIGIN_NOT_ALLOWED",
  "SESSION_EXPIRED",
  "SESSION_NOT_FOUND",
  "ADAPTER_UNSUPPORTED",
  "FORM_CHANGED",
  "FORM_VALIDATION_ERROR",
  "SENSITIVE_FIELD",
  "SUBMISSION_UNSUPPORTED",
  "SUBMISSION_ALREADY_CONFIRMED",
  "SUBMISSION_STATUS_UNKNOWN",
  "ALREADY_SUBMITTED",
  "BROWSER_TIMEOUT",
  "BROWSER_CRASH",
  "RESOURCE_LIMIT",
  "RUN_TIMEOUT",
  "NAVIGATION_FAILED",
  "SUBMISSION_UNVERIFIED",
  "MANUAL_ACTION_REQUIRED",
]);

export type BrowserErrorCode = z.infer<typeof BrowserErrorCodeSchema>;

/** POST /api/application-runs/:id/resume — continue after manual action. */
export const ResumeRunSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type ResumeRunInput = z.infer<typeof ResumeRunSchema>;

/** POST /api/application-runs/:id/recover — new run from a safe run. */
export const RecoverRunSchema = z.object({
  reason: z.string().min(1).max(500),
});

export type RecoverRunInput = z.infer<typeof RecoverRunSchema>;

/** POST /api/application-runs/:id/resolve — user attests ambiguous outcome. */
export const ResolveSubmissionSchema = z.object({
  outcome: z.enum(["submitted", "not-submitted"]),
});

export type ResolveSubmissionInput = z.infer<typeof ResolveSubmissionSchema>;

/** Safe run summary for API responses (never cookies/tokens/values beyond answers). */
export const ApplicationRunInfoSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  jobId: z.string(),
  adapter: z.string(),
  status: ApplicationRunStatusSchema,
  currentStep: z.string(),
  targetUrl: z.string().nullable().optional(),
  currentUrl: z.string().nullable().optional(),
  currentTitle: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  fields: z.array(InspectedFieldSchema).default([]),
  answers: z.array(ProposedAnswerSchema).default([]),
  filledFields: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Phase 8: capabilities, session state, recovery metadata.
  capabilities: z.array(AdapterCapabilitySchema).default([]),
  submissionMode: SubmissionModeSchema.default("UNSUPPORTED"),
  sessionStatus: z.string().nullable().optional(),
  sessionMode: z.string().nullable().optional(),
  retryCount: z.number().int().nonnegative().default(0),
  resumedFromRunId: z.string().nullable().optional(),
  recoveryReason: z.string().nullable().optional(),
  submissionConfirmedAt: z.string().nullable().optional(),
  lastSafeCheckpoint: z.string().nullable().optional(),
});

export type ApplicationRunInfo = z.infer<typeof ApplicationRunInfoSchema>;
