import { prisma, type Prisma } from "@jobcopilot/db";
import type { RecommendationsQuery, RunRecommendationsInput } from "@jobcopilot/shared";
import { notFound } from "./errors.js";
import { extractRequiredYears } from "./match-components.js";
import { runMatches } from "./match-runner.js";
import { savedJobIdSet } from "./saved-jobs.js";

/**
 * Phase 22 — recommendation surface over the EXISTING matcher.
 * Scores and explanations come from persisted JobMatch rows produced by
 * match-runner; this service never invents a score. Filters/sorting are
 * presentation concerns. Eligibility guardrails (semantic cap on hard
 * mismatches) already live in semantic-matcher.ts.
 */

type MatchWithJob = Prisma.JobMatchGetPayload<{ include: { job: true } }>;

export type JobExperienceLevel = "INTERN" | "ENTRY" | "MID" | "SENIOR" | "LEAD";

export interface RecommendationItem {
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  source: string;
  sourceUrl: string | null;
  applyUrl: string | null;
  postedAt: string | null;
  experienceRequirement: number | null;
  experienceLevel: JobExperienceLevel | null;
  matchScore: number;
  decision: string;
  matchMode: string;
  breakdown: {
    skillScore: number;
    roleScore: number;
    experienceScore: number;
    projectScore: number;
    educationScore: number;
    locationScore: number;
    salaryScore: number;
    employmentTypeScore: number;
    workAuthScore: number;
  };
  reasons: string[];
  matchedSkills: string[];
  missingSkills: string[];
  warnings: string[];
  saved: boolean;
}

function jobLevel(title: string, description: string): JobExperienceLevel | null {
  if (/\bintern(?:ship)?\b/i.test(title)) return "INTERN";
  const required = extractRequiredYears(description);
  if (required === null) return null;
  if (required <= 1) return "ENTRY";
  if (required <= 4) return "MID";
  if (required <= 8) return "SENIOR";
  return "LEAD";
}

function toItem(row: MatchWithJob, saved: boolean): RecommendationItem {
  const job = row.job;
  const required = extractRequiredYears(job.description);
  const postedAt = job.postedAt ?? job.createdAt;
  const reasons =
    row.reasons.length > 0
      ? row.reasons.slice(0, 3)
      : [
          row.matchedSkills.length > 0
            ? `Matches ${row.matchedSkills.slice(0, 4).join(", ")}.`
            : "General profile compatibility was detected.",
        ];
  return {
    jobId: job.id,
    title: job.title,
    company: job.companyName,
    location: job.location,
    remote: job.remote,
    employmentType: job.employmentType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    source: job.sourceKey,
    sourceUrl: job.sourceUrl,
    applyUrl: job.sourceUrl,
    postedAt: postedAt ? postedAt.toISOString() : null,
    experienceRequirement: required,
    experienceLevel: jobLevel(job.title, job.description),
    matchScore: row.overallScore,
    decision: row.decision,
    matchMode: row.matchMode,
    breakdown: {
      skillScore: row.skillScore,
      roleScore: row.roleScore,
      experienceScore: row.experienceScore,
      projectScore: row.projectScore,
      educationScore: row.educationScore,
      locationScore: row.locationScore,
      salaryScore: row.salaryScore,
      employmentTypeScore: row.employmentTypeScore,
      workAuthScore: row.workAuthScore,
    },
    reasons,
    matchedSkills: row.matchedSkills,
    missingSkills: row.missingSkills,
    warnings: row.warnings,
    saved,
  };
}

export async function listRecommendations(
  userId: string,
  query: RecommendationsQuery,
): Promise<{ items: RecommendationItem[]; total: number; filters: RecommendationsQuery }> {
  const rows = await prisma.jobMatch.findMany({
    where: {
      userId,
      ...(query.minScore !== undefined ? { overallScore: { gte: query.minScore } } : {}),
    },
    include: { job: true },
    orderBy: { overallScore: "desc" },
    take: 500,
  });
  const saved = await savedJobIdSet(userId);
  let items = rows.map((row) => toItem(row, saved.has(row.jobId)));

  const role = query.role?.toLowerCase();
  if (role) items = items.filter((i) => i.title.toLowerCase().includes(role));
  const location = query.location?.toLowerCase();
  if (location) {
    items = items.filter((i) =>
      i.remote ? "remote".includes(location) : (i.location ?? "").toLowerCase().includes(location),
    );
  }
  if (query.workMode === "REMOTE") items = items.filter((i) => i.remote);
  if (query.workMode === "ONSITE" || query.workMode === "HYBRID") {
    items = items.filter((i) => !i.remote);
  }
  if (query.employmentType) {
    const type = query.employmentType.toLowerCase();
    items = items.filter((i) => (i.employmentType ?? "").toLowerCase().includes(type));
  }
  if (query.experienceLevel) {
    items = items.filter(
      (i) => i.experienceLevel === null || i.experienceLevel === query.experienceLevel,
    );
  }
  if (query.postedWithinDays) {
    const cutoff = Date.now() - query.postedWithinDays * 24 * 60 * 60 * 1000;
    items = items.filter((i) => (i.postedAt ? Date.parse(i.postedAt) >= cutoff : false));
  }

  if (query.sort === "recent") {
    items.sort((a, b) => (b.postedAt ? Date.parse(b.postedAt) : 0) - (a.postedAt ? Date.parse(a.postedAt) : 0));
  } else if (query.sort === "salary") {
    items.sort((a, b) => (b.salaryMax ?? b.salaryMin ?? -1) - (a.salaryMax ?? a.salaryMin ?? -1));
  } else {
    items.sort((a, b) => b.matchScore - a.matchScore);
  }

  const total = items.length;
  return { items: items.slice(0, query.limit), total, filters: query };
}

