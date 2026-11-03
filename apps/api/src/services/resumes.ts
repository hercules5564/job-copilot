import { prisma } from "@jobcopilot/db";
import type { CreateResumeInput, UpdateResumeInput } from "@jobcopilot/shared";
import { notFound, mapPrismaError } from "./errors.js";

export async function listResumes(userId: string) {
  return prisma.resume.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getResume(userId: string, id: string) {
  const resume = await prisma.resume.findFirst({ where: { id, userId } });
  if (!resume) throw notFound("Resume not found");
  return resume;
}

export async function createResume(userId: string, input: CreateResumeInput) {
  try {
    return await prisma.resume.create({
      data: {
        userId,
        name: input.name,
        targetRoles: input.targetRoles ?? [],
        isActive: input.isActive ?? true,
        fileUrl: input.fileUrl ?? null,
        parsedText: input.parsedText ?? null,
      },
    });
  } catch (err) {
    mapPrismaError(err);
  }
}

/**
 * Update a resume, snapshotting the previous content as a ResumeVersion
 * inside the same transaction so version history can never diverge.
 */
export async function updateResume(userId: string, id: string, input: UpdateResumeInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.resume.findFirst({ where: { id, userId } });
    if (!current) throw notFound("Resume not found");
    const last = await tx.resumeVersion.findFirst({
      where: { resumeId: id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    await tx.resumeVersion.create({
      data: {
        resumeId: id,
        version: (last?.version ?? 0) + 1,
        content: {
          name: current.name,
          targetRoles: current.targetRoles,
          isActive: current.isActive,
          fileUrl: current.fileUrl,
          parsedText: current.parsedText,
          parsedJson: current.parsedJson,
        },
        note: "auto-snapshot",
      },
    });
    return tx.resume.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.targetRoles !== undefined ? { targetRoles: input.targetRoles } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.fileUrl !== undefined ? { fileUrl: input.fileUrl } : {}),
        ...(input.parsedText !== undefined ? { parsedText: input.parsedText } : {}),
      },
    });
  });
}

export async function deleteResume(userId: string, id: string): Promise<void> {
  try {
    await prisma.resume.deleteMany({ where: { id, userId } }).then((r) => {
      if (r.count === 0) throw notFound("Resume not found");
    });
  } catch (err) {
    if ((err as { status?: number })?.status === 404) throw err;
    mapPrismaError(err, "Resume not found");
  }
}

export async function listResumeVersions(userId: string, id: string) {
  await getResume(userId, id); // ownership check first (404 on cross-user)
  return prisma.resumeVersion.findMany({
    where: { resumeId: id },
    orderBy: { version: "asc" },
  });
}
