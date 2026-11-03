import { createHash } from "node:crypto";
import { prisma } from "@jobcopilot/db";
import {
  DiscoveryConfigSchema,
  DiscoveryJobPayloadSchema,
  type DiscoveryConfigInput,
  type DiscoveryConfigRequest,
  type DiscoveryJobPayload,
  type DiscoverySummary,
  type HiringSignalType,
  type JobSearchParams,
} from "@jobcopilot/shared";
import { enqueueMatching, permanent } from "@jobcopilot/queues";
import { getSource } from "../sources/registry.js";
import { ingestJobs } from "./job-ingestion.js";
import { canonicalizeUrl } from "./job-normalizer.js";
import { fingerprint, normalize } from "./jobs.js";

/**
 * Phase 10B — automated job discovery.
 * Explicit DiscoveryConfig wins; Profile preferences fill blanks.
 * Every source fetch is bounded (≤3 sources/run, ≤8 searches/run,
 * per-search limits); politeness delays between searches; 429/5xx are
 * transient, 4xx permanent. New/changed jobs enqueue matching (existing
 * system) and mint JOB_POSTING signals (deduped, evidence-only).
 */

const MAX_SOURCES_PER_RUN = 3;
const MAX_SEARCHES_PER_RUN = 8;
const MAX_BOARDS_PER_RUN = 5;
const MAX_CHANGED_IDS = 50;
const POLITENESS_DELAY_MS = 250;
const EVIDENCE_MAX = 500;

export interface PlannedSearch {
  source: string;
  board: string | null;
  params: JobSearchParams;
}

