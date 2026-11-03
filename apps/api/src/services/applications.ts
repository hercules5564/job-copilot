import { prisma, type ApplicationStatus as PrismaStatus } from "@jobcopilot/db";
import {
  canTransition,
  type ApplicationStatus,
  type UpdateApplicationInput,
} from "@jobcopilot/shared";
import { notFound, conflict, unprocessable, mapPrismaError } from "./errors.js";

const JOB_SUMMARY = {
  select: { id: true, title: true, companyName: true, location: true, remote: true },
} as const;

export async function listApplications(userId: string) {
  return prisma.application.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { job: JOB_SUMMARY },
    take: 200,
  });
}

export async function getApplication(userId: string, id: string) {
  const app = await prisma.application.findFirst({
    where: { id, userId },
    include: {
      job: JOB_SUMMARY,
      events: { orderBy: { createdAt: "asc" } },
      // Phase 6: Gmail messages matched to this application (timeline).
      emails: {
        select: {
          id: true,
          fromEmail: true,
          fromName: true,
          subject: true,
          receivedAt: true,
          classification: true,
          matchStatus: true,
        },
        orderBy: { receivedAt: "asc" },
      },
    },
  });
  if (!app) throw notFound("Application not found");
  // Phase 18: expose the associated resume summary for the application
  // workspace. No schema change (Application has resumeId but no relation):
  // resolved ownership-scoped here; association rules in create/update stay
  // the single writers.
  const resume = app.resumeId
    ? await prisma.resume.findFirst({
        where: { id: app.resumeId, userId },
        select: { id: true, name: true, isActive: true },
      })
    : null;
  return { ...app, resume };
}

export async function listApplicationEvents(userId: string, id: string) {
  const app = await prisma.application.findFirst({ where: { id, userId } });
  if (!app) throw notFound("Application not found");
  return prisma.applicationEvent.findMany({
    where: { applicationId: id },
    orderBy: { createdAt: "asc" },
  });
}

/** Create an application plus its initial DISCOVERED event, atomically. */
export async function createApplication(
  userId: string,
  input: { jobId: string; resumeId?: string | null; mode?: string },
) {
  const job = await prisma.job.findFirst({ where: { id: input.jobId, userId } });
  if (!job) throw notFound("Job not found");
  if (input.resumeId) {
    const resume = await prisma.resume.findFirst({
      where: { id: input.resumeId, userId },
    });
    if (!resume) throw notFound("Resume not found");
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const app = await tx.application.create({
        data: {
          userId,
          jobId: input.jobId,
          resumeId: input.resumeId ?? null,
          mode: input.mode ?? "MANUAL",
          status: "DISCOVERED",
        },
        include: { job: JOB_SUMMARY },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId: app.id,
          oldStatus: null,
          newStatus: "DISCOVERED",
          source: "USER",
          note: "Application created",
        },
      });
      return app;
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") {
      throw conflict("Application already exists for this job");
    }
    if ((err as { status?: number })?.status === 404) throw err;
    mapPrismaError(err);
  }
}

/**
 * Status transition with the shared state machine as source of truth.
 * BEGIN: load → validate → update + event. COMMIT or ROLLBACK atomically.
 */
export async function transitionApplication(
  userId: string,
  id: string,
  toStatus: ApplicationStatus,
  note?: string | null,
  source = "USER",
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.application.findFirst({ where: { id, userId } });
    if (!current) throw notFound("Application not found");
    const from = current.status as ApplicationStatus;
    if (!canTransition(from, toStatus)) {
      throw unprocessable(`Transition ${from} -> ${toStatus} is not allowed`);
    }
    const updated = await tx.application.update({
      where: { id },
      data: { status: toStatus as PrismaStatus },
      include: { job: JOB_SUMMARY },
    });
    await tx.applicationEvent.create({
      data: {
        applicationId: id,
        oldStatus: from as PrismaStatus,
        newStatus: toStatus as PrismaStatus,
        source,
        note: note ?? null,
      },
    });
    return updated;
  });
}

export async function updateApplication(
  userId: string,
  id: string,
  input: UpdateApplicationInput,
) {
  const current = await prisma.application.findFirst({ where: { id, userId } });
  if (!current) throw notFound("Application not found");
  if (input.resumeId) {
    const resume = await prisma.resume.findFirst({
      where: { id: input.resumeId, userId },
    });
    if (!resume) throw notFound("Resume not found");
  }
  try {
    return await prisma.application.update({
      where: { id },
      data: {
        ...(input.resumeId !== undefined ? { resumeId: input.resumeId } : {}),
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
      },
      include: { job: JOB_SUMMARY },
    });
  } catch (err) {
    mapPrismaError(err, "Application not found");
  }
}

export async function deleteApplication(userId: string, id: string): Promise<void> {
  const r = await prisma.application.deleteMany({ where: { id, userId } });
  if (r.count === 0) throw notFound("Application not found");
}
