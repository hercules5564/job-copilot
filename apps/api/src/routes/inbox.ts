import { Router } from "express";
import { prisma } from "@jobcopilot/db";
import { InboxQuerySchema } from "@jobcopilot/shared";
import { ah, requireDb } from "../middleware/db.js";
import { notFound } from "../services/errors.js";

export const inboxRouter = Router();

inboxRouter.use(requireDb);

const EMAIL_SELECT = {
  id: true,
  providerMessageId: true,
  threadId: true,
  fromEmail: true,
  fromName: true,
  subject: true,
  snippet: true,
  receivedAt: true,
  classification: true,
  classificationScore: true,
  classificationReasons: true,
  applicationId: true,
  matchStatus: true,
  matchReason: true,
  emailEventCreated: true,
  processedAt: true,
  createdAt: true,
} as const;

inboxRouter.get(
  "/",
  ah(async (req, res) => {
    const parsed = InboxQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }
    const { classification, matchStatus, take } = parsed.data;
    const emails = await prisma.emailMessage.findMany({
      where: {
        userId: req.userId!,
        ...(classification ? { classification } : {}),
        ...(matchStatus ? { matchStatus } : {}),
      },
      select: EMAIL_SELECT,
      orderBy: { receivedAt: "desc" },
      take,
    });
    res.json({ emails });
  }),
);

inboxRouter.get(
  "/:id",
  ah(async (req, res) => {
    const email = await prisma.emailMessage.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      include: {
        application: {
          select: {
            id: true,
            status: true,
            job: { select: { id: true, title: true, companyName: true } },
          },
        },
      },
    });
    if (!email) throw notFound("Email not found");
    const events = email.applicationId
      ? await prisma.applicationEvent.findMany({
          where: { applicationId: email.applicationId, emailMessageId: email.id },
          orderBy: { createdAt: "asc" },
        })
      : [];
    // Body text is the user's own synced data, capped at ingestion time.
    res.json({ email, events });
  }),
);
