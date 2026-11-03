import { createHash } from "node:crypto";
import type { CandidateSnapshot, JobSnapshot } from "@jobcopilot/shared";

/**
 * Phase 5 — embedding layer.
 * Isolated from Prisma, routes, frontend, and MatchResult. Providers only
 * turn matching-relevant text into vectors; all scoring lives in the
 * semantic matcher. No credentials are logged; vectors never leave the
 * server process (never returned by the API).
 */

// ---- provider interface (vendor-neutral) --------------------------------
// A future LLM analysis provider can sit beside this interface without
// touching the matcher, persistence, or contracts.

export interface EmbeddingProvider {
  /** Stable id, e.g. "local-hash" or "openai-compatible". */
  readonly id: string;
  /** Model name used for cache invalidation. */
  readonly model: string;
  /** Embed matching-relevant text. Must not retain caller data. */
  embed(text: string): Promise<number[]>;
}

// ---- hashing -------------------------------------------------------------

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ---- cosine similarity (pure) --------------------------------------------

/**
 * Cosine similarity in [-1, 1], or null when undefined (either vector is
 * all zeros). Throws on dimension mismatch (caller bug, fail fast).
 * Never NaN/Infinity: zero-norm guarded, finite inputs validated.
 */
export function cosineSimilarity(a: number[], b: number[]): number | null {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("Embedding contains non-finite values");
    }
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return null;
  const sim = dot / (Math.sqrt(na) * Math.sqrt(nb));
  if (!Number.isFinite(sim)) return null;
  return Math.max(-1, Math.min(1, sim));
}

/**
 * Provider-agnostic conversion to a 0–100 score. We do NOT assume a
 * specific provider range: cosine is clamped to [-1, 1] and mapped
 * linearly, so identical → 100, orthogonal → 50 (neutral), opposite → 0.
 */
export function cosineToScore(similarity: number): number {
  const clamped = Math.max(-1, Math.min(1, similarity));
  return Math.round(((clamped + 1) / 2) * 100);
}

// ---- semantic text builders (privacy-minimal, length-capped) -------------

const MAX_TEXT_LENGTH = 4000;

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Candidate text for embeddings: roles, skills, experience, education,
 * project names/descriptions/technologies. Excludes user IDs, emails,
 * tokens, and unrelated data.
 */
export function buildCandidateText(candidate: CandidateSnapshot): string {
  const parts = [
    `Roles: ${candidate.targetRoles.join(", ")}`,
    `Skills: ${candidate.skills.join(", ")}`,
    candidate.experienceYears !== null && candidate.experienceYears !== undefined
      ? `Experience: ${candidate.experienceYears} years`
      : "",
    `Education: ${candidate.education.join("; ")}`,
    ...candidate.projects.slice(0, 10).map((p) =>
      `Project ${p.name}: ${p.description} [${p.technologies.join(", ")}]`,
    ),
  ].filter(Boolean);
  return clean(parts.join("\n")).slice(0, MAX_TEXT_LENGTH);
}

