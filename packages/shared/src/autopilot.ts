import { z } from "zod";

/**
 * Phase 20 — autopilot contracts.
 * Autopilot prepares applications (match → application → run → fill) and
 * stops at WAITING_FOR_SUBMISSION. Submission stays human-confirmed.
 */

export const AutopilotRunRequestSchema = z.object({
  limit: z.number().int().min(1).max(10).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  jobIds: z.array(z.string().min(1).max(200)).max(20).optional(),
});

export type AutopilotRunRequest = z.infer<typeof AutopilotRunRequestSchema>;

export const AutopilotItemStatusSchema = z.enum([
  "filled",
  "needs_input",
  "blocked",
  "failed",
  "skipped",
]);

export type AutopilotItemStatus = z.infer<typeof AutopilotItemStatusSchema>;

export const AutopilotItemSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  companyName: z.string(),
  score: z.number().int(),
  applicationId: z.string().nullable(),
  runId: z.string().nullable(),
  adapter: z.string().nullable(),
  targetUrl: z.string().nullable(),
  status: AutopilotItemStatusSchema,
  message: z.string().nullable(),
});

export type AutopilotItem = z.infer<typeof AutopilotItemSchema>;

export const AutopilotSummarySchema = z.object({
  evaluated: z.number().int().nonnegative(),
  attempted: z.number().int().nonnegative(),
  filled: z.number().int().nonnegative(),
  needsInput: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  items: z.array(AutopilotItemSchema).max(10),
  durationMs: z.number().int().nonnegative(),
});

export type AutopilotSummary = z.infer<typeof AutopilotSummarySchema>;
