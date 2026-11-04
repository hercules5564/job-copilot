/**
 * Local suggestion data + matching for the Job Role and Location
 * autocomplete inputs.
 *
 * The dataset is intentionally local so the feature works offline and adds
 * no paid API dependency. `fetchSuggestions` is the single seam where a
 * remote provider can be plugged in later (debounce/loading/abort handling
 * already lives in the Autocomplete component).
 */

export type SuggestionKind = "role" | "location";

export interface Suggestion {
  label: string;
  /** Extra terms that should surface this suggestion (synonyms, spellings). */
  aliases?: readonly string[];
}

export interface SuggestionFetchOptions {
  limit?: number;
  signal?: AbortSignal;
}

export type SuggestionFetcher = (
  kind: SuggestionKind,
  query: string,
  options?: SuggestionFetchOptions,
) => Promise<Suggestion[]>;

export const MAX_SUGGESTIONS = 7;

const ROLES: readonly Suggestion[] = [
  { label: "AI Engineer", aliases: ["ai", "artificial intelligence", "ml"] },
  { label: "AI Intern", aliases: ["ai", "artificial intelligence", "intern", "internship"] },
  { label: "Android Developer", aliases: ["android", "mobile", "app"] },
  { label: "Backend Developer", aliases: ["back", "backend", "back-end", "server"] },
  { label: "Backend Engineer", aliases: ["back", "backend", "back-end", "server"] },
  { label: "Business Analyst", aliases: ["business", "analyst", "ba"] },
  { label: "Cloud Engineer", aliases: ["cloud", "aws", "azure", "gcp"] },
  { label: "Cybersecurity Engineer", aliases: ["security", "cyber", "infosec"] },
  { label: "Data Analyst", aliases: ["data", "analytics", "analyst"] },
  { label: "Data Engineer", aliases: ["data", "etl", "pipeline"] },
  { label: "Data Scientist", aliases: ["data", "science", "scientist", "ml"] },
  { label: "DevOps Engineer", aliases: ["devops", "dev ops", "infrastructure", "sre"] },
  { label: "Embedded Engineer", aliases: ["embedded", "firmware", "hardware"] },
  { label: "Frontend Developer", aliases: ["front", "frontend", "front-end", "ui"] },
  { label: "Frontend Engineer", aliases: ["front", "frontend", "front-end", "ui"] },
  { label: "Full Stack Developer", aliases: ["full", "fullstack", "full-stack"] },
  { label: "Full Stack Engineer", aliases: ["full", "fullstack", "full-stack"] },
  { label: "Game Developer", aliases: ["game", "unity", "unreal"] },
  { label: "Graphic Designer", aliases: ["graphic", "design", "designer"] },
  { label: "HR Manager", aliases: ["hr", "human resources", "people"] },
  { label: "iOS Developer", aliases: ["ios", "iphone", "mobile", "app"] },
  { label: "Machine Learning Engineer", aliases: ["ml", "machine learning", "ai"] },
  { label: "Marketing Manager", aliases: ["marketing", "growth"] },
  { label: "Mobile Developer", aliases: ["mobile", "ios", "android", "app"] },
  { label: "Platform Engineer", aliases: ["platform", "infrastructure"] },
  { label: "Product Manager", aliases: ["product", "pm"] },
  { label: "Project Manager", aliases: ["project", "pm", "delivery"] },
  { label: "QA Engineer", aliases: ["qa", "quality assurance", "tester", "testing"] },
  { label: "Sales Engineer", aliases: ["sales", "solutions engineer"] },
  { label: "Senior Software Engineer", aliases: ["senior", "software", "swe"] },
  { label: "Site Reliability Engineer", aliases: ["sre", "reliability", "devops"] },
  { label: "Software Developer", aliases: ["soft", "software", "developer"] },
  { label: "Software Engineer", aliases: ["soft", "software", "swe", "developer"] },
  { label: "Software Intern", aliases: ["soft", "software", "intern", "internship"] },
  { label: "Technical Writer", aliases: ["technical", "writer", "documentation"] },
  { label: "UI/UX Designer", aliases: ["ui", "ux", "design", "designer"] },
];

