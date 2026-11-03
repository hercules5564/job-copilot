import { z } from "zod";

/**
 * Phase 3 — shared job-source contracts.
 * Stable search/raw-job/ingestion shapes every source adapter implements.
 * Deterministic only: no LLM, no embeddings, no scoring here.
 */

/** Bounded search contract shared by all source adapters. */
export const JobSearchParamsSchema = z.object({
  query: z.string().trim().max(200).optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  remote: z.boolean().optional().nullable(),
  employmentType: z.string().trim().max(100).optional().nullable(),
  page: z.number().int().min(1).max(100).default(1),
  limit: z.number().int().min(1).max(50).default(20),
  // Phase 10B: board token for board-based public sources (e.g. Greenhouse).
  // Charset-validated; interpolated into a fixed server-side endpoint
  // template only — never treated as a URL (SSRF guard).
  board: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .optional()
    .nullable(),
});

export type JobSearchParams = z.infer<typeof JobSearchParamsSchema>;

/** Adapter/service-layer input (pre-default application): all fields optional. */
export type JobSearchParamsInput = z.input<typeof JobSearchParamsSchema>;

/**
 * Raw job as returned by a source adapter (pre-normalization).
 * Optional fields stay optional — adapters must NOT invent missing data.
 */
export const RawJobSchema = z.object({
  externalId: z.string().min(1).max(500),
  source: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  company: z.string().min(1).max(500),
  companyUrl: z.string().url().max(2000).optional().nullable(),
  jobUrl: z.string().url().max(2000).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  remote: z.boolean().optional().nullable(),
  employmentType: z.string().max(100).optional().nullable(),
  salaryMin: z.number().nonnegative().optional().nullable(),
  salaryMax: z.number().nonnegative().optional().nullable(),
  salaryCurrency: z.string().max(10).optional().nullable(),
  description: z.string().min(1).max(100000),
  postedAt: z.string().max(100).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type RawJob = z.infer<typeof RawJobSchema>;

/** Request body for POST /api/jobs/ingest. No arbitrary URLs (SSRF guard). */
export const IngestJobsSchema = z.object({
  source: z.string().min(1).max(100),
  query: z.string().trim().max(200).optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  remote: z.boolean().optional().nullable(),
  employmentType: z.string().trim().max(100).optional().nullable(),
  limit: z.number().int().min(1).max(50).default(20),
  // Phase 10A: async mode enqueues a job-ingestion job (202 Accepted)
  // instead of running ingestion inline. Default preserves sync behavior.
  async: z.boolean().default(false),
});

export type IngestJobsInput = z.infer<typeof IngestJobsSchema>;

/** Service-layer input (pre-default application): `async`/`limit` optional. */
export type IngestJobsRequest = z.input<typeof IngestJobsSchema> & {
  /** Board token for board-based sources (service/discovery only, never the public API body). */
  board?: string | null | undefined;
};

/** Structured per-run ingestion statistics. */
export const IngestionResultSchema = z.object({
  source: z.string(),
  fetched: z.number().int().nonnegative(),
  normalized: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  errors: z.array(
    z.object({
      externalId: z.string().optional(),
      reason: z.string(),
    }),
  ),
  durationMs: z.number().int().nonnegative(),
  // Phase 10B: ids of created/refreshed rows (opt-in via includeJobIds;
  // bounded summaries travel in Redis, never full records).
  jobIds: z.array(z.string()).default([]),
});

export type IngestionResult = z.infer<typeof IngestionResultSchema>;

/** Public source metadata for GET /api/jobs/sources. Never includes secrets. */
export const JobSourceInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  available: z.boolean(),
  mock: z.boolean(),
  capabilities: z.object({
    query: z.boolean(),
    location: z.boolean(),
    remote: z.boolean(),
    employmentType: z.boolean(),
    pagination: z.boolean(),
    // Phase 10B: whether the source natively exposes hiring-signal data
    // beyond plain listings (false for all current sources; reserved).
    signals: z.boolean(),
  }),
  // Phase 10B: bounded request behavior (politeness contract, no secrets).
  limits: z.object({
    timeoutMs: z.number().int().positive(),
    maxRequestsPerRun: z.number().int().positive(),
    maxResults: z.number().int().positive(),
  }),
});

export type JobSourceInfo = z.infer<typeof JobSourceInfoSchema>;
