import { prisma } from "@jobcopilot/db";
import { NotificationJobPayloadSchema, type NotificationJobPayload } from "@jobcopilot/shared";
import { permanent } from "@jobcopilot/queues";
import { createNotification } from "../services/notifications.js";
import { parseQueuePayload, requireQueueUser } from "./_common.js";

/**
 * Phase 10A — notification processor. Reuses createNotification (already
 * idempotent: identical user/type/title/refs return the existing row).
 * Linked applications/emails are ownership-checked first. No email
 * sending exists in this phase — internal notifications only.
 */

export interface NotificationSummary {
  created: boolean;
  notificationId: string;
}

export async function processNotificationJob(data: unknown): Promise<NotificationSummary> {
  const payload: NotificationJobPayload = parseQueuePayload(NotificationJobPayloadSchema, data);
  await requireQueueUser(payload.userId);
  if (payload.applicationId) {
    const app = await prisma.application.findFirst({
      where: { id: payload.applicationId, userId: payload.userId },
    });
    if (!app) throw permanent("NOT_FOUND", "Linked application not found");
  }
  if (payload.emailMessageId) {
    const email = await prisma.emailMessage.findFirst({
      where: { id: payload.emailMessageId, userId: payload.userId },
    });
    if (!email) throw permanent("NOT_FOUND", "Linked email not found");
  }
  const { notification, created } = await createNotification(payload.userId, {
    type: payload.type,
    title: payload.title,
    body: payload.body ?? null,
    applicationId: payload.applicationId ?? null,
    emailMessageId: payload.emailMessageId ?? null,
  });
  return { created, notificationId: notification.id };
}