const LOCATIONS: readonly Suggestion[] = [
  { label: "Ahmedabad", aliases: ["ahm", "amdavad"] },
  { label: "Australia", aliases: ["au", "aussie"] },
  { label: "Bangalore", aliases: ["bang", "bengaluru"] },
  { label: "Bengaluru", aliases: ["bang", "bangalore", "blr"] },
  { label: "Berlin", aliases: ["ber"] },
  { label: "Bhopal", aliases: ["bho"] },
  { label: "Boston", aliases: ["bos"] },
  { label: "Canada", aliases: ["ca", "can"] },
  { label: "Chandigarh", aliases: ["chan", "chd"] },
  { label: "Chennai", aliases: ["chan", "chen", "madras", "chn"] },
  { label: "Chicago", aliases: ["chi"] },
  { label: "Coimbatore", aliases: ["cbe", "kovai"] },
  { label: "Delhi", aliases: ["del", "dilli"] },
  { label: "Dubai", aliases: ["uae", "united arab emirates"] },
  { label: "Germany", aliases: ["de", "deutschland"] },
  { label: "Gurugram", aliases: ["gurgaon", "ggn"] },
  { label: "Hyderabad", aliases: ["hyd", "cyberabad"] },
  { label: "India", aliases: ["in", "bharat"] },
  { label: "Indore", aliases: ["ind"] },
  { label: "Jaipur", aliases: ["jai"] },
  { label: "Kochi", aliases: ["cochin", "cok"] },
  { label: "Kolkata", aliases: ["cal", "calcutta", "kol"] },
  { label: "London", aliases: ["lon", "uk"] },
  { label: "Los Angeles", aliases: ["la", "los angeles"] },
  { label: "Lucknow", aliases: ["lko"] },
  { label: "Mumbai", aliases: ["mum", "bombay", "bom"] },
  { label: "Mysuru", aliases: ["mysore", "mys"] },
  { label: "Nagpur", aliases: ["nag"] },
  { label: "New Delhi", aliases: ["del", "new delhi", "ncr"] },
  { label: "New York", aliases: ["ny", "nyc", "new york"] },
  { label: "Noida", aliases: ["noi", "ncr"] },
  { label: "Pune", aliases: ["pun", "poona"] },
  { label: "Punjab", aliases: ["pun", "pb"] },
  { label: "Remote", aliases: ["wfh", "work from home", "anywhere"] },
  { label: "San Francisco", aliases: ["sf", "san fran", "bay area"] },
  { label: "Seattle", aliases: ["sea"] },
  { label: "Singapore", aliases: ["sg", "sing"] },
  { label: "Surat", aliases: ["sur"] },
  { label: "Thiruvananthapuram", aliases: ["trivandrum", "tvm"] },
  { label: "Toronto", aliases: ["tor"] },
  { label: "United Arab Emirates", aliases: ["uae", "dubai"] },
  { label: "United Kingdom", aliases: ["uk", "gb", "britain"] },
  { label: "United States", aliases: ["us", "usa", "america"] },
  { label: "Visakhapatnam", aliases: ["vizag", "visakha"] },
];

const DATA: Record<SuggestionKind, readonly Suggestion[]> = {
  role: ROLES,
  location: LOCATIONS,
};

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

/** 0 = no match; higher = more relevant. */
function scoreField(field: string, query: string): number {
  const value = normalize(field);
  if (!value) return 0;
  if (value === query) return 100;
  if (value.startsWith(query)) return 90 - Math.min(value.length - query.length, 20);

  const words = value.split(/[\s/,-]+/).filter(Boolean);
  if (words.some((word) => word.startsWith(query))) return 80;

  const index = value.indexOf(query);
  if (index >= 0) return 60 - Math.min(index, 20);
  return 0;
}

function scoreSuggestion(suggestion: Suggestion, query: string): number {
  const labelScore = scoreField(suggestion.label, query);
  const aliasScore = (suggestion.aliases ?? []).reduce(
    (best, alias) => Math.max(best, scoreField(alias, query) * 0.9),
    0,
  );
  return Math.max(labelScore, aliasScore);
}

function clampLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return MAX_SUGGESTIONS;
  return Math.max(1, Math.min(Math.floor(limit), MAX_SUGGESTIONS));
}

/** Pure, synchronous search used by both the local provider and tests. */
export function searchSuggestions(
  kind: SuggestionKind,
  query: string,
  limit?: number,
): Suggestion[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  return DATA[kind]
    .map((suggestion) => ({ suggestion, score: scoreSuggestion(suggestion, normalized) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.suggestion.label.localeCompare(b.suggestion.label),
    )
    .slice(0, clampLimit(limit))
    .map((entry) => entry.suggestion);
}

/**
 * Default provider. Kept async so a remote endpoint can replace the body
 * without touching the component.
 */
export const fetchSuggestions: SuggestionFetcher = async (kind, query, options) => {
  if (options?.signal?.aborted) return [];
  return searchSuggestions(kind, query, options?.limit);
};

/** Split a label into before/match/after for highlighting. */
export function splitHighlight(
  label: string,
  query: string,
): { before: string; match: string; after: string } {
  const normalized = query.trim();
  if (!normalized) return { before: label, match: "", after: "" };
  const index = label.toLowerCase().indexOf(normalized.toLowerCase());
  if (index < 0) return { before: label, match: "", after: "" };
  return {
    before: label.slice(0, index),
    match: label.slice(index, index + normalized.length),
    after: label.slice(index + normalized.length),
  };
}