export async function getRecommendationDetail(userId: string, jobId: string) {
  const row = await prisma.jobMatch.findFirst({
    where: { userId, jobId },
    include: { job: true },
  });
  if (!row) throw notFound("Match not found for this job. Run matching first.");
  const saved = await savedJobIdSet(userId);
  const item = toItem(row, saved.has(jobId));
  const projects = await prisma.project.findMany({ where: { userId }, take: 100 });
  const matched = new Set(row.matchedSkills.map((s) => s.toLowerCase()));
  const matchingProjects = projects
    .map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      technologies: p.technologies.filter((t) => matched.has(t.toLowerCase())),
    }))
    .filter((p) => p.technologies.length > 0)
    .slice(0, 5);

  const recommendations: string[] = [];
  for (const skill of row.missingSkills.slice(0, 5)) {
    recommendations.push(
      `Build or extend a small project that uses ${skill}, then add the outcome to your resume.`,
    );
  }
  if (matchingProjects.length > 0) {
    recommendations.push(
      `Emphasise ${matchingProjects[0].name} in your application — it overlaps ${matchingProjects[0].technologies.join(", ")}.`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push("Keep your resume and project descriptions current so matches stay accurate.");
  }

  return {
    ...item,
    explanation: {
      whyThisMatches: row.reasons,
      matchedSkills: row.matchedSkills,
      matchedRequirements: row.matchedRequirements,
      missingSkills: row.missingSkills,
      missingRequirements: row.missingRequirements,
      uncertainRequirements: row.uncertainRequirements,
      matchingProjects,
      recommendations,
      warnings: row.warnings,
    },
  };
}

export async function runRecommendations(
  userId: string,
  input: RunRecommendationsInput,
): Promise<{ matched: number; mode: string }> {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) {
    throw notFound("Create your candidate profile first. Upload and confirm a resume, then run matching.");
  }
  const { matched, matches } = await runMatches(userId, input.limit, input.mode);
  return { matched, mode: matches[0]?.matchMode ?? (input.mode ?? "deterministic") };
}

export async function profileCompleteness(userId: string): Promise<{
  percent: number;
  missing: string[];
  hasProfile: boolean;
  parsedResumes: number;
}> {
  const [profile, projects, resumes] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.project.count({ where: { userId } }),
    prisma.resume.count({ where: { userId, status: "PARSED" } }),
  ]);
  const checks: { label: string; ok: boolean }[] = [
    { label: "Upload and analyse a resume", ok: resumes > 0 },
    { label: "Add a professional summary", ok: Boolean(profile?.summary) },
    { label: "Set a current/desired title", ok: Boolean(profile?.headline) },
    { label: "Add target roles", ok: (profile?.targetRoles.length ?? 0) > 0 },
    { label: "Add skills", ok: (profile?.skills.length ?? 0) > 0 },
    { label: "Set preferred locations", ok: (profile?.preferredLocations.length ?? 0) > 0 },
    { label: "Choose a work mode", ok: Boolean(profile && profile.workMode !== "ANY") },
    { label: "Add education or experience years", ok: Boolean(profile?.education) || profile?.yearsOfExperience != null },
    { label: "Add a project or portfolio", ok: projects > 0 || Boolean(profile?.portfolioUrl || profile?.githubUrl) },
    { label: "Add a portfolio/GitHub/LinkedIn link", ok: Boolean(profile?.portfolioUrl || profile?.githubUrl || profile?.linkedinUrl) },
  ];
  const done = checks.filter((c) => c.ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter((c) => !c.ok).map((c) => c.label),
    hasProfile: Boolean(profile),
    parsedResumes: resumes,
  };
}
