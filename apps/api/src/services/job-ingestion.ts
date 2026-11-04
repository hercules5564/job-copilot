import { prisma } from "@jobcopilot/db";
import {
  RawJobSchema,
  type IngestJobsRequest,
  type IngestionResult,
  type JobSearchParams,
} from "@jobcopilot/shared";
import { getSource } from "../sources/registry.js";
import { normalizeRawJob, type NormalizedJob } from "./job-normalizer.js";
import {
  findDuplicate,
  fingerprintFor,
  normalizedCompanyFor,
} from "./job-deduplicator.js";
import { ensureUser } from "./users.js";
import { normalize, serializeJob } from "./jobs.js";
import { isLikelyEnglish } from "./language.js";

const MAX_ERROR_ENTRIES = 20;

function logEvent(event: Record<string, unknown>): void {
  // Structured log. Never includes API keys, tokens, DATABASE_URL,
  // auth headers, or job descriptions.
  console.log(JSON.stringify({ level: "info", component: "job-ingestion", ...event }));
}

function parsePostedAt(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Central job ingestion pipeline:
 * fetch → normalize → validate → deduplicate → persist.
 * One bad job never stops the run; statistics are always returned.
 * With opts.includeJobIds, created/refreshed row ids are collected
 * (bounded summaries travel in Redis, never full records).
 */
export async function ingestJobs(
  userId: string,
  input: IngestJobsRequest,
  opts: { includeJobIds?: boolean } = {},
): Promise<IngestionResult> {
  const startedAt = Date.now();
  const adapter = getSource(input.source); // throws 404 HttpError for unknown sources
  const params: JobSearchParams = {
    query: input.query,
    location: input.location,
    remote: input.remote,
    employmentType: input.employmentType,
    page: 1,
    limit: input.limit ?? 20,
    // Phase 10B: board token for board-based sources (service/discovery
    // only — never part of the public ingest body).
    board: input.board ?? null,
  };

  logEvent({ msg: "ingestion start", source: adapter.id, userId });

  let rawJobs: unknown[];
  try {
    rawJobs = await adapter.search(params);
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const reason = err instanceof Error ? err.message : "Source request failed";
    logEvent({
      msg: "ingestion failed",
      source: adapter.id,
      userId,
      reason,
      durationMs,
    });
    return {
      source: adapter.id,
      fetched: 0,
      normalized: 0,
      inserted: 0,
      updated: 0,
      duplicates: 0,
      rejected: 0,
      errors: [{ reason }],
      durationMs,
      jobIds: [],
    };
  }

  await ensureUser(userId);
  // Preserve provenance: every ingested job links to its JobSource row.
  const dbSource = await prisma.jobSource.upsert({
    where: { key: adapter.id },
    update: { name: adapter.name, enabled: true },
    create: { key: adapter.id, name: adapter.name, enabled: true },
  });

  const result: IngestionResult = {
    source: adapter.id,
    fetched: rawJobs.length,
    normalized: 0,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    rejected: 0,
    errors: [],
    durationMs: 0,
    jobIds: [],
  };

  // In-batch dedup: identical records inside one fetch count as duplicates.
  const seenExternalIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const seenUrls = new Set<string>();

  const pushError = (externalId: string | undefined, reason: string) => {
    if (result.errors.length < MAX_ERROR_ENTRIES) {
      result.errors.push(externalId ? { externalId, reason } : { reason });
    }
  };

  for (const raw of rawJobs) {
    const parsed = RawJobSchema.safeParse(raw);
    if (!parsed.success) {
      result.rejected += 1;
      const ext =
        typeof (raw as { externalId?: unknown })?.externalId === "string"
          ? ((raw as { externalId: string }).externalId.slice(0, 120))
          : undefined;
      pushError(ext, "Malformed job rejected: schema validation failed");
      continue;
    }

    const job = normalizeRawJob(parsed.data);
    const problem = validateNormalized(job);
    if (problem) {
      result.rejected += 1;
      pushError(job.externalId, problem);
      continue;
    }
    // Product rule: JobPilot is English-only. Reject non-English postings at
    // ingestion so they never enter the user's queue, matches, or autopilot.
    if (!isLikelyEnglish(job.title, job.description)) {
      result.rejected += 1;
      pushError(job.externalId, "Non-English job rejected");
      continue;
    }
    result.normalized += 1;

    const fp = fingerprintFor(job);
    const batchKey = `${job.source}|${job.externalId}`;
    if (seenExternalIds.has(batchKey) || seenFingerprints.has(fp) || (job.jobUrl && seenUrls.has(job.jobUrl))) {
      result.duplicates += 1;
      continue;
    }
    seenExternalIds.add(batchKey);
    seenFingerprints.add(fp);
    if (job.jobUrl) seenUrls.add(job.jobUrl);

    try {
      const hit = await findDuplicate(userId, job, fp);
      if (hit.kind === "none") {
        const created = await prisma.job.create({
          data: toJobCreate(userId, dbSource.id, job, fp),
        });
        result.inserted += 1;
        if (opts.includeJobIds && result.jobIds.length < 200) {
          result.jobIds.push(created.id);
        }
      } else {
        // Only same-source/same-externalId records are refreshed: a
        // URL/fingerprint match from another source proves the job is
        // known, but that source must not overwrite the original's content.
        const didUpdate =
          hit.kind === "externalId" && (await maybeUpdateExisting(hit.jobId, job));
        if (didUpdate) {
          result.updated += 1;
          if (opts.includeJobIds && result.jobIds.length < 200) {
            result.jobIds.push(hit.jobId);
          }
        } else result.duplicates += 1;
      }
    } catch (err) {
      // Race on the DB unique constraint → treat as duplicate, stay idempotent.
      if ((err as { code?: string })?.code === "P2002") {
        result.duplicates += 1;
        continue;
      }
      result.rejected += 1;
      pushError(job.externalId, "Database persist failed");
    }
  }

  result.durationMs = Date.now() - startedAt;
  logEvent({
    msg: "ingestion complete",
    source: adapter.id,
    userId,
    fetched: result.fetched,
    normalized: result.normalized,
    inserted: result.inserted,
    updated: result.updated,
    duplicates: result.duplicates,
    rejected: result.rejected,
    durationMs: result.durationMs,
  });
  return result;
}

/** Post-normalization required-field check against the Job model. */
function validateNormalized(job: NormalizedJob): string | null {
  if (!job.title) return "Malformed job rejected: missing title";
  if (!job.company) return "Malformed job rejected: missing company";
  if (!job.description) return "Malformed job rejected: missing description";
  if (
    job.salaryMin != null &&
    job.salaryMax != null &&
    job.salaryMin > job.salaryMax
  ) {
    return "Malformed job rejected: salaryMin exceeds salaryMax";
  }
  return null;
}

function toJobCreate(
  userId: string,
  sourceId: string,
  job: NormalizedJob,
  fp: string,
) {
  return {
    userId,
    companyName: job.company,
    normalizedCompany: normalizedCompanyFor(job),
    sourceId,
    sourceKey: job.source,
    sourceUrl: job.jobUrl,
    externalId: job.externalId,
    title: job.title,
    normalizedTitle: normalize(job.title),
    location: job.location,
    remote: job.remote,
    employmentType: job.employmentType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    description: job.description,
    postedAt: parsePostedAt(job.postedAt),
    fingerprint: fp,
  };
}

/**
 * Update an existing duplicate when the incoming record carries fresher
 * provenance (newer postedAt, changed description/URL). Returns true when
 * a write happened.
 */
async function maybeUpdateExisting(
  jobId: string,
  job: NormalizedJob,
): Promise<boolean> {
  const current = await prisma.job.findUnique({ where: { id: jobId } });
  if (!current) return false;
  const incomingPostedAt = parsePostedAt(job.postedAt);
  const data: Record<string, unknown> = {};
  if (
    job.description &&
    job.description !== current.description
  ) {
    data.description = job.description;
  }
  if (job.jobUrl && job.jobUrl !== current.sourceUrl) {
    data.sourceUrl = job.jobUrl;
  }
  if (
    incomingPostedAt &&
    (!current.postedAt || incomingPostedAt > current.postedAt)
  ) {
    data.postedAt = incomingPostedAt;
  }
  if (Object.keys(data).length === 0) return false;
  await prisma.job.update({ where: { id: jobId }, data });
  return true;
}

export { serializeJob };
