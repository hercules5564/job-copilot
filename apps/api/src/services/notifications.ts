import { prisma } from "@jobcopilot/db";
import { notFound } from "./errors.js";

/**
 * Phase 6 — notification writer. Idempotent: an identical notification
 * (same user, type, title, and refs) is returned instead of duplicated.
 * Bodies are short human summaries — never email bodies or tokens.
 */

export interface CreateNotificationInput {
  type: string;
  title: string;
  body?: string | null;
  applicationId?: string | null;
  emailMessageId?: string | null;
}

export async function createNotification(userId: string, input: CreateNotificationInput) {
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: input.type,
      title: input.title,
      applicationId: input.applicationId ?? null,
      emailMessageId: input.emailMessageId ?? null,
    },
  });
  if (existing) return { notification: existing, created: false as const };
  const notification = await prisma.notification.create({
    data: {
      userId,
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 500) ?? null,
      applicationId: input.applicationId ?? null,
      emailMessageId: input.emailMessageId ?? null,
    },
  });
  return { notification, created: true as const };
}

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  read: true,
  applicationId: true,
  emailMessageId: true,
  createdAt: true,
} as const;

export async function listNotifications(
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {},
) {
  return prisma.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { read: false } : {}) },
    select: NOTIFICATION_SELECT,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(opts.limit ?? 20, 1), 100),
  });
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } });
}

/**
 * Mark one owned notification as read. Idempotent: already-read stays
 * read with success. Foreign/missing ids return 404 (no oracle).
 */
export async function markNotificationRead(userId: string, id: string) {
  const updated = await prisma.notification.updateMany({
    where: { id, userId },
    data: { read: true },
  });
  if (updated.count === 0) throw notFound("Notification not found");
  const row = await prisma.notification.findUnique({
    where: { id },
    select: NOTIFICATION_SELECT,
  });
  if (!row) throw notFound("Notification not found");
  return row;
}
