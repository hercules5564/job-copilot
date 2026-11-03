import {
  MATCH_WEIGHTS,
  decisionForScore,
  type CandidateSnapshot,
  type JobSnapshot,
  type MatchDecision,
  type MatchResult,
} from "@jobcopilot/shared";
import {
  extractSkills,
  normalizeCandidateSkills,
  skillLabel,
} from "./skill-normalizer.js";
import {
  scoreEducation,
  scoreExperience,
  scoreLocation,
  scoreRole,
  scoreSalary,
  type ComponentOutcome,
} from "./match-components.js";

/**
 * Phase 4 — deterministic, explainable job matcher.
 *
 * Unknown handling (documented): a component that cannot be compared
 * (missing data on either side) is EXCLUDED from the weighted total;
 * the known weights are rescaled so the score stays 0–100 without
 * punishing missing information. Failures (explicit mismatch) score 0
 * and keep their weight. Exception: a job with no detectable skills
 * scores a neutral 50 with an explicit uncertain flag, so skill-less
 * jobs neither ace nor tank the match.
 */

// ---- provider seam (Phase 5 fills it) --------------------------------------
// Deterministic, semantic, and hybrid providers implement this interface and
// register here. The JobMatch model, API contracts, frontend, and workflow
// stay untouched. Phase 5 widens match() to async so embedding providers
// can perform I/O; the deterministic provider remains fully synchronous
// in behavior (returned directly, never a rejected promise).
export interface MatchProvider {
  readonly id: string;
  match(
    candidate: CandidateSnapshot,
    job: JobSnapshot,
  ): MatchResult | Promise<MatchResult>;
}

const providers = new Map<string, MatchProvider>();

export function registerMatchProvider(provider: MatchProvider): void {
  providers.set(provider.id, provider);
}

export function getMatchProvider(id = "deterministic"): MatchProvider {
  const provider = providers.get(id);
  if (!provider) throw new Error(`Unknown match provider: "${id}"`);
  return provider;
}

// ---- skill component -----------------------------------------------------

function scoreSkills(
  candidate: CandidateSnapshot,
  job: JobSnapshot,
): ComponentOutcome & { matchedSkills: string[]; missingSkills: string[] } {
  const base: ComponentOutcome = {
    score: null,
    matched: [],
    missing: [],
    uncertain: [],
    reasons: [],
    warnings: [],
  };
  const jobSkills = extractSkills(`${job.title}\n${job.description}`);
  if (jobSkills.length === 0) {
    return {
      ...base,
      score: 50,
      uncertain: ["No explicit skills detected in the job; skill score is neutral."],
      matchedSkills: [],
      missingSkills: [],
    };
  }
  const { known, unknown } = normalizeCandidateSkills(candidate.skills);
  const candidateSet = new Set([...known, ...unknown]);
  const matched = jobSkills.filter((s) => candidateSet.has(s));
  const missing = jobSkills.filter((s) => !candidateSet.has(s));
  const score = Math.round((matched.length / jobSkills.length) * 100);
  const matchedSkills = matched.map(skillLabel);
  const missingSkills = missing.map(skillLabel);
  if (matched.length > 0) {
    base.matched.push(`${matched.length} of ${jobSkills.length} detected skills match.`);
    base.reasons.push(
      `${matched.length} of ${jobSkills.length} detected required skills match (${matchedSkills.join(", ")}).`,
    );
  }
  if (missing.length > 0) base.missing.push(`Missing: ${missingSkills.join(", ")}.`);
  return { ...base, score, matchedSkills, missingSkills };
}

// ---- overall -------------------------------------------------------------

interface WeightedPart {
  key: keyof typeof MATCH_WEIGHTS;
  weight: number;
  outcome: ComponentOutcome;
}

export class DeterministicMatchProvider implements MatchProvider {
  readonly id = "deterministic";

  match(candidate: CandidateSnapshot, job: JobSnapshot): MatchResult {
    const skills = scoreSkills(candidate, job);
    const role = scoreRole(candidate.targetRoles, job.title);
    const experience = scoreExperience(candidate.experienceYears, job.description);
    const location = scoreLocation(
      candidate.remotePreference,
      candidate.preferredLocations,
      job.remote,
      job.location,
    );
    const salary = scoreSalary(
      candidate.minimumSalary,
      candidate.preferredCurrency,
      job.salaryMin,
      job.salaryMax,
      job.salaryCurrency,
    );
    const education = scoreEducation(candidate.education, job.description);

    const parts: WeightedPart[] = [
      { key: "skills", weight: MATCH_WEIGHTS.skills, outcome: skills },
      { key: "role", weight: MATCH_WEIGHTS.role, outcome: role },
      { key: "experience", weight: MATCH_WEIGHTS.experience, outcome: experience },
      { key: "location", weight: MATCH_WEIGHTS.location, outcome: location },
      { key: "salary", weight: MATCH_WEIGHTS.salary, outcome: salary },
      { key: "education", weight: MATCH_WEIGHTS.education, outcome: education },
    ];
    const known = parts.filter((p) => p.outcome.score !== null);
    const knownWeight = known.reduce((sum, p) => sum + p.weight, 0);
    const overallScore =
      knownWeight === 0
        ? 0
        : Math.round(
            known.reduce((sum, p) => sum + p.outcome.score! * p.weight, 0) / knownWeight,
          );
    const decision: MatchDecision = decisionForScore(overallScore);

    const breakdown = {
      skillScore: skills.score ?? 0,
      roleScore: role.score ?? 0,
      experienceScore: experience.score ?? 0,
      locationScore: location.score ?? 0,
      salaryScore: salary.score ?? 0,
      educationScore: education.score ?? 0,
    };
    const matchedRequirements = [
      ...skills.matched,
      ...role.matched,
      ...experience.matched,
      ...location.matched,
      ...salary.matched,
      ...education.matched,
    ];
    const missingRequirements = [
      ...skills.missing,
      ...role.missing,
      ...experience.missing,
      ...location.missing,
      ...salary.missing,
      ...education.missing,
    ];
    const uncertainRequirements = parts.flatMap((p) => p.outcome.uncertain);
    const reasons = parts.flatMap((p) => p.outcome.reasons);
    if (reasons.length === 0) {
      reasons.push(
        decision === "LOW_MATCH"
          ? "Limited overlap was detected between your profile and this job."
          : "General profile compatibility was detected.",
      );
    }
    const warnings = parts.flatMap((p) => p.outcome.warnings);

    return {
      jobId: job.id,
      overallScore,
      decision,
      breakdown,
      matchedSkills: skills.matchedSkills,
      missingSkills: skills.missingSkills,
      matchedRequirements,
      missingRequirements,
      uncertainRequirements,
      reasons,
      warnings,
      matchMode: "deterministic" as const,
    };
  }
}

/** Convenience wrapper using the default provider (async since Phase 5). */
export async function matchJob(
  candidate: CandidateSnapshot,
  job: JobSnapshot,
): Promise<MatchResult> {
  return getMatchProvider().match(candidate, job);
}

registerMatchProvider(new DeterministicMatchProvider());
