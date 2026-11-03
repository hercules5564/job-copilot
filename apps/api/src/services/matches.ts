import { prisma } from "@jobcopilot/db";
import type { JobMatchUpsertInput, UpdateJobMatchInput } from "@jobcopilot/shared";
import { notFound, mapPrismaError } from "./errors.js";

/**
 * Persist explicitly supplied match data. No scoring happens here —
 * the matching engine (Phase 4) computes scores; this layer only stores them.
 */
export async function upsertMatch(userId: string, input: JobMatchUpsertInput) {
  const job = await prisma.job.findFirst({ where: { id: input.jobId, userId } });
  if (!job) throw notFound("Job not found");
  const { jobId: _jobId, ...scores } = input;
  void _jobId;
  try {
    return await prisma.jobMatch.upsert({
      where: { jobId_userId: { jobId: input.jobId, userId } },
      update: { ...scores },
      create: { userId, jobId: input.jobId, ...scores },
    });
  } catch (err) {
    mapPrismaError(err, "Job not found");
  }
}

export async function listMatches(
  userId: string,
  filters: { minScore?: number; decision?: string } = {},
) {
  return prisma.jobMatch.findMany({
    where: {
      userId,
      ...(filters.minScore !== undefined ? { overallScore: { gte: filters.minScore } } : {}),
      ...(filters.decision ? { decision: filters.decision } : {}),
    },
    orderBy: { overallScore: "desc" },
    include: {
      job: { select: { id: true, title: true, companyName: true, location: true } },
    },
    take: 200,
  });
}

export async function getMatchForJob(userId: string, jobId: string) {
  const match = await prisma.jobMatch.findFirst({
    where: { jobId, userId },
    include: {
      job: { select: { id: true, title: true, companyName: true, location: true } },
    },
  });
  if (!match) throw notFound("Match not found");
  return match;
}

export async function updateMatch(userId: string, id: string, input: UpdateJobMatchInput) {
  const current = await prisma.jobMatch.findFirst({ where: { id, userId } });
  if (!current) throw notFound("Match not found");
  try {
    return await prisma.jobMatch.update({ where: { id }, data: { ...input } });
  } catch (err) {
    mapPrismaError(err, "Match not found");
  }
}
