import { Router } from "express";
import { NotificationsQuerySchema } from "@jobcopilot/shared";
import { ah, requireDb } from "../middleware/db.js";
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationRead,
} from "../services/notifications.js";

/**
 * Phase 11 — Track & Monitor reads. Owner-scoped, side-effect-free except
 * idempotent mark-read. No creation endpoint (server-side only).
 */
export const notificationsRouter = Router();

notificationsRouter.use(requireDb);

notificationsRouter.get(
  "/",
  ah(async (req, res) => {
    const parsed = NotificationsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    res.json({
      notifications: await listNotifications(req.userId!, {
        unreadOnly: parsed.data.unreadOnly === "true",
        limit: parsed.data.limit,
      }),
    });
  }),
);

notificationsRouter.get(
  "/unread-count",
  ah(async (req, res) => {
    res.json({ unread: await countUnreadNotifications(req.userId!) });
  }),
);

notificationsRouter.patch(
  "/:id",
  ah(async (req, res) => {
    res.json({ notification: await markNotificationRead(req.userId!, req.params.id) });
  }),
);
