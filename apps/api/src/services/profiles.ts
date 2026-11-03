import { prisma, type Prisma, type WorkMode } from "@jobcopilot/db";
import type { UpdateProfileInput } from "@jobcopilot/shared";
import { notFound, mapPrismaError } from "./errors.js";

export async function getProfile(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) throw notFound("Profile not found");
  return profile;
}

function toPrismaData(userId: string, input: UpdateProfileInput): Prisma.ProfileUpdateInput {
  const data: Prisma.ProfileUpdateInput = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.headline !== undefined) data.headline = input.headline;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.yearsOfExperience !== undefined) data.yearsOfExperience = input.yearsOfExperience;
  if (input.education !== undefined) data.education = (input.education ?? {}) as Prisma.InputJsonValue;
  const p = input.preferences;
  if (p) {
    if (p.targetRoles !== undefined) data.targetRoles = p.targetRoles;
    if (p.skills !== undefined) data.skills = p.skills;
    if (p.minSalary !== undefined) data.minSalary = p.minSalary;
    if (p.preferredSalary !== undefined) data.preferredSalary = p.preferredSalary;
    if (p.salaryCurrency !== undefined) data.salaryCurrency = p.salaryCurrency;
    if (p.preferredLocations !== undefined) data.preferredLocations = p.preferredLocations;
    if (p.workMode !== undefined) data.workMode = p.workMode as WorkMode;
    if (p.employmentTypes !== undefined) data.employmentTypes = p.employmentTypes;
    if (p.noticePeriodDays !== undefined) data.noticePeriodDays = p.noticePeriodDays;
    if (p.workAuthorization !== undefined) data.workAuthorization = p.workAuthorization;
    if (p.preferredIndustries !== undefined) data.preferredIndustries = p.preferredIndustries;
    if (p.preferredCompanies !== undefined) data.preferredCompanies = p.preferredCompanies;
    if (p.excludedCompanies !== undefined) data.excludedCompanies = p.excludedCompanies;
  }
  void userId;
  return data;
}

/** PUT semantics: create the profile if missing, otherwise patch it. */
export async function upsertProfile(userId: string, input: UpdateProfileInput) {
  const data = toPrismaData(userId, input);
  return prisma.profile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data } as Prisma.ProfileCreateInput,
  });
}

export async function deleteProfile(userId: string): Promise<void> {
  try {
    await prisma.profile.delete({ where: { userId } });
  } catch (err) {
    mapPrismaError(err, "Profile not found");
  }
}
