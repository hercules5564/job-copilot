import type { JobSearchParamsInput,
  JobSourceInfo,
  RawJob,
} from "@jobcopilot/shared";
import { HttpError } from "../../services/errors.js";
import type { JobSourceAdapter } from "../types.js";

/**
 * Phase 14 (C5) — third permitted production source: Lever Postings API.
 *
 * Why permitted (verified live 2026-09-25): officially documented public
 * JSON API for published job postings (lever/postings-api: "all job
 * postings in the `published` state are publicly viewable"). No key, no
 * auth, no login, no browser automation for GET reads.
 * Endpoint: GET https://api.lever.co/v0/postings/{site}?mode=json&limit=N
 * Verified live: `leverdemo` returns structured postings
 * {id, text, categories{location,team,...}, descriptionPlain/description,
 * hostedUrl, createdAt, workplaceType}; unknown boards 404; `lever`
 * returns `[]` (valid empty board). The POST apply endpoint (API key)
 * is never used — JobPilot only reads.
 *
 * Bounds per search: ONE list request (server-side limit ≤ 100), with
 * client-side filtering and output capped at params.limit (≤ 50).
 * Board tokens are charset-validated and interpolated into a FIXED
 * endpoint template — never treated as URLs (SSRF guard). HTTP 429/5xx/
 * timeouts are transient (retryable); 4xx is permanent (bad board).
 *
 * Honest gaps (never invented): the list payload carries no company name,
 * so the board token is used as the company fallback (same convention as
 * the Greenhouse adapter); no salary fields exist in the public payload.
 */

const API_BASE = "https://api.lever.co/v0/postings";

export const LEVER_TIMEOUT_MS = 10000;
const FETCH_LIMIT = 100;
const MAX_DESCRIPTION_CHARS = 8000;

interface LeverPosting {
  id?: unknown;
  text?: unknown;
  categories?: {
    location?: unknown;
    commitment?: unknown;
    team?: unknown;
    department?: unknown;
    allLocations?: unknown;
  };
  description?: unknown;
  descriptionPlain?: unknown;
  hostedUrl?: unknown;
  applyUrl?: unknown;
  createdAt?: unknown;
  workplaceType?: unknown;
  country?: unknown;
}

function toText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isHttpUrl(v: string): boolean {
  return v.startsWith("https://") || v.startsWith("http://");
}

/** Strip HTML to plain text (bounded). Descriptions are data, never markup. */
export function leverHtmlToText(html: string): string {
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

function allLocationsOf(posting: LeverPosting): string[] {
  const all = posting.categories?.allLocations;
  if (Array.isArray(all)) return all.map(toText).map((s) => s.trim()).filter(Boolean);
  return [];
}

export class LeverAdapter implements JobSourceAdapter {
  readonly id = "lever";
  readonly name = "Lever (public Postings API)";
  readonly mock = false;

  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultBoards: string[];

  constructor(
    opts: { timeoutMs?: number; fetchImpl?: typeof fetch; boards?: string[] } = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? LEVER_TIMEOUT_MS;
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
        // Single bounded list request per search (server-side limit ≤ 100).
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
      const res = await this.fetchImpl(
        `${API_BASE}/${board}?mode=json&limit=${FETCH_LIMIT}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "JobPilot/1.0 (+job ingestion; single bounded request)",
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`transient: Lever API responded with HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw new HttpError(400, "Lever board not found or request rejected");
      }
      try {
        payload = await res.json();
      } catch {
        throw new HttpError(400, "Lever response was malformed");
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const reason =
        err instanceof Error && err.name === "TimeoutError"
          ? "transient: Lever request timed out"
          : err instanceof Error && err.message.startsWith("transient: ")
            ? err.message
            : "Lever request failed";
      throw new Error(reason);
    }

    const items: LeverPosting[] = Array.isArray(payload) ? payload : [];
    const q = (params.query ?? "").toLowerCase().trim();
    const loc = (params.location ?? "").toLowerCase().trim();
    const emp = (params.employmentType ?? "").toLowerCase().trim();

    const out: RawJob[] = [];
    for (const item of items) {
      if (out.length >= limit) break;
      const id = toText(item.id).trim();
      const title = toText(item.text).trim();
      if (!id || !title) continue; // skip malformed, never invent
      const description =
        toText(item.descriptionPlain).trim().slice(0, MAX_DESCRIPTION_CHARS) ||
        leverHtmlToText(toText(item.description));
      if (!description) continue; // descriptions required downstream: skip, never invent

      const locations = allLocationsOf(item);
      const location = toText(item.categories?.location).trim() || locations[0] || null;
      const locationHay = [location ?? "", ...locations].join(" ").toLowerCase();
      const commitment = toText(item.categories?.commitment).trim();
      const team = toText(item.categories?.team).trim();
      const department = toText(item.categories?.department).trim();
      const remote =
        toText(item.workplaceType).toLowerCase() === "remote" || /remote/i.test(locationHay);
      if (q && !`${title} ${team} ${department} ${locationHay}`.toLowerCase().includes(q)) continue;
      if (loc && !locationHay.includes(loc)) continue;
      if (params.remote === true && !remote) continue;
      if (params.remote === false && remote) continue;
      if (emp && !(commitment ?? "").toLowerCase().includes(emp)) continue;

      const jobUrl = toText(item.hostedUrl) || toText(item.applyUrl);
      let postedAt: string | null = null;
      if (typeof item.createdAt === "number" && Number.isFinite(item.createdAt)) {
        const d = new Date(item.createdAt);
        if (!Number.isNaN(d.getTime())) postedAt = d.toISOString();
      }
      out.push({
        externalId: `${board}:${id}`,
        source: this.id,
        // Public list payloads carry no company name: the board token is
        // the honest company fallback (Greenhouse convention).
        title,
        company: board,
        companyUrl: null,
        jobUrl: isHttpUrl(jobUrl) ? jobUrl : null,
        location,
        remote,
        employmentType: commitment || null,
        salaryMin: null, // source provides no salary — never invent
        salaryMax: null,
        salaryCurrency: null,
        description,
        postedAt,
        metadata: {
          board,
          team: team || null,
          department: department || null,
        },
      });
    }
    return out;
  }
}
