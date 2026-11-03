import { IngestionJobPayloadSchema, type IngestionJobPayload } from "@jobcopilot/shared";
import { getSource } from "../sources/registry.js";
import { ingestJobs } from "../services/job-ingestion.js";
import { parseQueuePayload, requireQueueUser } from "./_common.js";

/**
 * Phase 10A — ingestion processor. Reuses the existing pipeline
 * (fetch → normalize → validate → dedup → persist). Unknown sources fail
 * permanently (closed registry); adapter/network failures are contained
 * inside ingestJobs and reported as bounded summaries, not throws.
 */

export interface IngestionSummary {
  source: string;
  inserted: number;
  updated: number;
  duplicates: number;
  rejected: number;
}

export async function processIngestionJob(data: unknown): Promise<IngestionSummary> {
  const payload: IngestionJobPayload = parseQueuePayload(IngestionJobPayloadSchema, data);
  await requireQueueUser(payload.userId);
  // Closed source registry: unknown ids throw (classified permanent).
  const adapter = getSource(payload.source);
  const result = await ingestJobs(payload.userId, {
    source: payload.source,
    query: payload.query ?? undefined,
    location: payload.location ?? undefined,
    remote: payload.remote ?? undefined,
    employmentType: payload.employmentType ?? undefined,
    limit: payload.limit,
    async: false,
  });
  void adapter;
  return {
    source: result.source,
    inserted: result.inserted,
    updated: result.updated,
    duplicates: result.duplicates,
    rejected: result.rejected,
  };
}
