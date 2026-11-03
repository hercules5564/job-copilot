import { prisma } from "@jobcopilot/db";
import { fingerprint, normalize } from "./jobs.js";
import type { NormalizedJob } from "./job-normalizer.js";

/**
 * Phase 3 — deterministic deduplicator. No LLM.
 * Reuses the existing Phase 2 fingerprint() — no second algorithm.
 *
 * Strength order per record:
 *   1. source + externalId
 *   2. canonical job URL
 *   3. deterministic fingerprint (normalizedCompany|title|location|salary)
 */

export type DedupHit =
  | { kind: "externalId"; jobId: string }
  | { kind: "url"; jobId: string }
  | { kind: "fingerprint"; jobId: string }
  | { kind: "none" };

/** Fingerprint inputs for an ingested job (same algorithm as manual jobs). */
export function fingerprintFor(job: NormalizedJob): string {
  return fingerprint({
    company: job.company,
    title: job.title,
    location: job.location,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
  });
}

export function normalizedCompanyFor(job: NormalizedJob): string {
  return normalize(job.company);
}

/**
 * Find an existing job for this user via strongest identifier first.
 * All checks are user-scoped (multi-tenancy preserved).
 */
export async function findDuplicate(
  userId: string,
  job: NormalizedJob,
  fp: string,
): Promise<DedupHit> {
  const byExternal = await prisma.job.findFirst({
    where: { userId, sourceKey: job.source, externalId: job.externalId },
    select: { id: true },
  });
  if (byExternal) return { kind: "externalId", jobId: byExternal.id };

  if (job.jobUrl) {
    const byUrl = await prisma.job.findFirst({
      where: { userId, sourceUrl: job.jobUrl },
      select: { id: true },
    });
    if (byUrl) return { kind: "url", jobId: byUrl.id };
  }

  const byFp = await prisma.job.findUnique({
    where: { userId_fingerprint: { userId, fingerprint: fp } },
    select: { id: true },
  });
  if (byFp) return { kind: "fingerprint", jobId: byFp.id };

  return { kind: "none" };
}
