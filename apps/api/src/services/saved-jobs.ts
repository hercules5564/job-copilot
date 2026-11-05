import { prisma } from "@jobcopilot/db";
import { mapPrismaError, notFound } from "./errors.js";

/** Phase 22 — user-scoped bookmarks over genuine job rows. */

export async function saveJob(userId: string, jobId: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
  if (!job) throw notFound("Job not found");
  try {
    return await prisma.savedJob.upsert({
      where: { userId_jobId: { userId, jobId } },
      update: {},
      create: { userId, jobId },
    });
  } catch (err) {
    mapPrismaError(err, "Job not found");
  }
}

export async function unsaveJob(userId: string, jobId: string): Promise<void> {
  const result = await prisma.savedJob.deleteMany({ where: { userId, jobId } });
  if (result.count === 0) throw notFound("Saved job not found");
}

export async function listSavedJobs(userId: string) {
  return prisma.savedJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { job: true },
    take: 200,
  });
}

export async function savedJobIdSet(userId: string): Promise<Set<string>> {
  const rows = await prisma.savedJob.findMany({
    where: { userId },
    select: { jobId: true },
    take: 1000,
  });
  return new Set(rows.map((r) => r.jobId));
}
