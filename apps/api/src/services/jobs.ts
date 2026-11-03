import { createHash } from "node:crypto";
import { prisma } from "@jobcopilot/db";
import type { CreateJobInput, UpdateJobInput } from "@jobcopilot/shared";
import { notFound, conflict, mapPrismaError } from "./errors.js";

/** Normalize for dedup: lowercase, trim, collapse whitespace/punctuation. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable dedup fingerprint: normalizedCompany|title|location|salary. */
export function fingerprint(input: {
  company: string;
  title: string;
  location?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
}): string {
  const parts = [
    normalize(input.company),
    normalize(input.title),
    normalize(input.location ?? ""),
    String(input.salaryMin ?? ""),
    String(input.salaryMax ?? ""),
  ].join("|");
  return createHash("sha256").update(parts).digest("hex").slice(0, 32);
}

/** Backward-compatible shape: exposes `company` alias (Phase 1 clients). */
export function serializeJob<T extends { companyName: string }>(job: T) {
  return { ...job, company: job.companyName };
}

export async function listJobs(userId: string) {
  const jobs = await prisma.job.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return jobs.map(serializeJob);
}

export async function getJob(userId: string, id: string) {
  const job = await prisma.job.findFirst({ where: { id, userId } });
  if (!job) throw notFound("Job not found");
  return serializeJob(job);
}

export async function createJob(userId: string, input: CreateJobInput) {
  const fp = fingerprint({
    company: input.company,
    title: input.title,
    location: input.location,
    salaryMin: input.salaryMin,
    salaryMax: input.salaryMax,
  });
  const data = {
    userId,
    companyName: input.company,
    normalizedCompany: normalize(input.company),
    title: input.title,
    normalizedTitle: normalize(input.title),
    location: input.location ?? null,
    remote: input.remote ?? false,
    employmentType: input.employmentType ?? null,
    salaryMin: input.salaryMin ?? null,
    salaryMax: input.salaryMax ?? null,
    salaryCurrency: input.salaryCurrency ?? "USD",
    description: input.description,
    sourceUrl: input.sourceUrl ?? null,
    sourceKey: "manual",
    fingerprint: fp,
  };
  try {
    const job = await prisma.job.create({ data });
    return { job: serializeJob(job), deduplicated: false as const };
  } catch (err) {
    if ((err as { code?: string })?.code !== "P2002") mapPrismaError(err);
    // Idempotent create: same fingerprint already stored for this user.
    const existing = await prisma.job.findUnique({
      where: { userId_fingerprint: { userId, fingerprint: fp } },
    });
    if (!existing) throw conflict("Job already exists");
    return { job: serializeJob(existing), deduplicated: true as const };
  }
}

export async function updateJob(userId: string, id: string, input: UpdateJobInput) {
  const current = await prisma.job.findFirst({ where: { id, userId } });
  if (!current) throw notFound("Job not found");
  const title = input.title ?? current.title;
  const company = input.company ?? current.companyName;
  const location = input.location !== undefined ? input.location : current.location;
  const salaryMin = input.salaryMin !== undefined ? input.salaryMin : current.salaryMin;
  const salaryMax = input.salaryMax !== undefined ? input.salaryMax : current.salaryMax;
  try {
    const job = await prisma.job.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title, normalizedTitle: normalize(title) } : {}),
        ...(input.company !== undefined
          ? { companyName: company, normalizedCompany: normalize(company) }
          : {}),
        ...(input.location !== undefined ? { location } : {}),
        ...(input.remote !== undefined ? { remote: input.remote } : {}),
        ...(input.employmentType !== undefined ? { employmentType: input.employmentType } : {}),
        ...(input.salaryMin !== undefined ? { salaryMin } : {}),
        ...(input.salaryMax !== undefined ? { salaryMax } : {}),
        ...(input.salaryCurrency !== undefined ? { salaryCurrency: input.salaryCurrency } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
        fingerprint: fingerprint({ company, title, location, salaryMin, salaryMax }),
      },
    });
    return serializeJob(job);
  } catch (err) {
    mapPrismaError(err, "Job not found");
  }
}

export async function deleteJob(userId: string, id: string): Promise<void> {
  const r = await prisma.job.deleteMany({ where: { id, userId } });
  if (r.count === 0) throw notFound("Job not found");
}
