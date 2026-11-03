import type {
  JobSearchParamsInput,
  JobSourceInfo,
  RawJob,
} from "@jobcopilot/shared";

/**
 * Phase 3 — job source adapter interface.
 *
 * Rules:
 * - Adapters NEVER touch Prisma. They return raw source data only.
 * - Adapters NEVER accept arbitrary URLs (SSRF guard): the ingestion
 *   service selects a registered adapter by ID; user input only fills
 *   bounded search fields.
 * - Adapters MUST NOT invent fields the source cannot provide.
 */
export interface JobSourceAdapter {
  /** Stable registry key, e.g. "arbeitnow". Matches Job.sourceKey. */
  readonly id: string;
  /** Human-readable name for UI/logs. */
  readonly name: string;
  /** True for deterministic offline fixtures (never a "real" source). */
  readonly mock: boolean;
  /** Fetch raw jobs for the given search. Bounded by params.limit. */
  search(params: JobSearchParamsInput): Promise<RawJob[]>;
  /** Public metadata for GET /api/jobs/sources. No secrets. */
  info(): JobSourceInfo;
}

export type { JobSearchParamsInput as JobSearchParams, JobSourceInfo, RawJob };
