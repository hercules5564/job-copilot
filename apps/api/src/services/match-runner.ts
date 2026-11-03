import { prisma } from "@jobcopilot/db";
import {
  MatchModeSchema,
  MatchResultSchema,
  type CandidateSnapshot,
  type JobSnapshot,
  type MatchMode,
  type MatchResult,
} from "@jobcopilot/shared";
import { DeterministicMatchProvider, getMatchProvider, registerMatchProvider } from "./job-matcher.js";
import { HybridMatchProvider, SemanticMatchProvider } from "./semantic-matcher.js";
import { extractSkills, normalizeCandidateSkills } from "./skill-normalizer.js";
import { notFound } from "./errors.js";
import { ensureUser } from "./users.js";

registerMatchProvider(new SemanticMatchProvider());
registerMatchProvider(new HybridMatchProvider());

/**
 * Phase 4 — match runner: Prisma <-> matcher bridge (+ Phase 5 modes).
 * Candidate/job snapshots are built here; the pure matcher never sees Prisma.
 * Batch runs fetch candidate data once + one bounded job query (no N+1),
 * score in memory, and persist via upsert (re-runs never duplicate).
 *
 * Mode resolution is server-side: an optional validated per-request mode
 * overrides the MATCH_PROVIDER env default. Semantic/hybrid failures fall
 * back to deterministic scoring and are honestly labeled
 * "deterministic_fallback" — the API never claims AI matching that did
 * not happen.
 */

const fallbackDeterministic = new DeterministicMatchProvider();

/** Resolve the effective mode: validated request override, else env default. */
export function resolveMatchMode(requested?: MatchMode | null): MatchMode {
  if (requested) return MatchModeSchema.parse(requested);
  const parsed = MatchModeSchema.safeParse(
    (process.env.MATCH_PROVIDER ?? "deterministic").toLowerCase(),
  );
  return parsed.success ? parsed.data : "deterministic";
}

/**
 * Map embedding errors to safe categories for warnings/logs.
 * Raw messages may contain URLs — never surface them to clients or logs.
 */
function categorizeEmbeddingError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/timed out/i.test(message)) return "timed out";
  if (/rate limit/i.test(message)) return "was rate-limited";
  if (/authentication/i.test(message)) return "was not authenticated";
  if (/unreachable/i.test(message)) return "was unreachable";
  if (/malformed|dimension|non-finite|undefined for this pair/i.test(message)) {
    return "returned unusable data";
  }
  if (/requires AI_API_KEY|Unknown EMBEDDING_PROVIDER/i.test(message)) {
    return "is not configured";
  }
  return "was unavailable";
}

async function matchWithMode(
  candidate: CandidateSnapshot,
  snapshot: JobSnapshot,
  mode: MatchMode,
): Promise<MatchResult> {
  if (mode === "deterministic") {
    return getMatchProvider("deterministic").match(candidate, snapshot);
  }
  try {
    return await getMatchProvider(mode).match(candidate, snapshot);
  } catch (err) {
    const base = fallbackDeterministic.match(candidate, snapshot) as MatchResult;
    const reason = categorizeEmbeddingError(err);
    return {
      ...base,
      matchMode: "deterministic_fallback",
      semanticScore: undefined,
      semanticProvider: undefined,
      semanticModel: undefined,
      warnings: [
        ...base.warnings,
        `Semantic matching ${reason}; used deterministic scoring instead.`,
      ],
    };
  }
}

function educationToStrings(education: unknown): string[] {
  if (!education) return [];
  const items = Array.isArray(education) ? education : [education];
  const out: string[] = [];
  for (const item of items) {
    if (typeof item === "string" && item.trim()) out.push(item.trim().slice(0, 300));
    else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const bits = ["degree", "field", "school", "name", "major"]
        .map((k) => rec[k])
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((s) => s.trim().slice(0, 200));
      if (bits.length > 0) out.push(bits.join(" — "));
    }
  }
  return out.slice(0, 20);
}

export async function buildCandidateSnapshot(userId: string): Promise<CandidateSnapshot> {
  const [profile, projects] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.project.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  if (!profile) throw notFound("Candidate profile not found. Create your profile first.");
  return {
    targetRoles: profile.targetRoles,
    skills: profile.skills,
    experienceYears: profile.yearsOfExperience,
    preferredLocations: profile.preferredLocations,
    remotePreference: profile.workMode,
    minimumSalary: profile.minSalary ?? profile.preferredSalary,
    preferredCurrency: profile.salaryCurrency,
    education: educationToStrings(profile.education),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      technologies: p.technologies,
      role: p.role,
    })),
  };
}

export function jobToSnapshot(job: {
  id: string;
  title: string;
  companyName: string;
  description: string;
  employmentType: string | null;
  remote: boolean;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
}): JobSnapshot {
  return {
    id: job.id,
    title: job.title,
    company: job.companyName,
    description: job.description,
    employmentType: job.employmentType,
    remote: job.remote,
    location: job.location,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
  };
}

/** Project relevance: best technology overlap with the job's detected skills. */
function projectSignal(
  candidate: CandidateSnapshot,
  job: JobSnapshot,
): { projectScore: number; recommendedProjectIds: string[] } {
  const jobSkills = new Set(extractSkills(`${job.title}\n${job.description}`));
  if (jobSkills.size === 0 || candidate.projects.length === 0) {
    return { projectScore: 0, recommendedProjectIds: [] };
  }
  let best = 0;
  const recommended: string[] = [];
  for (const project of candidate.projects) {
    const { known, unknown } = normalizeCandidateSkills(project.technologies);
    const techs = new Set([...known, ...unknown]);
    const overlap = [...jobSkills].filter((s) => techs.has(s)).length;
    const score = Math.round((overlap / jobSkills.size) * 100);
    if (score > best) best = score;
    if (overlap > 0 && project.id) recommended.push(project.id);
  }
  return { projectScore: best, recommendedProjectIds: recommended.slice(0, 10) };
}

