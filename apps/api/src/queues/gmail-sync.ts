import { prisma } from "@jobcopilot/db";
import { GmailSyncJobPayloadSchema, type GmailSyncJobPayload } from "@jobcopilot/shared";
import { permanent } from "@jobcopilot/queues";
import { gmailProvider } from "../integrations/gmail/provider.js";
import { parseQueuePayload, requireQueueUser } from "./_common.js";

/**
 * Phase 10A — Gmail sync processor. Verifies integration ownership, then
 * reuses syncMessages (tokens stay inside the existing service; the queue
 * payload carries only ids). Disconnected integrations fail permanently.
 */

export interface GmailSyncSummary {
  synced: number;
  matched: number;
  needsReview: number;
  eventsCreated: number;
  status: string;
}

export async function processGmailSyncJob(data: unknown): Promise<GmailSyncSummary> {
  const payload: GmailSyncJobPayload = parseQueuePayload(GmailSyncJobPayloadSchema, data);
  await requireQueueUser(payload.userId);
  const row = await prisma.integration.findFirst({
    where: { id: payload.integrationId, userId: payload.userId, provider: "google-gmail" },
  });
  if (!row) throw permanent("INTEGRATION_NOT_FOUND", "Gmail integration not found");
  if (row.status !== "CONNECTED") {
    throw permanent("INTEGRATION_NOT_CONNECTED", "Gmail integration is not connected");
  }
  const result = await gmailProvider.syncMessages(payload.userId, payload.maxMessages);
  return {
    synced: result.synced,
    matched: result.matched,
    needsReview: result.needsReview,
    eventsCreated: result.eventsCreated,
    status: result.status,
  };
}
