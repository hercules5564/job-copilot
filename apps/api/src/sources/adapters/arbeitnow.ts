import type {
  JobSearchParamsInput,
  JobSourceInfo,
  RawJob,
} from "@jobcopilot/shared";
import { HttpError } from "../../services/errors.js";
import type { JobSourceAdapter } from "../types.js";
const DEFAULT_ENDPOINT =
  process.env.ARBEITNOW_API_URL ?? "https://www.arbeitnow.com/api/job-board-api";

/** Subset of the public Arbeitnow Job Board API response we consume. */
interface ArbeitnowApiJob {
  slug?: unknown;
  company_name?: unknown;
  title?: unknown;
  description?: unknown;
  remote?: unknown;
  url?: unknown;
  location?: unknown;
  job_types?: unknown;
  created_at?: unknown;
}

/**
 * First permitted production source: Arbeitnow Job Board API.
 *
 * Why permitted: free public JSON API explicitly published for programmatic
 * job-board use (no key, no auth, no login, no browser automation, no
 * anti-bot bypass). Honors published usage: single bounded request per
 * ingestion run, 10s timeout, no pagination crawling.
 * Docs: https://www.arbeitnow.com/job-board-api
 */
export class ArbeitnowAdapter implements JobSourceAdapter {
  readonly id = "arbeitnow";
  readonly name = "Arbeitnow (public Job Board API)";
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
        // The public endpoint returns the full board; filtering is
        // applied client-side inside the adapter (deterministic).
        query: true,
        location: true,
        remote: true,
        employmentType: true,
        pagination: false,
        signals: false,
      },
      limits: {
        timeoutMs: this.timeoutMs,
        // Single bounded request per ingestion run (published usage).
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
        throw new Error(`transient: Arbeitnow API responded with HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw new HttpError(400, "Arbeitnow API rejected the request");
      }
      payload = await res.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      // Never leak endpoint internals beyond a safe category message;
      // the ingestion service records this as a structured error.
      // "transient: " prefix marks retryable transport failures.
      const reason =
        err instanceof Error && err.name === "TimeoutError"
          ? "transient: Arbeitnow request timed out"
          : err instanceof Error && err.message.startsWith("transient: ")
            ? err.message
            : "Arbeitnow request failed";
      throw new Error(reason);
    }

    const items: ArbeitnowApiJob[] = Array.isArray(
      (payload as { data?: unknown })?.data,
    )
      ? ((payload as { data: ArbeitnowApiJob[] }).data ?? [])
      : [];

    const q = (params.query ?? "").toLowerCase().trim();
    const loc = (params.location ?? "").toLowerCase().trim();
    const emp = (params.employmentType ?? "").toLowerCase().trim();

    const out: RawJob[] = [];
    for (const item of items) {
      if (out.length >= limit) break;
      const title = toText(item.title);
      const company = toText(item.company_name);
      const description = htmlToText(toText(item.description));
      const slug = toText(item.slug);
      if (!title || !company || !description || !slug) continue; // skip malformed, never invent

      const location = toText(item.location);
      const remote = item.remote === true;
      const jobTypes = Array.isArray(item.job_types)
        ? item.job_types.filter((t): t is string => typeof t === "string")
        : [];
      const employmentType = jobTypes[0] ?? null;

      if (q && !`${title} ${company} ${description}`.toLowerCase().includes(q)) {
        continue;
      }
      if (loc && !(location ?? "").toLowerCase().includes(loc)) continue;
      if (params.remote === true && !remote) continue;
      if (params.remote === false && remote) continue;
      if (
        emp &&
        !(employmentType ?? "").toLowerCase().includes(emp)
      ) {
        continue;
      }

      const jobUrl = toText(item.url);
      out.push({
        externalId: slug,
        source: this.id,
        title,
        company,
        companyUrl: null,
        jobUrl: isHttpUrl(jobUrl) ? jobUrl : null,
        location: location || null,
        remote,
        employmentType,
        salaryMin: null, // source provides no salary — never invent
        salaryMax: null,
        salaryCurrency: null,
        description,
        postedAt: toText(item.created_at) || null,
        metadata: { jobTypes },
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
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}
