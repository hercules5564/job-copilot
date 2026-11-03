import type {
  JobSearchParamsInput,
  JobSourceInfo,
  RawJob,
} from "@jobcopilot/shared";
import { HttpError } from "../../services/errors.js";
import type { JobSourceAdapter } from "../types.js";

const API_BASE = "https://jooble.org/api";

interface JoobleJob {
  id?: unknown;
  title?: unknown;
  location?: unknown;
  company?: unknown;
  type?: unknown;
  link?: unknown;
  description?: unknown;
  updated?: unknown;
}

/**
 * Jooble job search API (free key required).
 * One bounded POST per run; the key is interpolated into a fixed template.
 * Docs: https://jooble.org/api/about
 */
export class JoobleAdapter implements JobSourceAdapter {
  readonly id = "jooble";
  readonly name = "Jooble (public job search API)";
  readonly mock = false;

  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    opts: { apiKey?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
  ) {
    this.apiKey = (opts.apiKey ?? process.env.JOOBLE_API_KEY ?? "").trim();
    this.timeoutMs =
      opts.timeoutMs ?? Number(process.env.JOB_SOURCE_TIMEOUT_MS ?? 10000);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private configured(): boolean {
    return /^[A-Za-z0-9_-]{1,128}$/.test(this.apiKey);
  }

  info(): JobSourceInfo {
    return {
      id: this.id,
      name: this.configured()
        ? this.name
        : `${this.name} — not configured`,
      available: this.configured(),
      mock: false,
      capabilities: {
        query: true,
        location: true,
        remote: true,
        employmentType: true,
        pagination: false,
        signals: false,
      },
      limits: {
        timeoutMs: this.timeoutMs,
        maxRequestsPerRun: 1,
        maxResults: 50,
      },
    };
  }

  async search(params: JobSearchParamsInput): Promise<RawJob[]> {
    if (!this.configured()) {
      throw new HttpError(
        400,
        "Jooble is not configured (set JOOBLE_API_KEY)",
      );
    }
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
    let payload: unknown;
    try {
      const res = await this.fetchImpl(`${API_BASE}/${this.apiKey}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keywords: params.query ?? "",
          location: params.location ?? "",
          page: "1",
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`transient: Jooble API responded with HTTP ${res.status}`);
      }
      if (!res.ok) throw new HttpError(400, "Jooble API rejected the request");
      payload = await res.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const reason =
        err instanceof Error && err.name === "TimeoutError"
          ? "transient: Jooble request timed out"
          : err instanceof Error && err.message.startsWith("transient: ")
            ? err.message
            : "Jooble request failed";
      throw new Error(reason);
    }

    const items = Array.isArray((payload as { jobs?: unknown })?.jobs)
      ? ((payload as { jobs: JoobleJob[] }).jobs ?? [])
      : [];
    const q = (params.query ?? "").toLowerCase().trim();
    const loc = (params.location ?? "").toLowerCase().trim();
    const emp = (params.employmentType ?? "").toLowerCase().trim();
    const out: RawJob[] = [];

    for (const item of items) {
      if (out.length >= limit) break;
      const title = toText(item.title);
      const company = toText(item.company);
      const description = htmlToText(toText(item.description));
      const externalId = toText(item.id);
      if (!title || !company || !description || !externalId) continue;

      const location = toText(item.location) || null;
      const employmentType = toText(item.type) || null;
      const haystack = `${title} ${location ?? ""} ${description}`.toLowerCase();
      const remote = haystack.includes("remote");

      if (q && !haystack.includes(q)) continue;
      if (loc && !(location ?? "").toLowerCase().includes(loc)) continue;
      if (params.remote === true && !remote) continue;
      if (params.remote === false && remote) continue;
      if (emp && !(employmentType ?? "").toLowerCase().includes(emp)) continue;

      const link = toText(item.link);
      out.push({
        externalId,
        source: this.id,
        title,
        company,
        companyUrl: null,
        jobUrl: isHttpUrl(link) ? link : null,
        location,
        remote,
        employmentType,
        salaryMin: null, // Jooble returns a free-text salary; never parse guesses
        salaryMax: null,
        salaryCurrency: null,
        description,
        postedAt: toText(item.updated) || null,
        metadata: {},
      });
    }
    return out;
  }
}

function toText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isHttpUrl(v: string): boolean {
  return v.startsWith("https://") || v.startsWith("http://");
}

function htmlToText(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}
