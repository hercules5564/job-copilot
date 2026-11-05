import { prisma, type Prisma, type WorkMode } from "@jobcopilot/db";
import type { ConfirmExtractionInput, ResumeExtraction } from "@jobcopilot/shared";
import { notFound } from "./errors.js";

/**
 * Phase 22 — apply a user-reviewed extraction to the candidate profile.
 * This is the ONLY place extraction data becomes matching input; parsing
 * itself never writes preferences. Reuses the existing Profile/Project
 * models (no duplicate CandidateProfile/ExtractedSkill tables).
 */

function profileData(
  extraction: ResumeExtraction,
  input: ConfirmExtractionInput,
  rawResumeText?: string | null,
): Prisma.ProfileUncheckedUpdateInput {
  return {
    ...(extraction.summary !== null ? { summary: extraction.summary } : {}),
    ...(extraction.currentTitle !== null ? { headline: extraction.currentTitle } : {}),
    ...(extraction.yearsOfExperience !== null
      ? { yearsOfExperience: extraction.yearsOfExperience }
      : {}),
    ...(extraction.education.length > 0
      ? { education: extraction.education as Prisma.InputJsonValue }
      : {}),
    ...(rawResumeText ? { rawResumeText } : {}),
    targetRoles: extraction.targetRoles,
    skills: extraction.skills.map((s) => s.name),
    preferredLocations: extraction.preferredLocations,
    workMode: extraction.workMode as WorkMode,
    employmentTypes: extraction.employmentTypes,
    ...(extraction.minSalary !== null ? { minSalary: extraction.minSalary } : {}),
    ...(extraction.experienceLevel !== null ? { experienceLevel: extraction.experienceLevel } : {}),
    ...(input.portfolioUrl !== undefined ? { portfolioUrl: input.portfolioUrl } : {}),
    ...(input.githubUrl !== undefined ? { githubUrl: input.githubUrl } : {}),
    ...(input.linkedinUrl !== undefined ? { linkedinUrl: input.linkedinUrl } : {}),
  };
}

export async function confirmExtraction(
  userId: string,
  resumeId: string,
  input: ConfirmExtractionInput,
) {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw notFound("Resume not found");

  const data = profileData(input.extraction, input, resume.parsedText);
  const profile = await prisma.profile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data } as Prisma.ProfileUncheckedCreateInput,
  });

  // Persist extracted projects using the existing Project model. Projects
  // are matched by name per user; existing rows are updated, never deleted.
  const projects = [];
  for (const project of input.extraction.projects.slice(0, 50)) {
    const existing = await prisma.project.findFirst({
      where: { userId, name: project.name },
    });
    const payload = {
      description: (project.description || project.name).slice(0, 5000),
      technologies: project.technologies.slice(0, 30),
    };
    if (existing) {
      projects.push(await prisma.project.update({ where: { id: existing.id }, data: payload }));
    } else {
      projects.push(
        await prisma.project.create({
          data: { userId, name: project.name.slice(0, 200), ...payload },
        }),
      );
    }
  }

  if (input.setActive) {
    await prisma.$transaction([
      prisma.resume.updateMany({
        where: { userId, kind: "RESUME" },
        data: { isActive: false },
      }),
      prisma.resume.update({
        where: { id: resume.id },
        data: {
          isActive: true,
          targetRoles: input.extraction.targetRoles,
          parsedJson: input.extraction,
        },
      }),
    ]);
  } else {
    await prisma.resume.update({
      where: { id: resume.id },
      data: { targetRoles: input.extraction.targetRoles, parsedJson: input.extraction },
    });
  }

  return { profile, projects };
}