function employmentTypeSignal(
  candidateTypes: string[],
  jobType: string | null | undefined,
): number {
  if (!jobType) return 50; // unknown: job states no type
  if (candidateTypes.length === 0) return 50; // unknown: no preference
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "");
  return candidateTypes.some((t) => norm(t) === norm(jobType)) ? 100 : 0;
}

async function persistResult(
  userId: string,
  jobId: string,
  result: MatchResult,
  candidate: CandidateSnapshot,
  job: JobSnapshot,
) {
  const { projectScore, recommendedProjectIds } = projectSignal(candidate, job);
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const data = {
    overallScore: result.overallScore,
    decision: result.decision,
    skillScore: result.breakdown.skillScore,
    roleScore: result.breakdown.roleScore,
    experienceScore: result.breakdown.experienceScore,
    educationScore: result.breakdown.educationScore,
    projectScore,
    locationScore: result.breakdown.locationScore,
    salaryScore: result.breakdown.salaryScore,
    employmentTypeScore: employmentTypeSignal(
      profile?.employmentTypes ?? [],
      job.employmentType,
    ),
    // Jobs carry no work-authorization data: neutral unknown, never a failure.
    workAuthScore: 50,
    reasons: result.reasons,
    missingRequirements: result.missingRequirements,
    riskFlags: result.warnings,
    recommendedProjectIds,
    matchedSkills: result.matchedSkills,
    missingSkills: result.missingSkills,
    matchedRequirements: result.matchedRequirements,
    uncertainRequirements: result.uncertainRequirements,
    warnings: result.warnings,
    semanticScore: result.semanticScore ?? null,
    matchMode: result.matchMode ?? "deterministic",
    semanticProvider: result.semanticProvider ?? null,
    semanticModel: result.semanticModel ?? null,
  };
  return prisma.jobMatch.upsert({
    where: { jobId_userId: { jobId, userId } },
    update: data,
    create: { userId, jobId, ...data },
  });
}

/** Serialize a stored row back into the public MatchResult contract. */
export function toMatchResult(
  row: {
    jobId: string;
    overallScore: number;
    decision: string;
    skillScore: number;
    roleScore: number;
    experienceScore: number;
    locationScore: number;
    salaryScore: number;
    educationScore: number;
    matchedSkills: string[];
    missingSkills: string[];
    matchedRequirements: string[];
    missingRequirements: string[];
    uncertainRequirements: string[];
    reasons: string[];
    warnings: string[];
    semanticScore: number | null;
    matchMode: string;
    semanticProvider: string | null;
    semanticModel: string | null;
  },
): MatchResult {
  return MatchResultSchema.parse({
    jobId: row.jobId,
    overallScore: row.overallScore,
    decision: row.decision,
    breakdown: {
      skillScore: row.skillScore,
      roleScore: row.roleScore,
      experienceScore: row.experienceScore,
      locationScore: row.locationScore,
      salaryScore: row.salaryScore,
      educationScore: row.educationScore,
    },
    matchedSkills: row.matchedSkills,
    missingSkills: row.missingSkills,
    matchedRequirements: row.matchedRequirements,
    missingRequirements: row.missingRequirements,
    uncertainRequirements: row.uncertainRequirements,
    reasons: row.reasons,
    warnings: row.warnings,
    semanticScore: row.semanticScore ?? undefined,
    matchMode: row.matchMode,
    semanticProvider: row.semanticProvider ?? undefined,
    semanticModel: row.semanticModel ?? undefined,
  });
}

/** Score one user-owned job, persist via upsert, return the contract. */
export async function runMatchForJob(
  userId: string,
  jobId: string,
  mode?: MatchMode,
): Promise<MatchResult> {
  await ensureUser(userId);
  const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
  if (!job) throw notFound("Job not found");
  const candidate = await buildCandidateSnapshot(userId);
  const snapshot = jobToSnapshot(job);
  const result = await matchWithMode(candidate, snapshot, resolveMatchMode(mode));
  await persistResult(userId, job.id, result, candidate, snapshot);
  return result;
}

/** Return the saved match for one user-owned job. */
export async function getSavedMatch(userId: string, jobId: string): Promise<MatchResult> {
  const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
  if (!job) throw notFound("Job not found");
  const row = await prisma.jobMatch.findUnique({
    where: { jobId_userId: { jobId, userId } },
  });
  if (!row) throw notFound("Match not found. Run matching for this job first.");
  return toMatchResult(row);
}

/**
 * Score a bounded batch of the user's most recent jobs.
 * Candidate data is fetched once; jobs in one query; scoring in memory.
 */
export async function runMatches(
  userId: string,
  limit: number,
  mode?: MatchMode,
): Promise<{ matched: number; matches: MatchResult[] }> {
  await ensureUser(userId);
  const capped = Math.min(Math.max(limit, 1), 50);
  const effectiveMode = resolveMatchMode(mode);
  const candidate = await buildCandidateSnapshot(userId);
  const jobs = await prisma.job.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: capped,
  });
  const matches: MatchResult[] = [];
  for (const job of jobs) {
    const snapshot = jobToSnapshot(job);
    const result = await matchWithMode(candidate, snapshot, effectiveMode);
    await persistResult(userId, job.id, result, candidate, snapshot);
    matches.push(result);
  }
  return { matched: matches.length, matches };
}