function logDiscovery(event: string, fields: Record<string, unknown>): void {
  // Safe counters/ids only — never descriptions, tokens, or payloads.
  console.log(JSON.stringify({ level: "info", component: "job-discovery", event, ...fields }));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type DiscoveryConfigRow = {
  id: string;
  userId: string;
  enabled: boolean;
  targetRoles: string[];
  targetLocations: string[];
  remoteOnly: boolean;
  minimumSalary: number | null;
  employmentTypes: string[];
  experienceLevels: string[];
  preferredSkills: string[];
  excludedKeywords: string[];
  sourceKeys: string[];
  boards: string[];
  maxJobsPerRun: number;
  scheduleEnabled: boolean;
  scheduleIntervalHours: number;
  autopilotEnabled: boolean;
  autopilotMinScore: number;
  autopilotMaxPerRun: number;
  autopilotResumeId: string | null;
  lastRunAt: Date | null;
  lastStatus: string | null;
  lastSummary: unknown;
  autopilotLastRunAt: Date | null;
  autopilotLastSummary: unknown;
};

export async function getDiscoveryConfig(userId: string): Promise<DiscoveryConfigRow | null> {
  return prisma.discoveryConfig.findUnique({ where: { userId } });
}

export async function upsertDiscoveryConfig(userId: string, input: DiscoveryConfigRequest) {
  const parsed: DiscoveryConfigInput = DiscoveryConfigSchema.parse(input);
  const data = {
    enabled: parsed.enabled,
    targetRoles: parsed.targetRoles,
    targetLocations: parsed.targetLocations,
    remoteOnly: parsed.remoteOnly,
    minimumSalary: parsed.minimumSalary ?? null,
    employmentTypes: parsed.employmentTypes,
    experienceLevels: parsed.experienceLevels,
    preferredSkills: parsed.preferredSkills,
    excludedKeywords: parsed.excludedKeywords,
    sourceKeys: parsed.sourceKeys,
    boards: parsed.boards,
    maxJobsPerRun: parsed.maxJobsPerRun,
    scheduleEnabled: parsed.scheduleEnabled,
    scheduleIntervalHours: parsed.scheduleIntervalHours,
    autopilotEnabled: parsed.autopilotEnabled,
    autopilotMinScore: parsed.autopilotMinScore,
    autopilotMaxPerRun: parsed.autopilotMaxPerRun,
    autopilotResumeId: parsed.autopilotResumeId ?? null,
  };
  return prisma.discoveryConfig.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

/**
 * Board-based public sources: searches fan out over the user's configured
 * board tokens (never enumerated or guessed). All other sources run once
 * per query/location without a board.
 */
export const BOARD_SOURCES: ReadonlySet<string> = new Set(["greenhouse", "lever", "ashby"]);

/** Pure search planner (unit-tested): roles × locations, capped, budgeted. */
export function planDiscoverySearches(
  config: Pick<
    DiscoveryConfigRow,
    "targetRoles" | "targetLocations" | "remoteOnly" | "employmentTypes" | "maxJobsPerRun" | "boards"
  > & { preferredSkills?: string[] },
  profile: {
    targetRoles: string[];
    preferredLocations: string[];
    workMode: string;
    employmentTypes: string[];
    skills?: string[];
  } | null,
  sourceKeys: string[],
): PlannedSearch[] {
  const roles = (config.targetRoles.length > 0 ? config.targetRoles : (profile?.targetRoles ?? [])).slice(0, 2);
  const skills = (
    (config.preferredSkills && config.preferredSkills.length > 0
      ? config.preferredSkills
      : (profile?.skills ?? []))
  ).slice(0, 2);
  // Search by role and by skill (deduped, max 2 queries) so fetching follows
  // both the target role and the user's preferred skills.
  const queries = [...new Set([...roles, ...skills].map((s) => s.trim()).filter(Boolean))].slice(0, 2);
  if (queries.length === 0) queries.push("");
  const locations = (
    config.targetLocations.length > 0 ? config.targetLocations : (profile?.preferredLocations ?? [])
  ).slice(0, 2);
  const locs: (string | null)[] = locations.length > 0 ? locations : [null];
  const remoteOnly = config.remoteOnly || profile?.workMode === "REMOTE";
  const employmentType =
    config.employmentTypes[0] ?? profile?.employmentTypes[0] ?? null;
  const boards = config.boards.slice(0, MAX_BOARDS_PER_RUN);

  const searches: PlannedSearch[] = [];
  for (const source of sourceKeys.slice(0, MAX_SOURCES_PER_RUN)) {
    // Phase 14: board-based public sources share the configured boards
    // (each adapter validates its own token; unconfigured → skipped).
    const sourceBoards = BOARD_SOURCES.has(source) ? boards : [null];
    if (BOARD_SOURCES.has(source) && sourceBoards.length === 0) continue;
    for (const board of sourceBoards) {
      for (const query of queries) {
        for (const location of locs) {
          if (searches.length >= MAX_SEARCHES_PER_RUN) break;
          searches.push({
            source,
            board,
            params: {
              query: query || null,
              location,
              remote: remoteOnly ? true : null,
              employmentType,
              page: 1,
              limit: 20,
              board,
            },
          });
        }
        if (searches.length >= MAX_SEARCHES_PER_RUN) break;
      }
      if (searches.length >= MAX_SEARCHES_PER_RUN) break;
    }
    if (searches.length >= MAX_SEARCHES_PER_RUN) break;
  }
  // Budget the run's job cap across planned searches.
  const perSearch = Math.min(20, Math.max(1, Math.ceil(config.maxJobsPerRun / Math.max(searches.length, 1))));
  for (const search of searches) search.params.limit = perSearch;
  return searches;
}

/** Salary/excluded-keyword eligibility for matching + signals (stored rows unaffected). */
export function isEligibleForFollowUp(
  job: { salaryMax: number | null; title: string; description: string },
  config: Pick<DiscoveryConfigRow, "minimumSalary" | "excludedKeywords">,
): boolean {
  if (config.minimumSalary != null && job.salaryMax != null && job.salaryMax < config.minimumSalary) {
    return false;
  }
  if (config.excludedKeywords.length > 0) {
    const hay = `${job.title} ${job.description}`.toLowerCase();
    if (config.excludedKeywords.some((k) => k && hay.includes(k.toLowerCase()))) return false;
  }
  return true;
}

export function signalDedupKey(job: {
  sourceKey: string;
  externalId: string | null;
  sourceUrl: string | null;
  companyName: string;
  title: string;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
}): string {
  if (job.externalId) return `ext:${job.sourceKey}:${job.externalId}`.slice(0, 300);
  const canonical = canonicalizeUrl(job.sourceUrl);
  if (canonical) {
    return `url:${createHash("sha256").update(canonical).digest("hex").slice(0, 32)}`;
  }
  return `fp:${fingerprint({ company: job.companyName, title: job.title, location: job.location, salaryMin: job.salaryMin, salaryMax: job.salaryMax })}`;
}

function evidenceFor(job: { title: string; companyName: string; sourceKey: string }): string {
  return `New posting: "${job.title.slice(0, 120)}" at ${job.companyName.slice(0, 120)} via ${job.sourceKey}`.slice(0, EVIDENCE_MAX);
}

/** Link the shared canonical Company via exact normalized-name match only. */
async function linkCompany(job: {
  companyName: string;
  sourceUrl: string | null;
}): Promise<string | null> {
  try {
    const normalized = normalize(job.companyName);
    if (!normalized) return null;
    const existing = await prisma.company.findUnique({ where: { normalizedName: normalized } });
    if (existing) return existing.id;
    let domain: string | null = null;
    try {
      domain = job.sourceUrl ? new URL(job.sourceUrl).hostname.toLowerCase().slice(0, 200) : null;
    } catch {
      domain = null;
    }
    const created = await prisma.company.create({
      data: { name: job.companyName.slice(0, 200), normalizedName: normalized, domain },
    });
    return created.id;
  } catch {
    return null; // company linking never fails a discovery run
  }
}

/** Mint a JOB_POSTING signal for a new/changed job (deduped, evidence-only). */
export async function recordJobPostingSignal(
  userId: string,
  job: {
    id: string;
    sourceKey: string;
    externalId: string | null;
    sourceUrl: string | null;
    companyName: string;
    title: string;
    location: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
  },
): Promise<boolean> {
  const companyId = await linkCompany(job);
  try {
    await prisma.hiringSignal.create({
      data: {
        userId,
        companyId,
        companyName: job.companyName.slice(0, 200),
        source: job.sourceKey,
        type: "JOB_POSTING" as HiringSignalType,
        title: job.title.slice(0, 300),
        url: job.sourceUrl?.slice(0, 2000) ?? null,
        evidenceSummary: evidenceFor(job),
        confidence: job.externalId && job.sourceUrl ? 75 : 55,
        relatedJobId: job.id,
        dedupKey: signalDedupKey(job),
      },
    });
    return true;
  } catch (err) {
    // Unique violation = already signalled (idempotent); anything else is unexpected.
    if ((err as { code?: string })?.code === "P2002") return false;
    throw err;
  }
}

export interface DiscoveryRunOptions {
  discoveryConfigId: string;
  sourceKeys?: string[];
  requestedAt?: string;
}

/**
 * Run automated discovery: plan → bounded ingestion per search →
 * matching enqueue → signals → config bookkeeping.
 * Throws on total failure (BullMQ retries transient); partial success
 * completes with counts (no useless retries).
 */
export async function runDiscovery(userId: string, opts: DiscoveryRunOptions): Promise<DiscoverySummary> {
  const startedAt = Date.now();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw permanent("USER_NOT_FOUND", "Discovery user does not exist");
  const config = await prisma.discoveryConfig.findFirst({ where: { id: opts.discoveryConfigId, userId } });
  if (!config) throw permanent("CONFIG_NOT_FOUND", "Discovery configuration not found");
  if (!config.enabled) throw permanent("CONFIG_DISABLED", "Discovery is disabled for this user");

  const requested = (opts.sourceKeys ?? config.sourceKeys).slice(0, MAX_SOURCES_PER_RUN);
  for (const key of requested) getSource(key); // unknown source: 404 → permanent

  const profile = await prisma.profile.findUnique({ where: { userId } });
  const searches = planDiscoverySearches(config, profile, requested);
  logDiscovery("run_started", {
    userId,
    configId: config.id,
    sources: requested,
    searches: searches.length,
  });

  let discovered = 0;
  let inserted = 0;
  let updated = 0;
  let duplicates = 0;
  let rejected = 0;
  let sourcesSucceeded = 0;
  const changedIds: string[] = [];
  let lastError: unknown = null;
  let lastErrorTransient = false;

  for (const search of searches) {
    try {
      const result = await ingestJobs(
        userId,
        {
          source: search.source,
          query: search.params.query,
          location: search.params.location,
          remote: search.params.remote,
          employmentType: search.params.employmentType,
          limit: search.params.limit,
          board: search.board,
          async: false,
        },
        { includeJobIds: true },
      );
      if (result.errors.length > 0 && result.inserted === 0 && result.updated === 0 && result.duplicates === 0) {
        // Adapter-level failure (ingestJobs contains it as a result):
        // preserve the transient/permanent signal instead of flattening it.
        // Convention: adapter reasons starting with "transient: " are
        // retryable; anything else fails this source permanently.
        const reason = result.errors[0]?.reason ?? "source failed";
        if (reason.startsWith("transient:")) throw new Error(reason);
        throw permanent("SOURCE_FAILED", reason);
      }
      discovered += result.fetched;
      inserted += result.inserted;
      updated += result.updated;
      duplicates += result.duplicates;
      rejected += result.rejected;
      sourcesSucceeded += 1;
      for (const id of result.jobIds) {
        if (changedIds.length < MAX_CHANGED_IDS && !changedIds.includes(id)) changedIds.push(id);
      }
    } catch (err) {
      lastError = err;
      const status = (err as { status?: unknown })?.status;
      lastErrorTransient = !(typeof status === "number" && status >= 400 && status < 500);
      logDiscovery("source_failed", {
        userId,
        source: search.source,
        board: search.board,
        reason: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      });
    }
    await delay(POLITENESS_DELAY_MS);
  }

  // Eligibility (salary floor, excluded keywords) gates follow-ups only.
  let eligibleIds: string[] = [];
  if (changedIds.length > 0) {
    const rows = await prisma.job.findMany({ where: { id: { in: changedIds }, userId } });
    eligibleIds = rows.filter((j) => isEligibleForFollowUp(j, config)).map((j) => j.id);
  }

  let matchingQueued = false;
  if (eligibleIds.length > 0) {
    try {
      await enqueueMatching({
        userId,
        jobIds: eligibleIds,
        limit: Math.min(eligibleIds.length, 50),
        idempotencyKey: `discovery-${config.id}-${Date.now()}`,
      });
      matchingQueued = true;
    } catch {
      // Matching enqueue is best-effort: jobs are already stored safely.
      logDiscovery("matching_enqueue_failed", { userId, configId: config.id });
    }
  }

  let signalsCreated = 0;
  if (eligibleIds.length > 0) {
    const rows = await prisma.job.findMany({ where: { id: { in: eligibleIds }, userId } });
    for (const row of rows) {
      try {
        if (await recordJobPostingSignal(userId, row)) signalsCreated += 1;
      } catch {
        // One bad signal never fails the run.
      }
    }
  }

  const summary: DiscoverySummary = {
    sourcesAttempted: searches.length,
    sourcesSucceeded,
    discovered,
    inserted,
    updated,
    duplicates,
    rejected,
    matchingQueued,
    signalsCreated,
    durationMs: Date.now() - startedAt,
  };
  const status = sourcesSucceeded === 0 ? "failed" : sourcesSucceeded < searches.length ? "partial" : "completed";
  await prisma.discoveryConfig.update({
    where: { id: config.id },
    data: { lastRunAt: new Date(), lastStatus: status, lastSummary: { ...summary } as never },
  });
  logDiscovery("run_finished", { userId, configId: config.id, status, ...summary });

  if (sourcesSucceeded === 0 && lastError) {
    // Total failure: let BullMQ classify + retry (transient) or DLQ (permanent).
    const { classifyWorkerError, toProcessorError } = await import("@jobcopilot/queues");
    throw toProcessorError(classifyWorkerError(lastError));
  }
  void lastErrorTransient;
  return summary;
}

/** Processor entry: validate payload shape, then run. */
export async function runDiscoveryFromPayload(data: unknown): Promise<DiscoverySummary> {
  let payload: DiscoveryJobPayload;
  try {
    payload = DiscoveryJobPayloadSchema.parse(data);
  } catch {
    throw permanent("INVALID_PAYLOAD", "Discovery payload failed validation");
  }
  return runDiscovery(payload.userId, {
    discoveryConfigId: payload.discoveryConfigId,
    sourceKeys: payload.sourceKeys,
  });
}
