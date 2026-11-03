import type { RawJob } from "@jobcopilot/shared";

/**
 * Phase 3 — deterministic job normalizer. No LLM.
 * Pure functions: whitespace, URL canonicalization, remote/employment-type
 * inference. Never invents missing data; never destroys descriptions.
 */

export interface NormalizedJob {
  source: string;
  externalId: string;
  title: string;
  company: string;
  companyUrl: string | null;
  jobUrl: string | null;
  location: string | null;
  remote: boolean;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  description: string;
  postedAt: string | null;
  metadata: Record<string, unknown> | null;
}

/** Trim + collapse all internal whitespace runs to a single space. */
export function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Canonicalize a URL for comparison/dedup:
 * lowercase host, drop fragment, strip common tracking params (utm_*),
 * remove trailing slash on non-root paths. Returns null when unsafe to parse.
 */
export function canonicalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    const params = new URLSearchParams(url.search);
    for (const key of [...params.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) params.delete(key);
    }
    url.search = params.toString();
    // Drop trailing slash on non-root paths for stable comparison.
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

const REMOTE_HINTS = ["remote", "work from home", "wfh", "distributed", "anywhere"];

function inferRemote(
  rawRemote: boolean | null | undefined,
  location: string | null,
  title: string,
): boolean {
  if (rawRemote === true) return true;
  if (rawRemote === false) return false;
  const hay = `${location ?? ""} ${title}`.toLowerCase();
  return REMOTE_HINTS.some((h) => hay.includes(h));
}

const EMPLOYMENT_TYPE_ALIASES: Record<string, string> = {
  "full-time": "FULL_TIME",
  "full time": "FULL_TIME",
  fulltime: "FULL_TIME",
  "part-time": "PART_TIME",
  "part time": "PART_TIME",
  parttime: "PART_TIME",
  contract: "CONTRACT",
  contractor: "CONTRACT",
  freelance: "CONTRACT",
  internship: "INTERNSHIP",
  intern: "INTERNSHIP",
  temporary: "TEMPORARY",
  temp: "TEMPORARY",
};

export function normalizeEmploymentType(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const cleaned = cleanText(raw);
  if (!cleaned) return null;
  const alias = EMPLOYMENT_TYPE_ALIASES[cleaned.toLowerCase()];
  return alias ?? cleaned.slice(0, 100);
}

export function normalizeRawJob(raw: RawJob): NormalizedJob {
  const title = cleanText(raw.title);
  const company = cleanText(raw.company);
  const locationRaw = raw.location ? cleanText(raw.location) : "";
  const location = locationRaw || null;
  return {
    source: raw.source,
    externalId: raw.externalId.trim(),
    title,
    company,
    companyUrl: canonicalizeUrl(raw.companyUrl),
    jobUrl: canonicalizeUrl(raw.jobUrl),
    location,
    remote: inferRemote(raw.remote, location, title),
    employmentType: normalizeEmploymentType(raw.employmentType),
    salaryMin: raw.salaryMin ?? null,
    salaryMax: raw.salaryMax ?? null,
    salaryCurrency: (raw.salaryCurrency ?? "USD").toUpperCase().slice(0, 10),
    // Descriptions: trim only — never rewrite meaningful content.
    description: raw.description.trim(),
    postedAt: raw.postedAt?.trim() || null,
    metadata: raw.metadata ? { ...(raw.metadata as Record<string, unknown>) } : null,
  };
}
