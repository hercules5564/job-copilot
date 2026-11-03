/**
 * Phase 15 — vendor-neutral text-generation provider abstraction.
 * Server-side only. Deliberately separate from the embedding provider
 * (embeddings.ts): vectors and text generation have different contracts,
 * limits, and failure modes. API keys never leave the server process
 * (never returned, never logged, never persisted).
 */

// ---- provider interface (vendor-neutral) ----------------------------------

export interface GenerationRequest {
  /** Fixed safety/fact-grounding instructions (never candidate data). */
  systemPrompt: string;
  /** Bounded candidate/job/match context sections (data, never instructions). */
  userPrompt: string;
  /** Maximum completion tokens (cost control). */
  maxOutputTokens: number;
}

export interface GenerationResult {
  /** Raw model text (expected JSON — parsed + Zod-validated by the caller). */
  text: string;
}

export interface TextGenerationProvider {
  /** Stable id, e.g. "openai-compatible" or "deterministic-test". */
  readonly id: string;
  /** Model name used for draft provenance records. */
  readonly model: string;
  /** Generate structured text. Must not retain caller data. */
  generateText(request: GenerationRequest): Promise<GenerationResult>;
}

// ---- OpenAI-compatible HTTP provider (only when configured) ---------------
// Speaks the standard /chat/completions contract (response_format json_object)
// used by OpenAI and OpenAI-compatible gateways. Never constructed without
// an API key (see getGenerationProvider).

interface HttpGenerationDeps {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  fetchImpl?: typeof fetch;
}

export class OpenAICompatibleGenerationProvider implements TextGenerationProvider {
  readonly id = "openai-compatible";
  readonly model: string;
  private readonly deps: HttpGenerationDeps;

  constructor(deps: HttpGenerationDeps) {
    this.deps = deps;
    this.model = deps.model;
  }

  async generateText(request: GenerationRequest): Promise<GenerationResult> {
    const maxTokens = Math.min(request.maxOutputTokens, this.deps.maxOutputTokens);
    let res: Response;
    try {
      res = await (this.deps.fetchImpl ?? fetch)(
        `${this.deps.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.deps.apiKey}`,
          },
          body: JSON.stringify({
            model: this.deps.model,
            messages: [
              { role: "system", content: request.systemPrompt },
              { role: "user", content: request.userPrompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
            max_tokens: maxTokens,
          }),
          signal: AbortSignal.timeout(this.deps.timeoutMs),
        },
      );
    } catch (err) {
      throw new GenerationError(
        err instanceof Error && err.name === "TimeoutError"
          ? "Generation request timed out"
          : "Generation provider unreachable",
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new GenerationError("Generation provider authentication failed");
    }
    if (res.status === 429) {
      throw new GenerationError("Generation provider rate limit exceeded");
    }
    if (!res.ok) {
      throw new GenerationError("Generation provider request failed");
    }
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new GenerationError("Generation provider returned malformed data");
    }
    const text = (payload as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new GenerationError("Generation provider returned malformed data");
    }
    return { text };
  }
}

// ---- deterministic test provider (test-only, never production) ------------
// No network. Returns schema-shaped deterministic output derived from the
// request's fact inventory so tests exercise the full workflow (context →
// generate → validate → persist → review → approve) without an LLM.
// Impossible to activate in production: the factory refuses it there.

export class DeterministicTestGenerationProvider implements TextGenerationProvider {
  readonly id = "deterministic-test";
  readonly model = "test-fixture-v1";

