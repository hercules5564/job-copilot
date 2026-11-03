import type { FieldMapping } from "@jobcopilot/shared";
import { extractSkills, normalizeCandidateSkills, skillLabel } from "../services/skill-normalizer.js";
import { scoreRole } from "../services/match-components.js";

/**
 * Phase 7 — deterministic answer resolution (no LLM).
 * Values come ONLY from candidate data (profile/resume/projects/job).
 * Missing data → NEEDS_USER_INPUT. Nothing is invented or hallucinated.
 * A future LLMAnswerProvider can implement the same interface for
 * cover-letter-style fields while factual fields stay deterministic.
 */

export interface CandidateProjectData {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  role?: string | null;
  githubUrl?: string | null;
  liveUrl?: string | null;
}

export interface CandidateResumeData {
  id: string;
  name: string;
  targetRoles: string[];
  parsedText?: string | null;
}

export interface CandidateData {
  fullName?: string | null;
  email: string;
  yearsOfExperience?: number | null;
  education: string[];
  skills: string[];
  preferredLocations: string[];
  projects: CandidateProjectData[];
  resumes: CandidateResumeData[];
}

export interface JobData {
  title: string;
  companyName: string;
  description: string;
}

export interface ResolvedAnswer {
  /** Empty value with needsInput=true when data is missing. */
  value: string;
  /** e.g. "profile", "resume:<id>", "project:<id>", "generated-deterministic", "none" */
  source: string;
  needsInput: boolean;
  guidance?: string;
}

export interface ApplicationAnswerProvider {
  readonly id: string;
  resolve(mapping: FieldMapping, candidate: CandidateData, job: JobData): ResolvedAnswer;
}

/**
 * Phase 16 — approved personalization overlay (read-only, human-gated).
 * Only APPROVED draft content may flow into answer proposals, and only for
 * free-text mappings the personalization actually produces (cover letter,
 * projects). Everything else — including NEEDS_USER_INPUT answers and
 * REVIEW_REQUIRED drafts — never reaches the assistant: the deterministic
 * result stands. Proposals still require human approve + fill; nothing here
 * submits, fills, or bypasses confirmation.
 */
export interface ApprovedDraftContent {
  coverLetterText: string | null;
  selectedProjectIds: string[];
}

export const APPROVED_PERSONALIZATION_SOURCE = "approved-personalization";

export function applyApprovedContent(
  mapping: FieldMapping,
  resolved: ResolvedAnswer,
  candidate: CandidateData,
  approved: ApprovedDraftContent | null,
): ResolvedAnswer {
  if (!approved) return resolved;
  if (mapping === "candidate.coverLetter" && approved.coverLetterText) {
    return { value: approved.coverLetterText, source: APPROVED_PERSONALIZATION_SOURCE, needsInput: false };
  }
  if (mapping === "candidate.projects" && approved.selectedProjectIds.length > 0) {
    const picked = approved.selectedProjectIds
      .map((id) => candidate.projects.find((p) => p.id === id))
      .filter((p): p is CandidateProjectData => Boolean(p));
    // A selected project deleted since approval contributes nothing —
    // fall back to the deterministic result rather than inventing text.
    if (picked.length === 0) return resolved;
    return {
      value: picked.map((p) => `${p.name}: ${p.description}`).join("\n"),
      source: APPROVED_PERSONALIZATION_SOURCE,
      needsInput: false,
    };
  }
  return resolved;
}

function needInput(guidance: string): ResolvedAnswer {
  return { value: "", source: "none", needsInput: true, guidance };
}

export class DeterministicAnswerProvider implements ApplicationAnswerProvider {
  readonly id = "deterministic";

