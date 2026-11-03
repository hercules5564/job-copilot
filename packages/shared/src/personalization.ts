import { z } from "zod";

/**
 * Phase 15 — AI application personalization contracts.
 * Structured, fact-grounded generation only: every factual claim must cite
 * a FactReference from the candidate inventory; missing facts produce
 * NEEDS_USER_INPUT, never invented text. AI output is always a
 * REVIEW_REQUIRED draft until explicit human approval.
 */

// ---- context bounds (never silently construct enormous prompts) ----------

export const PERSONALIZATION_BOUNDS = {
  /** Maximum resume text characters sent to the provider. */
  maxResumeChars: 4000,
  /** Maximum projects included in candidate context. */
  maxProjects: 5,
  /** Maximum characters per project description. */
  maxProjectDescChars: 1000,
  /** Maximum job description characters sent to the provider. */
  maxJobDescChars: 6000,
  /** Maximum skills included in candidate context. */
  maxSkills: 50,
  /** Maximum application questions per generation request. */
  maxQuestions: 10,
  /** Maximum characters per application question. */
  maxQuestionChars: 500,
  /** Maximum drafts retained per application (cost/table-growth guard). */
  maxDraftsPerApplication: 20,
} as const;

// ---- fact provenance ------------------------------------------------------

/** Where a candidate fact came from. The model must never invent these. */
export const FactSourceTypeSchema = z.enum(["profile", "resume", "project", "job", "match"]);

export type FactSourceType = z.infer<typeof FactSourceTypeSchema>;

/**
 * One traceable candidate fact. Values are bounded display strings drawn
 * from the authenticated user's own records — never provider output.
 */
export const FactReferenceSchema = z.object({
  id: z.string().min(1).max(200),
  sourceType: FactSourceTypeSchema,
  sourceId: z.string().min(1).max(200),
  field: z.string().min(1).max(100),
  value: z.string().min(1).max(500),
});

export type FactReference = z.infer<typeof FactReferenceSchema>;

// ---- draft content (structured output — never arbitrary markdown) ---------

export const DraftAnswerStatusSchema = z.enum(["ANSWERED", "NEEDS_USER_INPUT"]);

export type DraftAnswerStatus = z.infer<typeof DraftAnswerStatusSchema>;

const usedFactIds = z.array(z.string().min(1).max(200)).max(20).default([]);
const warnings = z.array(z.string().min(1).max(300)).max(10).default([]);

export const DraftAnswerSchema = z.object({
  question: z.string().trim().min(1).max(500),
  /** Empty when status is NEEDS_USER_INPUT (missing facts are never filled). */
  answer: z.string().max(2000).default(""),
  status: DraftAnswerStatusSchema,
  usedFactIds,
  warnings,
});

export type DraftAnswer = z.infer<typeof DraftAnswerSchema>;

export const SelectedProjectSchema = z.object({
  /** Must be an existing project id owned by the user (validated server-side). */
  projectId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  rationale: z.string().max(500).default(""),
  matchedSkills: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
});

export type SelectedProject = z.infer<typeof SelectedProjectSchema>;

export const DraftSummarySchema = z.object({
  text: z.string().max(1500),
  usedFactIds,
  warnings,
});

export type DraftSummary = z.infer<typeof DraftSummarySchema>;

export const DraftCoverLetterSchema = z.object({
  text: z.string().max(4000),
  usedFactIds,
  warnings,
});

export type DraftCoverLetter = z.infer<typeof DraftCoverLetterSchema>;

export const ApplicationDraftContentSchema = z.object({
  summary: DraftSummarySchema.nullable().default(null),
  coverLetter: DraftCoverLetterSchema.nullable().default(null),
  answers: z.array(DraftAnswerSchema).max(10).default([]),
  selectedProjects: z.array(SelectedProjectSchema).max(5).default([]),
  warnings: z.array(z.string().min(1).max(300)).max(20).default([]),
});

export type ApplicationDraftContent = z.infer<typeof ApplicationDraftContentSchema>;

// ---- draft lifecycle ------------------------------------------------------

export const DraftStatusSchema = z.enum(["DRAFT", "REVIEW_REQUIRED", "APPROVED", "REJECTED"]);

export type DraftStatus = z.infer<typeof DraftStatusSchema>;

// ---- API requests ---------------------------------------------------------

/** POST .../personalization/generate — all fields optional, all bounded. */
export const GenerateDraftRequestSchema = z.object({
  resumeId: z.string().trim().min(1).max(200).optional().nullable(),
  includeSummary: z.boolean().default(true),
  includeCoverLetter: z.boolean().default(true),
  questions: z
    .array(z.string().trim().min(1).max(PERSONALIZATION_BOUNDS.maxQuestionChars))
    .max(PERSONALIZATION_BOUNDS.maxQuestions)
    .default([]),
});

export type GenerateDraftRequest = z.infer<typeof GenerateDraftRequestSchema>;

/** PATCH .../drafts/:draftId — user edits; stays REVIEW_REQUIRED, marked edited. */
export const EditDraftRequestSchema = z
  .object({
    summaryText: z.string().max(1500).nullable().optional(),
    coverLetterText: z.string().max(4000).nullable().optional(),
    answers: z
      .array(
        z.object({
          question: z.string().trim().min(1).max(500),
          answer: z.string().max(2000),
        }),
      )
      .max(10)
      .optional(),
  })
  .refine((v) => v.summaryText !== undefined || v.coverLetterText !== undefined || v.answers !== undefined, {
    message: "At least one editable field is required",
  });

export type EditDraftRequest = z.infer<typeof EditDraftRequestSchema>;