  constructor() {
    if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
      throw new GenerationConfigError("The test generation provider is unavailable in production");
    }
  }

  async generateText(request: GenerationRequest): Promise<GenerationResult> {
    // Echo the first inventory fact ids found in the prompt so provenance
    // validation passes deterministically. Answers stay NEEDS_USER_INPUT
    // (the test provider never claims knowledge it was not given).
    const ids = [...request.userPrompt.matchAll(/^fact ([a-z0-9:._-]+) \|/gim)]
      .map((m) => m[1])
      .slice(0, 5);
    const pick = ids.length > 0 ? ids : [];
    const wantsSummary = /INCLUDE_SUMMARY:\s*yes/i.test(request.userPrompt);
    const wantsCover = /INCLUDE_COVER_LETTER:\s*yes/i.test(request.userPrompt);
    const questions = [...request.userPrompt.matchAll(/^question: (.+)$/gim)].map((m) => m[1].slice(0, 500));
    const content = {
      summary: wantsSummary
        ? {
            text: "Test candidate summary grounded in the provided facts.",
            usedFactIds: pick.slice(0, 2),
            warnings: [],
          }
        : null,
      coverLetter: wantsCover
        ? {
            text: "Test cover letter grounded in the provided facts.",
            usedFactIds: pick.slice(0, 2),
            warnings: [],
          }
        : null,
      answers: questions.map((question) => ({
        question,
        answer: "",
        status: "NEEDS_USER_INPUT",
        usedFactIds: [],
        warnings: ["Test provider does not answer application questions; user input required."],
      })),
      selectedProjects: [],
      warnings: ["Generated by the deterministic test provider for workflow tests."],
    };
    return { text: JSON.stringify(content) };
  }
}

// ---- factory (env-driven, read at call time for testability) --------------

/** Provider failure at generation time (safe message, no secrets/payloads). */
export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

/** Misconfiguration (missing keys, unknown provider kind). */
export class GenerationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationConfigError";
  }
}

/** Provider requested but none configured. Callers map this to a clear 409. */
export class GenerationNotConfiguredError extends Error {
  constructor() {
    super("AI generation is not configured. Set AI_GENERATION_PROVIDER and provider credentials.");
    this.name = "GenerationNotConfiguredError";
  }
}

export function generationTimeoutMs(): number {
  const raw = Number(process.env.AI_LLM_TIMEOUT_MS ?? 30000);
  if (!Number.isFinite(raw)) return 30000;
  return Math.min(120000, Math.max(5000, Math.floor(raw)));
}

export function generationMaxOutputTokens(): number {
  const raw = Number(process.env.AI_LLM_MAX_OUTPUT_TOKENS ?? 1500);
  if (!Number.isFinite(raw)) return 1500;
  return Math.min(4000, Math.max(200, Math.floor(raw)));
}

/** Non-throwing configuration probe for the status endpoint (no secrets). */
export function describeGenerationConfig(): { configured: boolean; provider: string | null } {
  const kind = (process.env.AI_GENERATION_PROVIDER ?? "off").toLowerCase().trim();
  if (kind === "off" || kind === "" || kind === "disabled") return { configured: false, provider: null };
  if (kind === "openai") {
    return process.env.AI_LLM_API_KEY ? { configured: true, provider: "openai-compatible" } : { configured: false, provider: null };
  }
  if (kind === "test") {
    const prod = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
    return prod ? { configured: false, provider: null } : { configured: true, provider: "deterministic-test" };
  }
  return { configured: false, provider: null };
}

export function getGenerationProvider(): TextGenerationProvider {
  const kind = (process.env.AI_GENERATION_PROVIDER ?? "off").toLowerCase().trim();
  if (kind === "off" || kind === "" || kind === "disabled") {
    throw new GenerationNotConfiguredError();
  }
  if (kind === "openai") {
    const apiKey = process.env.AI_LLM_API_KEY ?? "";
    if (!apiKey) {
      throw new GenerationConfigError("AI_GENERATION_PROVIDER=openai requires AI_LLM_API_KEY.");
    }
    return new OpenAICompatibleGenerationProvider({
      baseUrl: process.env.AI_LLM_BASE_URL ?? "https://api.openai.com/v1",
      apiKey,
      model: process.env.AI_LLM_MODEL ?? "gpt-4o-mini",
      timeoutMs: generationTimeoutMs(),
      maxOutputTokens: generationMaxOutputTokens(),
      // NOTE: fetchImpl is constructor-injectable for tests; production
      // always uses the global fetch above (never overridden by callers).
    });
  }
  if (kind === "test") {
    return new DeterministicTestGenerationProvider();
  }
  throw new GenerationConfigError(`Unknown AI_GENERATION_PROVIDER: "${kind}"`);
}
