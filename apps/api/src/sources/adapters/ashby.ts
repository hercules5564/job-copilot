import type { JobSearchParamsInput,
  JobSourceInfo,
  RawJob,
} from "@jobcopilot/shared";
import { HttpError } from "../../services/errors.js";
import type { JobSourceAdapter } from "../types.js";

/**
 * Phase 14 (C5) — fourth permitted production source: Ashby Job Board API.
 *
 * Why permitted (verified live 2026-09-25): officially documented public
 * endpoint for published postings
 * (developers.ashbyhq.com/docs/public-job-posting-api — "get data for all
 * currently published Job Postings", no key, no auth). The authenticated
 * Ashby REST API (Basic-auth API keys) is never used.
 * Endpoint: GET https://api.ashbyhq.com/posting-api/job-board/{BOARD}
 * Verified live: `Ashby` returns structured jobs {id, title, location,
 * department, team, isRemote, workplaceType, employmentType,
 * descriptionPlain/descriptionHtml, publishedAt, jobUrl, isListed};
 * unknown boards 404. Board slugs are case-insensitive server-side.
 *
 * Bounds per search: ONE list request (the endpoint returns the board's
 * published postings in a single response), client-side filtering, output
 * capped at params.limit (≤ 50). Board tokens are charset-validated and
 * interpolated into a FIXED endpoint template — never treated as URLs
 * (SSRF guard). HTTP 429/5xx/timeouts are transient; 4xx is permanent.
 * Compensation is never requested (no includeCompensation flag).
 *
 * Honest gaps (never invented): the payload carries no company name, so
 * the board token is the company fallback (Greenhouse convention); no
 * salary is consumed. Postings with isListed === false are skipped —
 * Ashby marks those as direct-link-only, not for public listing.
 */

const API_BASE = "https://api.ashbyhq.com/posting-api/job-board";

export const ASHBY_TIMEOUT_MS = 10000;
const MAX_DESCRIPTION_CHARS = 8000;

interface AshbyJob {
  id?: unknown;
  title?: unknown;
  location?: unknown;
  department?: unknown;
  team?: unknown;
  isRemote?: unknown;
  workplaceType?: unknown;
  employmentType?: unknown;
  descriptionHtml?: unknown;
  descriptionPlain?: unknown;
  publishedAt?: unknown;
  jobUrl?: unknown;
  applyUrl?: unknown;
  isListed?: unknown;
}

function toText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isHttpUrl(v: string): boolean {
  return v.startsWith("https://") || v.startsWith("http://");
}

/** Strip HTML to plain text (bounded). Descriptions are data, never markup. */
export function ashbyHtmlToText(html: string): string {
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

/** Ashby employment-type enum → human label; unknown values pass through raw. */
function employmentLabel(v: string): string | null {
  const map: Record<string, string> = {
    fulltime: "Full-time",
    parttime: "Part-time",
    intern: "Intern",
    contract: "Contract",
    temporary: "Temporary",
  };
  const key = v.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!v.trim()) return null;
  return map[key] ?? v.trim().slice(0, 100);
}

export class AshbyAdapter implements JobSourceAdapter {
  readonly id = "ashby";
  readonly name = "Ashby (public Job Board API)";
  readonly mock = false;

  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultBoards: string[];

  constructor(
    opts: { timeoutMs?: number; fetchImpl?: typeof fetch; boards?: string[] } = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? ASHBY_TIMEOUT_MS;
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
        employmentType: true,
        pagination: false,
        signals: false,
      },
      limits: {
        timeoutMs: this.timeoutMs,
        // Single bounded list request per search.
        maxRequestsPerRun: 1,
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

  async search(params: JobSearchParamsInput): Promise<RawJob[]> {
    const board = this.boardFor(params);
    if (!board) return []; // no board configured: run nothing, never guess
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);

    let payload: unknown;
    try {
      const res = await this.fetchImpl(`${API_BASE}/${board}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "JobPilot/1.0 (+job ingestion; single bounded request)",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`transient: Ashby API responded with HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw new HttpError(400, "Ashby board not found or request rejected");
      }
      try {
        payload = await res.json();
      } catch {
        throw new HttpError(400, "Ashby response was malformed");
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const reason =
        err instanceof Error && err.name === "TimeoutError"
          ? "transient: Ashby request timed out"
          : err instanceof Error && err.message.startsWith("transient: ")
            ? err.message
            : "Ashby request failed";
      throw new Error(reason);
    }

    const jobs: AshbyJob[] = Array.isArray((payload as { jobs?: unknown })?.jobs)
      ? ((payload as { jobs: AshbyJob[] }).jobs ?? [])
      : [];
    const q = (params.query ?? "").toLowerCase().trim();
    const loc = (params.location ?? "").toLowerCase().trim();
    const emp = (params.employmentType ?? "").toLowerCase().trim();

    const out: RawJob[] = [];
    for (const item of jobs) {
      if (out.length >= limit) break;
      if (item.isListed === false) continue; // direct-link-only: not for public listing
      const id = toText(item.id).trim();
      const title = toText(item.title).trim();
      if (!id || !title) continue; // skip malformed, never invent
      const description =
        toText(item.descriptionPlain).trim().slice(0, MAX_DESCRIPTION_CHARS) ||
        ashbyHtmlToText(toText(item.descriptionHtml));
      if (!description) continue; // descriptions required downstream: skip, never invent

      const location = toText(item.location).trim() || null;
      const department = toText(item.department).trim();
      const team = toText(item.team).trim();
      const remote =
        item.isRemote === true || toText(item.workplaceType).toLowerCase() === "remote";
      const employmentType = employmentLabel(toText(item.employmentType));
      if (q && !`${title} ${department} ${team} ${location ?? ""}`.toLowerCase().includes(q)) continue;
      if (loc && !(location ?? "").toLowerCase().includes(loc)) continue;
      if (params.remote === true && !remote) continue;
      if (params.remote === false && remote) continue;
      if (emp && !(employmentType ?? "").toLowerCase().includes(emp)) continue;

      const jobUrl = toText(item.jobUrl) || toText(item.applyUrl);
      const publishedAt = toText(item.publishedAt).trim();
      out.push({
        externalId: `${board}:${id}`,
        source: this.id,
        // Public payloads carry no company name: the board token is the
        // honest company fallback (Greenhouse convention).
        title,
        company: board,
        companyUrl: null,
        jobUrl: isHttpUrl(jobUrl) ? jobUrl : null,
        location,
        remote,
        employmentType,
        salaryMin: null, // never requested (no compensation flag) — never invent
        salaryMax: null,
        salaryCurrency: null,
        description,
        postedAt: publishedAt || null,
        metadata: {
          board,
          department: department || null,
          team: team || null,
        },
      });
    }
    return out;
  }
}
