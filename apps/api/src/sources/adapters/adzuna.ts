import type {
  JobSearchParamsInput,
  JobSourceInfo,
  RawJob,
} from "@jobcopilot/shared";
import { HttpError } from "../../services/errors.js";
import type { JobSourceAdapter } from "../types.js";

const API_BASE = "https://api.adzuna.com/v1/api/jobs";

interface AdzunaResult {
  id?: unknown;
  title?: unknown;
  company?: { display_name?: unknown };
  location?: { display_name?: unknown };
  description?: unknown;
  redirect_url?: unknown;
  created?: unknown;
  salary_min?: unknown;
  salary_max?: unknown;
  contract_time?: unknown;
  contract_type?: unknown;
}

/**
 * Adzuna job search API (free tier requires app id + key).
 * One bounded request per run; fixed country endpoint template.
 * Docs: https://developer.adzuna.com/overview
 */
export class AdzunaAdapter implements JobSourceAdapter {
  readonly id = "adzuna";
  readonly name = "Adzuna (public job search API)";
  readonly mock = false;

  private readonly appId: string;
  private readonly appKey: string;
  private readonly country: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    opts: {
      appId?: string;
      appKey?: string;
      country?: string;
      timeoutMs?: number;
      fetchImpl?: typeof fetch;
    } = {},
  ) {
    this.appId = (opts.appId ?? process.env.ADZUNA_APP_ID ?? "").trim();
    this.appKey = (opts.appKey ?? process.env.ADZUNA_APP_KEY ?? "").trim();
    const rawCountry = (opts.country ?? process.env.ADZUNA_COUNTRY ?? "us")
      .trim()
      .toLowerCase();
    this.country = /^[a-z]{2}$/.test(rawCountry) ? rawCountry : "us";
    this.timeoutMs =
      opts.timeoutMs ?? Number(process.env.JOB_SOURCE_TIMEOUT_MS ?? 10000);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private configured(): boolean {
    return this.appId.length > 0 && this.appKey.length > 0;
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
        "Adzuna is not configured (set ADZUNA_APP_ID and ADZUNA_APP_KEY)",
      );
    }
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const url = new URL(`${API_BASE}/${this.country}/search/1`);
    url.searchParams.set("app_id", this.appId);
    url.searchParams.set("app_key", this.appKey);
    url.searchParams.set("results_per_page", String(limit));
    url.searchParams.set("content-type", "application/json");
    if (params.query) url.searchParams.set("what", params.query);
    if (params.location) url.searchParams.set("where", params.location);

    let payload: unknown;
    try {
      const res = await this.fetchImpl(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`transient: Adzuna API responded with HTTP ${res.status}`);
      }
      if (!res.ok) throw new HttpError(400, "Adzuna API rejected the request");
      payload = await res.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const reason =
        err instanceof Error && err.name === "TimeoutError"
          ? "transient: Adzuna request timed out"
          : err instanceof Error && err.message.startsWith("transient: ")
            ? err.message
            : "Adzuna request failed";
      throw new Error(reason);
    }

    const items = Array.isArray((payload as { results?: unknown })?.results)
      ? ((payload as { results: AdzunaResult[] }).results ?? [])
      : [];
    const q = (params.query ?? "").toLowerCase().trim();
    const loc = (params.location ?? "").toLowerCase().trim();
    const emp = (params.employmentType ?? "").toLowerCase().trim();
    const out: RawJob[] = [];

    for (const item of items) {
      if (out.length >= limit) break;
      const title = toText(item.title);
      const company = toText(item.company?.display_name);
      const description = htmlToText(toText(item.description));
      const externalId = toId(item.id);
      if (!title || !company || !description || !externalId) continue;

      const location = toText(item.location?.display_name) || null;
      const employmentType =
        toText(item.contract_time) || toText(item.contract_type) || null;
      const haystack = `${title} ${location ?? ""} ${description}`.toLowerCase();
      const remote = haystack.includes("remote");

      if (q && !haystack.includes(q)) continue;
      if (loc && !(location ?? "").toLowerCase().includes(loc)) continue;
      if (params.remote === true && !remote) continue;
      if (params.remote === false && remote) continue;
      if (emp && !(employmentType ?? "").toLowerCase().includes(emp)) continue;

      const link = toText(item.redirect_url);
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
        salaryMin: toNumber(item.salary_min),
        salaryMax: toNumber(item.salary_max),
        salaryCurrency: null,
        description,
        postedAt: toText(item.created) || null,
        metadata: { country: this.country },
      });
    }
    return out;
  }
}

function toText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toId(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
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
