import { AnalyticsJobPayloadSchema, type AnalyticsJobPayload } from "@jobcopilot/shared";
import { parseQueuePayload, requireQueueUser } from "./_common.js";

/**
 * Phase 10A — analytics processor (infrastructure only).
 * Acknowledges typed events after ownership validation; the analytics
 * product itself is deferred. No persistence, no PII beyond references.
 */

export interface AnalyticsSummary {
  recorded: boolean;
  reason: string;
}

const SYSTEM_SENDER = "system";

export async function processAnalyticsJob(data: unknown): Promise<AnalyticsSummary> {
  const payload: AnalyticsJobPayload = parseQueuePayload(AnalyticsJobPayloadSchema, data);
  // Scheduler-originated heartbeats carry the system sender (no user row).
  if (payload.userId !== SYSTEM_SENDER) {
    await requireQueueUser(payload.userId);
  }
  return { recorded: false, reason: "analytics product deferred (Phase 10A infrastructure only)" };
}
