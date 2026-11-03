import {
  HYBRID_WEIGHTS,
  decisionForScore,
  type CandidateSnapshot,
  type JobSnapshot,
  type MatchResult,
} from "@jobcopilot/shared";
import {
  buildCandidateText,
  buildJobText,
  cosineSimilarity,
  cosineToScore,
  embedWithCache,
  getEmbeddingProvider,
  type EmbeddingProvider,
} from "./embeddings.js";
import {
  DeterministicMatchProvider,
  type MatchProvider,
} from "./job-matcher.js";

/**
 * Phase 5 — semantic and hybrid match providers.
 *
 * - Semantic mode: deterministic breakdown/explanations are KEPT (exact
 *   matching stays a strong signal); the overall score comes from
 *   embedding cosine similarity, guarded by deterministic hard mismatches.
 * - Hybrid mode: 70% deterministic + 30% semantic (centralized
 *   HYBRID_WEIGHTS, overridable via HYBRID_* env vars), same guardrails.
 * - Hard facts are never fabricated: matched/missing requirements always
 *   come from the deterministic engine; semantic similarity only moves
 *   the number within guardrail caps.
 */

const deterministic = new DeterministicMatchProvider();

export interface SemanticSignal {
  /** 0–100, or null when similarity is undefined (e.g. zero vector). */
  score: number | null;
  providerId: string;
  model: string;
}

export async function computeSemanticSignal(
  candidate: CandidateSnapshot,
  job: JobSnapshot,
  provider?: EmbeddingProvider,
): Promise<SemanticSignal> {
  const active = provider ?? getEmbeddingProvider();
  const [candidateVec, jobVec] = await Promise.all([
    embedWithCache(active, buildCandidateText(candidate)),
    embedWithCache(active, buildJobText(job)),
  ]);
  const similarity = cosineSimilarity(candidateVec.vector, jobVec.vector);
  return {
    score: similarity === null ? null : cosineToScore(similarity),
    providerId: active.id,
    model: active.model,
  };
}

/**
 * Hard mismatches semantic similarity must never override: an explicitly
 * parsed zero role overlap, an unmet stated experience requirement, or an
 * onsite-vs-remote clash. Unknowns (nulls) are NOT hard mismatches.
 */
export function hasHardMismatch(deterministicResult: MatchResult): boolean {
  const b = deterministicResult.breakdown;
  return b.roleScore === 0 || b.experienceScore === 0 || b.locationScore <= 20;
}

/** Cap guarded scores inside the LOW band (below PARTIAL threshold). */
const GUARDRAIL_CAP = 49;

function applyGuardrails(overall: number, det: MatchResult): number {
  if (hasHardMismatch(det)) return Math.min(overall, GUARDRAIL_CAP);
  return overall;
}

export function getHybridWeights(): { deterministic: number; semantic: number } {
  const parse = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined || raw === "") return fallback;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 100 ? n : fallback;
  };
  const det = parse(process.env.HYBRID_DETERMINISTIC_WEIGHT, HYBRID_WEIGHTS.deterministic);
  const sem = parse(process.env.HYBRID_SEMANTIC_WEIGHT, HYBRID_WEIGHTS.semantic);
  if (det + sem === 0) return { ...HYBRID_WEIGHTS };
  return { deterministic: det, semantic: sem };
}

const SEMANTIC_REASON =
  "Semantic similarity considers related roles and technologies beyond exact skill names.";

export class SemanticMatchProvider implements MatchProvider {
  readonly id = "semantic";

  async match(candidate: CandidateSnapshot, job: JobSnapshot): Promise<MatchResult> {
    const det = deterministic.match(candidate, job) as MatchResult;
    const signal = await computeSemanticSignal(candidate, job);
    if (signal.score === null) {
      // Undefined similarity: honest fallback handled by the caller
      // (matchMode deterministic_fallback). Never invent a score.
      throw new Error("Embedding similarity undefined for this pair");
    }
    const overall = applyGuardrails(signal.score, det);
    return {
      ...det,
      overallScore: overall,
      decision: decisionForScore(overall),
      semanticScore: signal.score,
      matchMode: "semantic",
      semanticProvider: signal.providerId,
      semanticModel: signal.model,
      reasons: [...det.reasons, SEMANTIC_REASON],
    };
  }
}

export class HybridMatchProvider implements MatchProvider {
  readonly id = "hybrid";

  async match(candidate: CandidateSnapshot, job: JobSnapshot): Promise<MatchResult> {
    const det = deterministic.match(candidate, job) as MatchResult;
    const signal = await computeSemanticSignal(candidate, job);
    if (signal.score === null) {
      throw new Error("Embedding similarity undefined for this pair");
    }
    const weights = getHybridWeights();
    const total = weights.deterministic + weights.semantic;
    const blended = Math.round(
      (det.overallScore * weights.deterministic + signal.score * weights.semantic) / total,
    );
    const overall = applyGuardrails(blended, det);
    return {
      ...det,
      overallScore: overall,
      decision: decisionForScore(overall),
      semanticScore: signal.score,
      matchMode: "hybrid",
      semanticProvider: signal.providerId,
      semanticModel: signal.model,
      reasons: [
        ...det.reasons,
        `Combined deterministic (${weights.deterministic}%) and semantic (${weights.semantic}%) signals. ${SEMANTIC_REASON}`,
      ],
    };
  }
}
