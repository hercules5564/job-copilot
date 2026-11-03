import { z } from "zod";

/**
 * Phase 4 — shared job-matching contracts.
 * Deterministic, explainable scoring. Scores are 0–100 prioritization
 * signals, NOT claims about hiring outcomes.
 */

const scoreField = z.number().int().min(0).max(100);

export const MatchDecisionSchema = z.enum([
  "STRONG_MATCH",
  "GOOD_MATCH",
  "PARTIAL_MATCH",
  "LOW_MATCH",
]);

export type MatchDecision = z.infer<typeof MatchDecisionSchema>;

/**
 * Centralized scoring weights (must sum to 100). Single source of truth —
 * no magic numbers scattered through the matcher.
 */
export const MATCH_WEIGHTS = {
  skills: 40,
  role: 20,
  experience: 15,
  location: 10,
  salary: 10,
  education: 5,
} as const;

/**
 * Centralized decision thresholds (inclusive lower bounds).
 */
export const MATCH_THRESHOLDS = {
  STRONG_MATCH: 80,
  GOOD_MATCH: 65,
  PARTIAL_MATCH: 50,
} as const;

export function decisionForScore(overallScore: number): MatchDecision {
  if (overallScore >= MATCH_THRESHOLDS.STRONG_MATCH) return "STRONG_MATCH";
  if (overallScore >= MATCH_THRESHOLDS.GOOD_MATCH) return "GOOD_MATCH";
  if (overallScore >= MATCH_THRESHOLDS.PARTIAL_MATCH) return "PARTIAL_MATCH";
  return "LOW_MATCH";
}

/** Domain-level candidate representation. The matcher consumes this, never Prisma. */
export const CandidateProjectSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string(),
  technologies: z.array(z.string()).default([]),
  role: z.string().optional().nullable(),
});

export type CandidateProject = z.infer<typeof CandidateProjectSchema>;

export const CandidateSnapshotSchema = z.object({
  targetRoles: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  experienceYears: z.number().nonnegative().optional().nullable(),
  preferredLocations: z.array(z.string()).default([]),
  remotePreference: z.enum(["REMOTE", "HYBRID", "ONSITE", "ANY"]).default("ANY"),
  minimumSalary: z.number().nonnegative().optional().nullable(),
  preferredCurrency: z.string().default("USD"),
  education: z.array(z.string()).default([]),
  projects: z.array(CandidateProjectSchema).default([]),
});

export type CandidateSnapshot = z.infer<typeof CandidateSnapshotSchema>;

/** Domain-level job representation for the matcher. Never the DB model. */
export const JobSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  description: z.string(),
  employmentType: z.string().optional().nullable(),
  remote: z.boolean().default(false),
  location: z.string().optional().nullable(),
  salaryMin: z.number().nonnegative().optional().nullable(),
  salaryMax: z.number().nonnegative().optional().nullable(),
  salaryCurrency: z.string().default("USD"),
});

export type JobSnapshot = z.infer<typeof JobSnapshotSchema>;

export const MatchScoreBreakdownSchema = z.object({
  skillScore: scoreField,
  roleScore: scoreField,
  experienceScore: scoreField,
  locationScore: scoreField,
  salaryScore: scoreField,
  educationScore: scoreField,
});

export type MatchScoreBreakdown = z.infer<typeof MatchScoreBreakdownSchema>;

export const MatchResultSchema = z.object({
  jobId: z.string().min(1),
  overallScore: scoreField,
  decision: MatchDecisionSchema,
  breakdown: MatchScoreBreakdownSchema,
  matchedSkills: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  matchedRequirements: z.array(z.string()).default([]),
  missingRequirements: z.array(z.string()).default([]),
  uncertainRequirements: z.array(z.string()).default([]),
  reasons: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  // Phase 5 (optional): present only when semantic/hybrid matching ran.
  // Raw embedding vectors are NEVER exposed here.
  semanticScore: scoreField.optional(),
  matchMode: z
    .enum(["deterministic", "semantic", "hybrid", "deterministic_fallback"])
    .default("deterministic"),
  semanticProvider: z.string().max(100).optional(),
  semanticModel: z.string().max(100).optional(),
});

export type MatchResult = z.infer<typeof MatchResultSchema>;

/**
 * Phase 5 — match mode selection (server-side configuration).
 * "deterministic" is the default: no external calls, no credentials needed.
 */
export const MatchModeSchema = z.enum(["deterministic", "semantic", "hybrid"]);

export type MatchMode = z.infer<typeof MatchModeSchema>;

/**
 * Centralized hybrid weights (must sum to 100). Rationale: the deterministic
 * engine stays the primary signal (proven, explainable, fact-grounded);
 * semantic similarity contributes a minority signal for related roles and
 * technologies the skill dictionary misses. Guardrails (§15–16 of Phase 5)
 * additionally cap hybrid scores on hard deterministic mismatches.
 */
export const HYBRID_WEIGHTS = {
  deterministic: 70,
  semantic: 30,
} as const;

/** Optional per-request mode override (validated closed enum — no arbitrary providers). */
export const MatchRequestModeSchema = z.object({
  mode: MatchModeSchema.optional(),
});

export type MatchRequestMode = z.infer<typeof MatchRequestModeSchema>;

/** POST /api/matches/run — hard-capped batch size. */
export const RunMatchesSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  mode: MatchModeSchema.optional(),
  // Phase 10A: async mode enqueues a job-matching job (202 Accepted).
  async: z.boolean().default(false),
});

export type RunMatchesInput = z.infer<typeof RunMatchesSchema>;

/** Service-layer input (pre-default application): `limit`/`async` optional. */
export type RunMatchesRequest = z.input<typeof RunMatchesSchema>;

/** GET /api/matches filters. */
export const MatchesQuerySchema = z.object({
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  decision: MatchDecisionSchema.optional(),
});

export type MatchesQuery = z.infer<typeof MatchesQuerySchema>;
