import { MatchingJobPayloadSchema, type MatchingJobPayload } from "@jobcopilot/shared";
import { runMatchForJob, runMatches } from "../services/match-runner.js";
import { parseQueuePayload, requireQueueUser } from "./_common.js";

/**
 * Phase 10A — matching processor. Reuses runMatches/runMatchForJob
 * (upsert persistence = business idempotency). Explicit jobIds are each
 * re-checked for ownership; foreign ids are skipped safely (never reveal).
 * Missing profile fails the whole job permanently (user action required).
 */

export interface MatchingSummary {
  matched: number;
  skipped: number;
  mode: string;
}

export async function processMatchingJob(data: unknown): Promise<MatchingSummary> {
  const payload: MatchingJobPayload = parseQueuePayload(MatchingJobPayloadSchema, data);
  await requireQueueUser(payload.userId);
  if (payload.jobIds && payload.jobIds.length > 0) {
    let matched = 0;
    let skipped = 0;
    for (const jobId of payload.jobIds) {
      try {
        await runMatchForJob(payload.userId, jobId, payload.mode ?? undefined);
        matched += 1;
      } catch (err) {
        const status = (err as { status?: unknown })?.status;
        if (status === 404) {
          skipped += 1;
          continue;
        }
        throw err;
      }
    }
    return { matched, skipped, mode: payload.mode ?? "deterministic" };
  }
  const { matched } = await runMatches(payload.userId, payload.limit, payload.mode ?? undefined);
  return { matched, skipped: 0, mode: payload.mode ?? "deterministic" };
}
