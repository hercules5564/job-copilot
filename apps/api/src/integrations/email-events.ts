import { prisma, type ApplicationStatus as PrismaStatus } from "@jobcopilot/db";
import { canTransition, type ApplicationStatus, type EmailClassification } from "@jobcopilot/shared";
import { createNotification } from "../services/notifications.js";

/**
 * Phase 6 — Gmail evidence → ApplicationEvent (+ optional status move).
 * Rules:
 * - Only MATCHED emails with strong-evidence classifications create events.
 * - Status transitions go through the Phase 1 state machine; illegal moves
 *   become same-status evidence events (state preserved, evidence kept).
 * - Idempotent: one email creates at most one event (emailMessageId guard
 *   + emailEventCreated flag). Reprocessing never duplicates.
 */

interface DerivedEvent {
  /** Target status; null = evidence only, keep current status. */
  toStatus: ApplicationStatus | null;
  note: string;
  notifyType: string | null;
  notifyTitle: string | null;
}

/** Classification → status intent. Weak classes never move status. */
function deriveFromClassification(
  classification: EmailClassification,
  subject: string,
  fromEmail: string,
): DerivedEvent | null {
  const evidence = `Gmail: "${subject.slice(0, 120)}" from ${fromEmail}`;
  switch (classification) {
    case "APPLICATION_CONFIRMATION":
      return { toStatus: "APPLIED", note: `Application confirmed. ${evidence}`, notifyType: "APPLICATION_CONFIRMED", notifyTitle: "Application confirmed" };
    case "INTERVIEW_INVITATION":
    case "INTERVIEW_SCHEDULE":
      return { toStatus: "INTERVIEW", note: `Interview signal. ${evidence}`, notifyType: "INTERVIEW_INVITATION", notifyTitle: "Interview invitation received" };
    case "REJECTION":
      return { toStatus: "REJECTED", note: `Rejection received. ${evidence}`, notifyType: "REJECTION", notifyTitle: "Application update: rejection" };
    case "OFFER":
      return { toStatus: "OFFER", note: `Offer received. ${evidence}`, notifyType: "OFFER", notifyTitle: "Offer received" };
    case "ASSESSMENT":
      return { toStatus: "ASSESSMENT", note: `Assessment received. ${evidence}`, notifyType: "ASSESSMENT", notifyTitle: "Assessment received" };
    case "RECRUITER_OUTREACH":
    case "FOLLOW_UP":
      return { toStatus: "RECRUITER_RESPONSE", note: `Recruiter contact. ${evidence}`, notifyType: "RECRUITER_RESPONSE", notifyTitle: "Recruiter responded" };
    case "APPLICATION_UPDATE":
      return { toStatus: null, note: `Application update noted. ${evidence}`, notifyType: null, notifyTitle: null };
    default:
      return null; // NEWSLETTER / IRRELEVANT / UNKNOWN: no event.
  }
}

export interface EmailEventOutcome {
  eventCreated: boolean;
  statusChanged: boolean;
  notificationCreated: boolean;
}

/**
 * Process one MATCHED email row. Safe to call repeatedly for the same row.
 */
export async function processEmailForApplication(
  userId: string,
  emailId: string,
): Promise<EmailEventOutcome> {
  const idle: EmailEventOutcome = { eventCreated: false, statusChanged: false, notificationCreated: false };
  const email = await prisma.emailMessage.findFirst({ where: { id: emailId, userId } });
  if (!email || !email.applicationId || email.emailEventCreated) return idle;
  const derived = deriveFromClassification(
    email.classification as EmailClassification,
    email.subject,
    email.fromEmail,
  );
  if (!derived) return idle;

  // Idempotency: an event already referencing this email wins.
  const prior = await prisma.applicationEvent.findFirst({
    where: { applicationId: email.applicationId, emailMessageId: email.id },
  });
  if (prior) {
    await prisma.emailMessage.update({ where: { id: email.id }, data: { emailEventCreated: true } });
    return idle;
  }

  const application = await prisma.application.findFirst({
    where: { id: email.applicationId, userId },
  });
  if (!application) return idle;
  const from = application.status as ApplicationStatus;

  let newStatus: ApplicationStatus = from;
  let statusChanged = false;
  if (derived.toStatus && derived.toStatus !== from && canTransition(from, derived.toStatus)) {
    newStatus = derived.toStatus;
    statusChanged = true;
  }

  await prisma.$transaction(async (tx) => {
    if (statusChanged) {
      await tx.application.update({
        where: { id: application.id },
        data: { status: newStatus as PrismaStatus },
      });
    }
    await tx.applicationEvent.create({
      data: {
        applicationId: application.id,
        oldStatus: from as PrismaStatus,
        newStatus: newStatus as PrismaStatus,
        source: "GMAIL",
        note: derived.note + (statusChanged ? "" : " (status unchanged: transition not permitted from current state)"),
        emailMessageId: email.id,
      },
    });
    await tx.emailMessage.update({
      where: { id: email.id },
      data: { emailEventCreated: true },
    });
  });

  let notificationCreated = false;
  if (derived.notifyType && derived.notifyTitle) {
    const { created } = await createNotification(userId, {
      type: derived.notifyType,
      title: `${derived.notifyTitle} — ${application.id.slice(0, 8)}`,
      body: email.subject.slice(0, 200),
      applicationId: application.id,
      emailMessageId: email.id,
    });
    notificationCreated = created;
  }
  return { eventCreated: true, statusChanged, notificationCreated };
}
