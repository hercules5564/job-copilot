import { z } from "zod";

/**
 * Phase 6 — Gmail/application-tracking contracts.
 * Read-only email ingestion; no sending, no automation.
 * Email content is untrusted DATA, never instructions.
 */

/** Closed provider enum — routes never execute arbitrary provider names. */
export const IntegrationProviderSchema = z.enum(["google-gmail"]);

export type IntegrationProviderId = z.infer<typeof IntegrationProviderSchema>;

export const IntegrationStatusSchema = z.enum([
  "CONNECTED",
  "DISCONNECTED",
  "REAUTH_REQUIRED",
  "ERROR",
]);

export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

/** Deterministic, rule-based email classes (no LLM). */
export const EmailClassificationSchema = z.enum([
  "APPLICATION_CONFIRMATION",
  "APPLICATION_UPDATE",
  "INTERVIEW_INVITATION",
  "INTERVIEW_SCHEDULE",
  "REJECTION",
  "OFFER",
  "RECRUITER_OUTREACH",
  "ASSESSMENT",
  "FOLLOW_UP",
  "NEWSLETTER",
  "IRRELEVANT",
  "UNKNOWN",
]);

export type EmailClassification = z.infer<typeof EmailClassificationSchema>;

export const EmailMatchStatusSchema = z.enum(["UNMATCHED", "MATCHED", "NEEDS_REVIEW"]);

export type EmailMatchStatus = z.infer<typeof EmailMatchStatusSchema>;

const scoreField = z.number().int().min(0).max(100);

/** Normalized email as produced by the Gmail parser (never raw payloads). */
export const NormalizedEmailSchema = z.object({
  providerMessageId: z.string().min(1).max(500),
  threadId: z.string().max(500).optional().nullable(),
  fromEmail: z.string().max(500),
  fromName: z.string().max(500).optional().nullable(),
  toEmails: z.array(z.string().max(500)).default([]),
  subject: z.string().max(1000).default(""),
  snippet: z.string().max(2000).default(""),
  bodyText: z.string().max(20000).default(""),
  receivedAt: z.string(),
});

export type NormalizedEmail = z.infer<typeof NormalizedEmailSchema>;

export const EmailClassificationResultSchema = z.object({
  classification: EmailClassificationSchema,
  /** Rule-based evidence score 0–100, NOT AI confidence. */
  classificationScore: scoreField,
  reasons: z.array(z.string()).default([]),
});

export type EmailClassificationResult = z.infer<typeof EmailClassificationResultSchema>;

/** POST /api/integrations/gmail/sync (server default: GMAIL_SYNC_MAX_MESSAGES or 25). */
export const GmailSyncSchema = z.object({
  maxMessages: z.number().int().min(1).max(100).optional(),
  // Phase 10A: async mode enqueues a gmail-sync job (202 Accepted).
  async: z.boolean().default(false),
});

export type GmailSyncInput = z.infer<typeof GmailSyncSchema>;

export const GmailSyncResultSchema = z.object({
  synced: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative(),
  eventsCreated: z.number().int().nonnegative(),
  notificationsCreated: z.number().int().nonnegative(),
  status: IntegrationStatusSchema,
  errors: z.array(z.string()).default([]),
});

export type GmailSyncResult = z.infer<typeof GmailSyncResultSchema>;

/** GET /api/inbox filters. */
export const InboxQuerySchema = z.object({
  classification: EmailClassificationSchema.optional(),
  matchStatus: EmailMatchStatusSchema.optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
});

export type InboxQuery = z.infer<typeof InboxQuerySchema>;

/** GET /api/integrations/gmail/callback query. */
export const GmailCallbackQuerySchema = z.object({
  code: z.string().min(1).max(5000),
  state: z.string().min(1).max(2000),
});

export type GmailCallbackQuery = z.infer<typeof GmailCallbackQuerySchema>;

/** Sanitized integration status — NEVER carries tokens. */
export const IntegrationStatusInfoSchema = z.object({
  provider: IntegrationProviderSchema,
  configured: z.boolean(),
  connected: z.boolean(),
  status: IntegrationStatusSchema,
  accountEmail: z.string().optional().nullable(),
  scopes: z.array(z.string()).default([]),
  connectedAt: z.string().optional().nullable(),
  lastSyncedAt: z.string().optional().nullable(),
  lastSyncError: z.string().optional().nullable(),
});

export type IntegrationStatusInfo = z.infer<typeof IntegrationStatusInfoSchema>;