  resolve(mapping: FieldMapping, candidate: CandidateData, job: JobData): ResolvedAnswer {
    switch (mapping) {
      case "candidate.fullName":
        return candidate.fullName
          ? { value: candidate.fullName, source: "profile", needsInput: false }
          : needInput("Enter your full name.");
      case "candidate.email":
        return { value: candidate.email, source: "profile", needsInput: false };
      case "candidate.phone":
        return needInput("Enter your phone number (not stored in your profile).");
      case "candidate.githubUrl": {
        const project = candidate.projects.find((p) => p.githubUrl);
        return project?.githubUrl
          ? { value: project.githubUrl, source: `project:${project.id}`, needsInput: false }
          : needInput("Enter your GitHub URL.");
      }
      case "candidate.portfolioUrl": {
        const project = candidate.projects.find((p) => p.liveUrl);
        return project?.liveUrl
          ? { value: project.liveUrl, source: `project:${project.id}`, needsInput: false }
          : needInput("Enter your portfolio URL.");
      }
      case "candidate.linkedinUrl":
        return needInput("Enter your LinkedIn URL (not stored in your profile).");
      case "candidate.experience":
        return candidate.yearsOfExperience !== null && candidate.yearsOfExperience !== undefined
          ? { value: `${candidate.yearsOfExperience} years`, source: "profile", needsInput: false }
          : needInput("Enter your years of experience.");
      case "candidate.education":
        return candidate.education.length > 0
          ? { value: candidate.education.join("; "), source: "profile", needsInput: false }
          : needInput("Enter your education.");
      case "candidate.skills":
        return candidate.skills.length > 0
          ? { value: candidate.skills.join(", "), source: "profile", needsInput: false }
          : needInput("Enter your skills.");
      case "candidate.location":
        return candidate.preferredLocations.length > 0
          ? { value: candidate.preferredLocations[0], source: "profile", needsInput: false }
          : needInput("Enter your location.");
      case "candidate.coverLetter":
        return { value: buildCoverLetter(candidate, job), source: "generated-deterministic", needsInput: false };
      case "candidate.projects": {
        const picked = selectProjects(candidate, job, 2);
        return picked.length > 0
          ? {
              value: picked.map((p) => `${p.project.name}: ${p.project.description}`).join("\n"),
              source: picked.map((p) => `project:${p.project.id}`).join(","),
              needsInput: false,
            }
          : needInput("Describe a relevant project.");
      }
      case "candidate.resume": {
        const picked = selectResume(candidate, job);
        return {
          value: picked ? picked.resume.name : "",
          source: picked ? `resume:${picked.resume.id}` : "none",
          // File inputs cannot be filled programmatically: always manual upload.
          needsInput: true,
          guidance: picked
            ? `Upload "${picked.resume.name}" manually (${picked.reason}).`
            : "Upload your resume manually.",
        };
      }
      case "UNKNOWN":
      default:
        return needInput("This question was not recognized; answer manually.");
    }
  }
}

/** Deterministic cover-letter draft from verified facts only. */
function buildCoverLetter(candidate: CandidateData, job: JobData): string {
  const name = candidate.fullName ?? "Applicant";
  const skills = candidate.skills.slice(0, 8).join(", ");
  const experience =
    candidate.yearsOfExperience !== null && candidate.yearsOfExperience !== undefined
      ? ` with ${candidate.yearsOfExperience} years of experience`
      : "";
  return [
    `Dear Hiring Manager,`,
    ``,
    `I am ${name}, applying for the ${job.title} role at ${job.companyName}${experience}.`,
    skills ? `My core skills include ${skills}.` : ``,
    `Thank you for your consideration.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export interface ScoredProject {
  project: CandidateProjectData;
  score: number;
  reason: string;
}

/** Rank projects by skill overlap + role overlap with the job. */
export function selectProjects(candidate: CandidateData, job: JobData, topN = 3): ScoredProject[] {
  const jobSkills = new Set(extractSkills(`${job.title}\n${job.description}`));
  const scored = candidate.projects.map((project) => {
    const { known, unknown } = normalizeCandidateSkills(project.technologies);
    const techs = new Set([...known, ...unknown]);
    const overlap = [...jobSkills].filter((s) => techs.has(s));
    const roleHit =
      project.role && job.title.toLowerCase().includes(project.role.toLowerCase().split(" ")[0])
        ? 1
        : 0;
    const score = overlap.length * 10 + roleHit * 5;
    const reason =
      overlap.length > 0
        ? `Uses ${overlap.map(skillLabel).join(", ")}, which overlap${overlap.length === 1 ? "s" : ""} with the job requirements.`
        : project.role
          ? `Role "${project.role}" is related to this application.`
          : "Available project.";
    return { project, score, reason };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(topN, 1));
}

export interface ScoredResume {
  resume: CandidateResumeData;
  score: number;
  reason: string;
}

/** Pick the resume whose target roles best overlap the job title. */
export function selectResume(candidate: CandidateData, job: JobData): ScoredResume | null {
  if (candidate.resumes.length === 0) return null;
  const scored = candidate.resumes.map((resume) => {
    const outcome = scoreRole(resume.targetRoles, job.title);
    return {
      resume,
      score: outcome.score ?? 0,
      reason:
        (outcome.score ?? 0) > 0
          ? `Targets ${resume.targetRoles.join(", ") || resume.name}, overlapping "${job.title}".`
          : `Default resume (${resume.name}).`,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

const answerProviders = new Map<string, ApplicationAnswerProvider>([
  ["deterministic", new DeterministicAnswerProvider()],
]);

export function getAnswerProvider(id = "deterministic"): ApplicationAnswerProvider {
  const provider = answerProviders.get(id);
  if (!provider) throw new Error(`Unknown answer provider: "${id}"`);
  return provider;
}
