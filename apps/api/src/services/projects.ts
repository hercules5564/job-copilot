import { prisma } from "@jobcopilot/db";
import type { CreateProjectInput, UpdateProjectInput } from "@jobcopilot/shared";
import { notFound, badRequest, mapPrismaError } from "./errors.js";

function toDate(value: string | null | undefined, field: string): Date | null | undefined {
  if (value === undefined || value === null) return value ?? null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest(`Invalid date for ${field}`);
  return d;
}

export async function listProjects(userId: string) {
  return prisma.project.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
}

export async function getProject(userId: string, id: string) {
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) throw notFound("Project not found");
  return project;
}

export async function createProject(userId: string, input: CreateProjectInput) {
  try {
    return await prisma.project.create({
      data: {
        userId,
        name: input.name,
        description: input.description,
        technologies: input.technologies ?? [],
        role: input.role ?? null,
        contributions: input.contributions ?? null,
        achievements: input.achievements ?? null,
        githubUrl: input.githubUrl ?? null,
        liveUrl: input.liveUrl ?? null,
        startDate: toDate(input.startDate, "startDate") ?? null,
        endDate: toDate(input.endDate, "endDate") ?? null,
      },
    });
  } catch (err) {
    if ((err as { status?: number })?.status === 400) throw err;
    mapPrismaError(err);
  }
}

export async function updateProject(userId: string, id: string, input: UpdateProjectInput) {
  await getProject(userId, id); // ownership check (404 on cross-user)
  try {
    return await prisma.project.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.technologies !== undefined ? { technologies: input.technologies } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.contributions !== undefined ? { contributions: input.contributions } : {}),
        ...(input.achievements !== undefined ? { achievements: input.achievements } : {}),
        ...(input.githubUrl !== undefined ? { githubUrl: input.githubUrl } : {}),
        ...(input.liveUrl !== undefined ? { liveUrl: input.liveUrl } : {}),
        ...(input.startDate !== undefined ? { startDate: toDate(input.startDate, "startDate") } : {}),
        ...(input.endDate !== undefined ? { endDate: toDate(input.endDate, "endDate") } : {}),
      },
    });
  } catch (err) {
    if ((err as { status?: number })?.status === 400) throw err;
    mapPrismaError(err, "Project not found");
  }
}

export async function deleteProject(userId: string, id: string): Promise<void> {
  const r = await prisma.project.deleteMany({ where: { id, userId } });
  if (r.count === 0) throw notFound("Project not found");
}
