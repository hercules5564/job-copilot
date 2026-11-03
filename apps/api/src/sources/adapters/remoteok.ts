import type {
  JobSearchParamsInput,
  JobSourceInfo,
  RawJob,
} from "@jobcopilot/shared";
import { HttpError } from "../../services/errors.js";
import type { JobSourceAdapter } from "../types.js";

const DEFAULT_ENDPOINT =
  process.env.REMOTEOK_API_URL ?? "https://remoteok.com/api";

interface RemoteOkJob {
  id?: unknown;
  slug?: unknown;
  company?: unknown;
  position?: unknown;
  description?: unknown;
  location?: unknown;
  tags?: unknown;
  url?: unknown;
  apply_url?: unknown;
  date?: unknown;
  salary_min?: unknown;
  salary_max?: unknown;
  salary_currency?: unknown;
}

/**
 * RemoteOK public job board API (keyless JSON feed).
 * Single bounded request per run, fixed endpoint, client-side filtering.
 * Docs: https://remoteok.com/api
 */
export class RemoteOkAdapter implements JobSourceAdapter {
  readonly id = "remoteok";
  readonly name = "RemoteOK (public job board API)";
  readonly mock = false;

  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    opts: { endpoint?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
  ) {
    this.endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs =
      opts.timeoutMs ?? Number(process.env.JOB_SOURCE_TIMEOUT_MS ?? 10000);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  info(): JobSourceInfo {
    return {
      id: this.id,
      name: this.name,
      available: true,
      mock: false,
      capabilities: {
        query: true,
        location: true,
        remote: true,
        employmentType: false,
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
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
    let payload: unknown;
    try {
      const res = await this.fetchImpl(this.endpoint, {
        headers: {
          Accept: "application/json",
          "User-Agent": "JobPilot/1.0 (+job ingestion; single bounded request)",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`transient: RemoteOK API responded with HTTP ${res.status}`);
      }
      if (!res.ok) throw new HttpError(400, "RemoteOK API rejected the request");
      payload = await res.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const reason =
        err instanceof Error && err.name === "TimeoutError"
          ? "transient: RemoteOK request timed out"
          : err instanceof Error && err.message.startsWith("transient: ")
            ? err.message
            : "RemoteOK request failed";
      throw new Error(reason);
    }

    const items = Array.isArray(payload) ? (payload as RemoteOkJob[]) : [];
    const q = (params.query ?? "").toLowerCase().trim();
    const loc = (params.location ?? "").toLowerCase().trim();
    const out: RawJob[] = [];

    for (const item of items) {
      if (out.length >= limit) break;
      if (!item || typeof item !== "object") continue;
      const title = toText(item.position);
      const company = toText(item.company);
      const description = htmlToText(toText(item.description));
      const externalId = toText(item.slug) || toId(item.id);
      if (!title || !company || !description || !externalId) continue;

      const location = toText(item.location) || null;
      const tags = Array.isArray(item.tags)
        ? item.tags.filter((t): t is string => typeof t === "string")
        : [];
      const remote = true; // RemoteOK only lists remote roles.

      if (q && !`${title} ${company} ${description} ${tags.join(" ")}`.toLowerCase().includes(q)) continue;
      if (loc && !(location ?? "").toLowerCase().includes(loc)) continue;
      if (params.remote === false) continue;

      const url = toText(item.apply_url) || toText(item.url);
      const salaryMin = toNumber(item.salary_min);
      const salaryMax = toNumber(item.salary_max);

      out.push({
        externalId,
        source: this.id,
        title,
        company,
        companyUrl: null,
        jobUrl: isHttpUrl(url) ? url : null,
        location,
        remote,
        employmentType: null,
        salaryMin,
        salaryMax,
        salaryCurrency: toText(item.salary_currency) || null,
        description,
        postedAt: toText(item.date) || null,
        metadata: { tags },
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
