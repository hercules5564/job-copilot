import { prisma } from "@jobcopilot/db";
import {
  PERSONALIZATION_BOUNDS,
  type FactReference,
} from "@jobcopilot/shared";
import { notFound } from "./errors.js";

/**
 * Phase 15 — deterministic candidate-context builder.
 * Loads ONLY the authenticated user's own records (Profile, Resume,
 * Projects), the application's Job, and the stored JobMatch (never
 * recomputed). Everything is bounded; job text is untrusted data.
 */

const B = PERSONALIZATION_BOUNDS;

function oneLine(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function fact(
  id: string,
  sourceType: FactReference["sourceType"],
  sourceId: string,
  field: string,
  value: string,
): FactReference | null {
  const clean = oneLine(value, 500);
  if (!clean) return null;
  return { id: id.toLowerCase(), sourceType, sourceId, field, value: clean };
}

/** Defensive Json → string[] for Profile.education (array of strings/objects). */
export function educationToStrings(education: unknown): string[] {
  if (!Array.isArray(education)) return [];
  const out: string[] = [];
  for (const entry of education.slice(0, 10)) {
    if (typeof entry === "string" && entry.trim()) out.push(entry.trim().slice(0, 200));
    else if (entry && typeof entry === "object") {
      const joined = Object.values(entry as Record<string, unknown>)
        .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
        .map((v) => String(v).trim())
        .filter(Boolean)
        .join(" — ")
        .slice(0, 200);
      if (joined) out.push(joined);
    }
    if (out.length >= 10) break;
  }
  return out;
}

export interface PersonalizationContext {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  jobCompany: string;
  resumeId: string | null;
  resumeName: string | null;
  /** Grounding inventory: the ONLY facts the model may cite. */
  facts: FactReference[];
  /** Owned project ids (for selected-project validation). */
  projectIds: string[];
  /** Rendered CANDIDATE FACTS section for the user prompt. */
  candidateSection: string;
  /** Rendered JOB DATA section (untrusted — labeled as data). */
  jobSection: string;
  /** Rendered MATCH DATA section (stored match, never recomputed). */
  matchSection: string;
  /** Deterministic missing-data notes (become draft warnings). */
  missingDataWarnings: string[];
  /** Match summary for the UI (null when no stored match). */
  matchSummary: {
    overallScore: number;
    decision: string;
    matchMode: string;
  } | null;
}

export async function buildPersonalizationContext(
  userId: string,
  applicationId: string,
  opts: { resumeId?: string | null } = {},
): Promise<PersonalizationContext> {
  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          companyName: true,
          location: true,
          remote: true,
          employmentType: true,
          description: true,
        },
      },
    },
  });
  if (!application || !application.job) throw notFound("Application not found");

  // Resume precedence: explicit request → application's → active → latest.
  // Every candidate is owner-checked; foreign ids resolve to 404.
  let resume = null;
  if (opts.resumeId) {
    resume = await prisma.resume.findFirst({ where: { id: opts.resumeId, userId } });
    if (!resume) throw notFound("Resume not found");
  } else if (application.resumeId) {
    resume = await prisma.resume.findFirst({ where: { id: application.resumeId, userId } });
  }
  if (!resume) {
    resume =
      (await prisma.resume.findFirst({ where: { userId, isActive: true }, orderBy: { updatedAt: "desc" } })) ??
      (await prisma.resume.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } }));
  }

  const [profile, projects, match] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.project.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: B.maxProjects }),
    prisma.jobMatch.findUnique({
      where: { jobId_userId: { jobId: application.job.id, userId } },
    }),
  ]);

  const facts: FactReference[] = [];
  const push = (f: FactReference | null) => {
    if (f) facts.push(f);
  };

  if (profile) {
    const pid = profile.id;
    push(fact("profile:headline", "profile", pid, "headline", profile.headline ?? ""));
    push(fact("profile:summary", "profile", pid, "summary", profile.summary ?? ""));
    if (profile.yearsOfExperience !== null && profile.yearsOfExperience !== undefined) {
      push({
        id: "profile:years-of-experience",
        sourceType: "profile",
        sourceId: pid,
        field: "yearsOfExperience",
        value: `${profile.yearsOfExperience} years of experience`,
      });
    }
    for (const [i, role] of (profile.targetRoles ?? []).slice(0, 10).entries()) {
      push(fact(`profile:roles:${i}`, "profile", pid, "targetRole", role));
    }
    for (const [i, skill] of (profile.skills ?? []).slice(0, B.maxSkills).entries()) {
      push(fact(`profile:skills:${i}`, "profile", pid, "skill", skill));
    }
    for (const [i, edu] of educationToStrings(profile.education).entries()) {
      push(fact(`profile:education:${i}`, "profile", pid, "education", edu));
    }
  }

  if (resume) {
    const text = oneLine(resume.parsedText ?? "", B.maxResumeChars);
    push(fact(`resume:${resume.id}:text`, "resume", resume.id, "parsedText", text));
    for (const [i, role] of (resume.targetRoles ?? []).slice(0, 10).entries()) {
      push(fact(`resume:${resume.id}:roles:${i}`, "resume", resume.id, "targetRole", role));
    }
  }

  const projectIds: string[] = [];
  for (const p of projects) {
    projectIds.push(p.id);
    const pid = p.id.toLowerCase();
    push(fact(`project:${pid}:name`, "project", p.id, "name", p.name));
    push(fact(`project:${pid}:description`, "project", p.id, "description", (p.description ?? "").slice(0, B.maxProjectDescChars)));
    push(fact(`project:${pid}:role`, "project", p.id, "role", p.role ?? ""));
    push(fact(`project:${pid}:contributions`, "project", p.id, "contributions", p.contributions ?? ""));
    push(fact(`project:${pid}:achievements`, "project", p.id, "achievements", p.achievements ?? ""));
    for (const [i, tech] of (p.technologies ?? []).slice(0, 20).entries()) {
      push(fact(`project:${pid}:tech:${i}`, "project", p.id, "technology", tech));
    }
  }

  const job = application.job;
  const jobFacts: FactReference[] = [];
  const jpush = (f: FactReference | null) => {
    if (f) jobFacts.push(f);
  };
  jpush(fact(`job:${job.id}:title`, "job", job.id, "title", job.title));
  jpush(fact(`job:${job.id}:company`, "job", job.id, "company", job.companyName));
  jpush(fact(`job:${job.id}:location`, "job", job.id, "location", job.location ?? ""));
  jpush(fact(`job:${job.id}:employment-type`, "job", job.id, "employmentType", job.employmentType ?? ""));

  const missingDataWarnings: string[] = [];
  if (!profile) missingDataWarnings.push("No candidate profile found; generate from resume and project data only.");
  if (profile && (profile.yearsOfExperience === null || profile.yearsOfExperience === undefined)) {
    missingDataWarnings.push("Years of experience were not established from your profile/resume.");
  }
  if (!resume) missingDataWarnings.push("No resume found; candidate facts come from profile and projects only.");
  if (projects.length === 0) missingDataWarnings.push("No projects found; project selection is unavailable.");
  if (!match) missingDataWarnings.push("No stored match result for this job; project relevance is unguided.");

  const candidateSection = facts.length === 0
    ? "(no candidate facts available)"
    : facts.map((f) => `fact ${f.id} | ${f.field} | ${f.value}`).join("\n");

  const jobDesc = oneLine(job.description ?? "", B.maxJobDescChars);
  const jobSection = [
    `Title: ${oneLine(job.title, 200)}`,
    `Company: ${oneLine(job.companyName, 200)}`,
    job.location ? `Location: ${oneLine(job.location, 200)}` : "",
    job.remote ? "Remote: yes" : "",
    job.employmentType ? `Employment type: ${oneLine(job.employmentType, 100)}` : "",
    `Description: ${jobDesc || "(none)"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const matchSection = match
    ? [
        `Overall score: ${match.overallScore}`,
        `Decision: ${match.decision}`,
        `Match mode: ${match.matchMode}`,
        match.semanticScore !== null && match.semanticScore !== undefined ? `Semantic score: ${match.semanticScore}` : "",
        `Matched skills: ${match.matchedSkills.slice(0, 20).join(", ") || "(none)"}`,
        `Missing skills: ${match.missingSkills.slice(0, 20).join(", ") || "(none)"}`,
        `Matched requirements: ${match.matchedRequirements.slice(0, 20).join("; ") || "(none)"}`,
        `Uncertain requirements: ${match.uncertainRequirements.slice(0, 20).join("; ") || "(none)"}`,
        match.warnings.length > 0 ? `Warnings: ${match.warnings.slice(0, 10).join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "(no stored match result)";

  return {
    applicationId,
    jobId: job.id,
    jobTitle: job.title,
    jobCompany: job.companyName,
    resumeId: resume?.id ?? null,
    resumeName: resume?.name ?? null,
    facts,
    projectIds,
    candidateSection,
    jobSection,
    matchSection,
    missingDataWarnings,
    matchSummary: match
      ? { overallScore: match.overallScore, decision: match.decision, matchMode: match.matchMode }
      : null,
  };
}
