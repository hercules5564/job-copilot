import type { JobSearchParamsInput,
  JobSourceInfo,
  RawJob,
} from "@jobcopilot/shared";
import { HttpError } from "../../services/errors.js";
import type { JobSourceAdapter } from "../types.js";

/**
 * Phase 10B — second permitted production source: Greenhouse Job Board API.
 *
 * Why permitted (verified live 2026-09-24): free public JSON API designed
 * for programmatic job-board embeds (no key, no auth, no login, no browser
 * automation). List + detail endpoints return structured data; verified
 * against two live boards (airbnb: 160 jobs, stripe: OK) with shape
 * {id, title, company_name, absolute_url, location.name, updated_at,
 * first_published, departments[], offices[], metadata[]}.
 *
 * Bounds per search: 1 list request + at most `limit` detail requests,
 * sequential with a politeness delay, fixed timeouts. Board tokens are
 * charset-validated and interpolated into a FIXED endpoint template —
 * never treated as URLs (SSRF guard). HTTP 429/5xx/timeouts are transient
 * (retryable); 4xx is permanent (bad board — never retried blindly).
 */

const API_BASE = "https://boards-api.greenhouse.io/v1/boards";

export const GREENHOUSE_TIMEOUT_MS = 10000;
const DETAIL_TIMEOUT_MS = 8000;
const POLITENESS_DELAY_MS = 250;
const MAX_DESCRIPTION_CHARS = 8000;

interface GreenhouseListJob {
  id?: unknown;
  title?: unknown;
  company_name?: unknown;
  absolute_url?: unknown;
  location?: { name?: unknown };
  updated_at?: unknown;
  first_published?: unknown;
  departments?: { name?: unknown }[];
  metadata?: { name?: unknown; value?: unknown }[];
}

interface GreenhouseDetailJob extends GreenhouseListJob {
  content?: unknown;
  offices?: { name?: unknown; location?: unknown }[];
}

function toText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isHttpUrl(v: string): boolean {
  return v.startsWith("https://") || v.startsWith("http://");
}

/** Strip HTML to plain text (bounded). Descriptions are data, never markup. */
export function greenhouseHtmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, " ");
  const withoutTags = withoutScripts.replace(/<[^>]*>/g, " ");
  const decoded = withoutTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : " ";
    });
  return decoded.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION_CHARS);
}

function namesOf(items: { name?: unknown }[] | undefined): string[] {
  if (!Array.isArray(items)) return [];
  return items.map((d) => toText(d.name).trim()).filter(Boolean);
}

function workplaceMetadata(item: GreenhouseListJob): string {
  if (!Array.isArray(item.metadata)) return "";
  for (const m of item.metadata) {
    if (/workplace/i.test(toText(m.name))) return toText(m.value);
  }
  return "";
}

export class GreenhouseAdapter implements JobSourceAdapter {
  readonly id = "greenhouse";
  readonly name = "Greenhouse (public Job Board API)";
  readonly mock = false;

  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultBoards: string[];

  constructor(
    opts: { timeoutMs?: number; fetchImpl?: typeof fetch; boards?: string[] } = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? GREENHOUSE_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.defaultBoards = (opts.boards ?? []).filter((b) => /^[a-z0-9][a-z0-9-]*$/.test(b)).slice(0, 5);
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
        // 1 list + at most `limit` detail fetches per search.
        maxRequestsPerRun: 21,
        maxResults: 50,
      },
    };
  }

  private boardFor(params: JobSearchParamsInput): string | null {
    const board = (params.board ?? "").trim().toLowerCase();
    if (board) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(board) || board.length > 64) {
        throw new HttpError(400, "Invalid job board identifier");
      }
      return board;
    }
    return this.defaultBoards[0] ?? null;
  }

  private async fetchJson(url: string, timeoutMs: number): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "JobPilot/1.0 (+job ingestion; bounded board requests)",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason =
        err instanceof Error && err.name === "TimeoutError"
          ? "Greenhouse request timed out"
          : "Greenhouse request failed";
      throw new Error(`transient: ${reason}`);
    }
    if (res.status === 429 || res.status >= 500) {
      throw new Error(`transient: Greenhouse API responded with HTTP ${res.status}`);
    }
    if (!res.ok) {
      throw new HttpError(400, "Greenhouse board not found or request rejected");
    }
    try {
      return await res.json();
    } catch {
      throw new HttpError(400, "Greenhouse response was malformed");
    }
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async search(params: JobSearchParamsInput): Promise<RawJob[]> {
    const board = this.boardFor(params);
    if (!board) return []; // no board configured: run nothing, never guess
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);

    const payload = await this.fetchJson(`${API_BASE}/${board}/jobs?content=false`, this.timeoutMs);
    const items: GreenhouseListJob[] = Array.isArray((payload as { jobs?: unknown })?.jobs)
      ? ((payload as { jobs: GreenhouseListJob[] }).jobs ?? [])
      : [];

    const q = (params.query ?? "").toLowerCase().trim();
    const loc = (params.location ?? "").toLowerCase().trim();

    const picked: GreenhouseListJob[] = [];
    for (const item of items) {
      if (picked.length >= limit) break;
      const title = toText(item.title).trim();
      const company = toText(item.company_name).trim() || board;
      const id = item.id;
      if (!title || company === "" || (typeof id !== "number" && typeof id !== "string")) continue;
      const location = toText(item.location?.name).trim();
      const hay = `${title} ${company}`.toLowerCase();
      if (q && !hay.includes(q) && !namesOf(item.departments).join(" ").toLowerCase().includes(q)) continue;
      if (loc && !location.toLowerCase().includes(loc)) continue;
      const remote = /remote/i.test(location) || /^remote$/i.test(workplaceMetadata(item));
      if (params.remote === true && !remote) continue;
      if (params.remote === false && remote) continue;
      picked.push(item);
    }

    const out: RawJob[] = [];
    for (const item of picked) {
      const id = String(item.id);
      let detail: GreenhouseDetailJob | null = null;
      try {
        await GreenhouseAdapter.delay(POLITENESS_DELAY_MS);
        detail = (await this.fetchJson(
          `${API_BASE}/${board}/jobs/${encodeURIComponent(id)}?questions=false`,
          DETAIL_TIMEOUT_MS,
        )) as GreenhouseDetailJob;
      } catch {
        continue; // detail failed: skip the record, never invent content
      }
      const description = greenhouseHtmlToText(toText(detail?.content));
      if (!description) continue; // descriptions required downstream: skip, never invent
      const jobUrl = toText(detail?.absolute_url ?? item.absolute_url);
      out.push({
        externalId: `${board}:${id}`,
        source: this.id,
        title: toText(item.title).trim(),
        company: toText(item.company_name).trim() || board,
        companyUrl: null,
        jobUrl: isHttpUrl(jobUrl) ? jobUrl : null,
        location: toText(item.location?.name).trim() || null,
        remote: /remote/i.test(toText(item.location?.name)) || /^remote$/i.test(workplaceMetadata(item)),
        employmentType: null, // departments are org units, not types — never invent
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        description,
        postedAt: toText(item.first_published) || toText(item.updated_at) || null,
        metadata: {
          board,
          departments: namesOf(detail?.departments ?? item.departments).slice(0, 10),
          offices: namesOf(detail?.offices).slice(0, 10),
        },
      });
    }
    return out;
  }
}