/** Job text for embeddings: title, company, description, work facts. */
export function buildJobText(job: JobSnapshot): string {
  const parts = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Description: ${job.description}`,
    job.employmentType ? `Type: ${job.employmentType}` : "",
    job.remote ? "Remote: yes" : "",
    job.location ? `Location: ${job.location}` : "",
  ].filter(Boolean);
  return clean(parts.join("\n")).slice(0, MAX_TEXT_LENGTH);
}

// ---- local offline provider (default, no network, no credentials) --------

/**
 * Deterministic token-hash projection: each token hashes to an index in a
 * fixed-dimension vector (term frequency accumulated), L2-normalized.
 * Captures token-overlap similarity beyond exact skill names with zero
 * external dependencies. Honest id/model labeling ("local-hash").
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly id = "local-hash";
  readonly model = "token-hash-v1";
  private readonly dimensions: number;

  constructor(dimensions = 256) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const vector = new Array<number>(this.dimensions).fill(0);
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length >= 2);
    for (const token of tokens) {
      const digest = createHash("sha256").update(token, "utf8").digest();
      const index = digest.readUInt32BE(0) % this.dimensions;
      vector[index] += 1;
    }
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vector;
    return vector.map((v) => v / norm);
  }
}

// ---- OpenAI-compatible HTTP provider (only when configured) --------------
// Speaks the standard {model, input} -> {data:[{embedding}]} contract used
// by OpenAI and OpenAI-compatible gateways. Never constructed without an
// API key (see getEmbeddingProvider).

interface HttpEmbeddingDeps {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly id = "openai-compatible";
  readonly model: string;
  private readonly deps: HttpEmbeddingDeps;

  constructor(deps: HttpEmbeddingDeps) {
    this.deps = deps;
    this.model = deps.model;
  }

  async embed(text: string): Promise<number[]> {
    const input = text.slice(0, MAX_TEXT_LENGTH);
    let res: Response;
    try {
      res = await (this.deps.fetchImpl ?? fetch)(
        `${this.deps.baseUrl.replace(/\/$/, "")}/embeddings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.deps.apiKey}`,
          },
          body: JSON.stringify({ model: this.deps.model, input }),
          signal: AbortSignal.timeout(this.deps.timeoutMs),
        },
      );
    } catch (err) {
      throw new Error(
        err instanceof Error && err.name === "TimeoutError"
          ? "Embedding request timed out"
          : "Embedding provider unreachable",
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("Embedding provider authentication failed");
    }
    if (res.status === 429) {
      throw new Error("Embedding provider rate limit exceeded");
    }
    if (!res.ok) {
      throw new Error("Embedding provider request failed");
    }
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new Error("Embedding provider returned malformed data");
    }
    const vector = (payload as { data?: { embedding?: unknown }[] })?.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length === 0 || !vector.every(Number.isFinite)) {
      throw new Error("Embedding provider returned malformed data");
    }
    return vector as number[];
  }
}

// ---- factory (env-driven, read at call time for testability) -------------

export class EmbeddingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingConfigError";
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  const kind = (process.env.EMBEDDING_PROVIDER ?? "local").toLowerCase();
  if (kind === "openai") {
    const apiKey = process.env.AI_API_KEY ?? "";
    if (!apiKey) {
      throw new EmbeddingConfigError(
        "EMBEDDING_PROVIDER=openai requires AI_API_KEY. Falling back is handled by the caller.",
      );
    }
    return new OpenAICompatibleEmbeddingProvider({
      baseUrl: process.env.AI_EMBEDDING_BASE_URL ?? "https://api.openai.com/v1",
      apiKey,
      model: process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      timeoutMs: Number(process.env.AI_EMBEDDING_TIMEOUT_MS ?? 15000),
    });
  }
  if (kind === "local") return new LocalHashEmbeddingProvider();
  throw new EmbeddingConfigError(`Unknown EMBEDDING_PROVIDER: "${kind}"`);
}

// ---- cache (provider + model + text hash) --------------------------------
// Regeneration is skipped when text, provider, and model are unchanged.
// In-memory LRU (bounded, per-process): no vector infrastructure, no new
// tables, batch runs reuse job/candidate vectors without duplicate work.

const MAX_CACHE_ENTRIES = 500;

class EmbeddingCache {
  private readonly entries = new Map<string, number[]>();

  key(providerId: string, model: string, text: string): string {
    return `${providerId}:${model}:${sha256Hex(text)}`;
  }

  get(providerId: string, model: string, text: string): number[] | undefined {
    const value = this.entries.get(this.key(providerId, model, text));
    if (value) {
      // Refresh LRU position.
      this.entries.delete(this.key(providerId, model, text));
      this.entries.set(this.key(providerId, model, text), value);
    }
    return value;
  }

  set(providerId: string, model: string, text: string, vector: number[]): void {
    const key = this.key(providerId, model, text);
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, vector);
    while (this.entries.size > MAX_CACHE_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const embeddingCache = new EmbeddingCache();

/** Embed with cache lookup; exactly one provider call per unique text. */
export async function embedWithCache(
  provider: EmbeddingProvider,
  text: string,
): Promise<{ vector: number[]; cached: boolean }> {
  const hit = embeddingCache.get(provider.id, provider.model, text);
  if (hit) return { vector: hit, cached: true };
  const vector = await provider.embed(text);
  embeddingCache.set(provider.id, provider.model, text, vector);
  return { vector, cached: false };
}
