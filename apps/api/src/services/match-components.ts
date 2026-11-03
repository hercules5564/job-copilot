/**
 * Phase 4 — deterministic match component scorers.
 * Each scorer returns { score: number | null, ... } where null means
 * UNKNOWN (missing information): unknown components are excluded from
 * the weighted total and reported as warnings/uncertain requirements,
 * never silently scored as 0 (failure).
 */

export interface ComponentOutcome {
  /** 0–100, or null when the comparison is not possible (unknown). */
  score: number | null;
  matched: string[];
  missing: string[];
  uncertain: string[];
  reasons: string[];
  warnings: string[];
}

function empty(): ComponentOutcome {
  return { score: null, matched: [], missing: [], uncertain: [], reasons: [], warnings: [] };
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------- role ----------------

/** Canonical role token -> variants. */
const ROLE_ALIASES: Record<string, string[]> = {
  frontend: ["frontend", "front end", "ui engineer", "ui developer", "client side"],
  backend: ["backend", "back end", "server side", "api engineer", "api developer"],
  fullstack: ["fullstack", "full stack", "full-stack", "react node", "node react", "mern", "mean"],
  mobile: ["mobile", "ios", "android", "flutter"],
  devops: ["devops", "dev ops", "sre", "site reliability", "infrastructure", "platform engineer"],
  data: ["data engineer", "data analyst", "data scientist", "data science", "analytics", "etl", "bi developer"],
  ml: ["machine learning", "artificial intelligence", "deep learning", "llm engineer", "ml engineer", "ai engineer"],
  qa: ["qa", "quality assurance", "test engineer", "qa engineer", "tester", "sdet"],
  designer: ["designer", "product designer", "graphic designer", "ux designer", "ui designer", "ux", "visual designer"],
  manager: ["engineering manager", "product manager", "project manager", "director", "head of", "cto", "vp engineering"],
  dev: ["developer", "engineer", "software engineer", "software developer", "programmer", "software"],
  intern: ["intern", "internship", "trainee", "apprentice"],
};

/** Tokens carrying no discriminative signal. */
const ROLE_STOPWORDS = new Set([
  "senior", "junior", "staff", "principal", "associate", "mid", "level",
  "remote", "hybrid", "onsite", "hiring", "urgent", "immediate", "joiner",
  "i", "ii", "iii", "iv", "v", "sde", "swe", "se", "a", "the", "and",
]);

function expandRoleTokens(text: string): Set<string> {
  const hay = ` ${norm(text)} `;
  const tokens = new Set<string>();
  // Words already consumed by a matched multi-word variant ("full stack",
  // "software engineer") add no further signal as raw tokens.
  const consumed = new Set<string>();
  for (const [canonical, variants] of Object.entries(ROLE_ALIASES)) {
    let hit = false;
    for (const variant of variants) {
      if (hay.includes(` ${norm(variant)} `)) {
        hit = true;
        for (const w of norm(variant).split(" ")) consumed.add(w);
      }
    }
    if (hit) tokens.add(canonical);
  }
  // Keep unmatched raw tokens (e.g. "solidity") so niche roles can still
  // overlap verbatim.
  for (const word of norm(text).split(" ")) {
    if (word && !ROLE_STOPWORDS.has(word) && !consumed.has(word)) tokens.add(word);
  }
  return tokens;
}

export function scoreRole(targetRoles: string[], jobTitle: string): ComponentOutcome {
  const out = empty();
  if (targetRoles.length === 0) {
    out.uncertain.push("No target roles on your profile; role fit is unknown.");
    return out;
  }
  const candidate = new Set<string>();
  for (const role of targetRoles) {
    for (const t of expandRoleTokens(role)) candidate.add(t);
  }
  const job = expandRoleTokens(jobTitle);
  // A fully generic title ("Software Engineer") carries no signal beyond "dev".
  const specific = new Set([...job].filter((t) => t !== "dev"));
  const denom = specific.size > 0 ? specific : job;
  if (denom.size === 0) {
    out.uncertain.push(`Could not parse any role signal from title "${jobTitle}".`);
    return out;
  }
  const overlap = [...denom].filter((t) => candidate.has(t));
  if (specific.size === 0) {
    out.score = 60;
    out.matched.push("Generic engineering role title.");
    out.reasons.push("The title is generic, so role fit is partially assumed.");
    return out;
  }
  out.score = Math.round((overlap.length / denom.size) * 100);
  if (overlap.length > 0) {
    out.matched.push(`Role overlap: ${overlap.sort().join(", ")}.`);
    out.reasons.push(`Overlaps your target role signal (${overlap.sort().join(", ")}).`);
  } else {
    out.missing.push(`No overlap with your target roles (${targetRoles.join("; ")}).`);
  }
  return out;
}

// ---------------- experience ----------------

const YEARS_PATTERNS = [
  /(\d+)\s*[-–]\s*(\d+)\s*(?:years?|yrs?)/i,
  /(\d+)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+experience/i,
  /experience\s+(?:of\s+)?(\d+)\s*\+?/i,
  /(\d+)\s*\+\s*(?:years?|yrs?)/i,
  /minimum\s+(?:of\s+)?(\d+)\s*(?:years?|yrs?)/i,
];

/** Lowest explicitly stated years-of-experience requirement, if any. */
export function extractRequiredYears(description: string): number | null {
  let required: number | null = null;
  for (const pattern of YEARS_PATTERNS) {
    const match = pattern.exec(description);
    if (match) {
      const nums = match
        .slice(1)
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n <= 40);
      if (nums.length > 0) {
        const min = Math.min(...nums);
        required = required === null ? min : Math.min(required, min);
      }
    }
  }
  return required;
}

export function scoreExperience(
  candidateYears: number | null | undefined,
  description: string,
): ComponentOutcome {
  const out = empty();
  const required = extractRequiredYears(description);
  if (required === null) {
    out.uncertain.push("The job states no explicit experience requirement.");
    return out;
  }
  if (candidateYears === null || candidateYears === undefined) {
    out.uncertain.push(
      `The job asks for ${required}+ years; your profile lists no experience figure.`,
    );
    return out;
  }
  if (candidateYears >= required) {
    out.score = 100;
    out.matched.push(`Meets the stated ${required}+ years requirement.`);
    out.reasons.push(`Your ${candidateYears} years meet the stated ${required}+ years.`);
  } else {
    out.score = 0;
    out.missing.push(`Asks for ${required}+ years; your profile shows ${candidateYears}.`);
  }
  return out;
}

// ---------------- location ----------------

function locationsOverlap(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

export function scoreLocation(
  remotePreference: string,
  preferredLocations: string[],
  jobRemote: boolean,
  jobLocation: string | null | undefined,
): ComponentOutcome {
  const out = empty();
  const mode = remotePreference ?? "ANY";
  const prefs = preferredLocations.filter(Boolean);

  if (jobRemote) {
    if (mode === "REMOTE") {
      out.score = 100;
      out.matched.push("Remote job matches your remote preference.");
      out.reasons.push("The role supports your remote preference.");
    } else if (mode === "HYBRID") {
      out.score = 90;
      out.matched.push("Remote job is compatible with hybrid preference.");
    } else if (mode === "ANY") {
      out.score = 75;
      out.matched.push("Remote job; you expressed no strong location preference.");
    } else {
      out.score = 50;
      out.uncertain.push("Remote job, but you prefer onsite work.");
    }
    return out;
  }

  if (!jobLocation) {
    out.uncertain.push("Job location was not provided.");
    return out;
  }
  const hit = prefs.find((p) => locationsOverlap(p, jobLocation));
  if (hit) {
    out.score = 100;
    out.matched.push(`Location "${jobLocation}" matches your preference "${hit}".`);
    out.reasons.push(`Located where you want (${hit}).`);
    return out;
  }
  if (mode === "REMOTE") {
    out.score = 20;
    out.missing.push(`Onsite in ${jobLocation}, but you prefer remote.`);
    out.warnings.push("Requires onsite work outside your remote preference.");
    return out;
  }
  if (prefs.length === 0) {
    out.uncertain.push(`Job is in ${jobLocation}; you listed no preferred locations.`);
    return out;
  }
  out.score = 40;
  out.missing.push(`In ${jobLocation}, outside your listed preferences.`);
  return out;
}

// ---------------- salary ----------------

export function scoreSalary(
  candidateMin: number | null | undefined,
  candidateCurrency: string,
  jobMin: number | null | undefined,
  jobMax: number | null | undefined,
  jobCurrency: string,
): ComponentOutcome {
  const out = empty();
  if (candidateMin === null || candidateMin === undefined) {
    out.uncertain.push("You set no minimum salary, so salary fit is unknown.");
    return out;
  }
  if (jobMin === null && jobMax === null) {
    out.uncertain.push("Salary information was not provided.");
    return out;
  }
  if (candidateCurrency.toUpperCase() !== jobCurrency.toUpperCase()) {
    out.uncertain.push(
      `Currency differs (${candidateCurrency} vs ${jobCurrency}); comparison skipped.`,
    );
    return out;
  }
  const low = jobMin ?? jobMax;
  const high = jobMax ?? jobMin;
  if (low === null || low === undefined || high === null || high === undefined) {
    out.uncertain.push("Salary information was not provided.");
    return out;
  }
  if (low >= candidateMin) {
    out.score = 100;
    out.matched.push("Salary range meets your minimum.");
    out.reasons.push("The salary range meets your minimum.");
  } else if (high >= candidateMin) {
    out.score = 60;
    out.matched.push("Salary range partially overlaps your minimum.");
    out.uncertain.push("Only the top of the range reaches your minimum.");
  } else {
    out.score = 15;
    out.missing.push("Salary range is below your minimum.");
    out.warnings.push("The stated salary is below your minimum.");
  }
  return out;
}

// ---------------- education ----------------

const DEGREE_LEVELS: { level: string; pattern: RegExp }[] = [
  { level: "PhD", pattern: /\bph\.?d\b|doctorate/i },
  { level: "Master's", pattern: /\bmaster'?s?\b|\bm\.?s\.?c?\b|\bmtech\b|\bmba\b|graduate degree/i },
  { level: "Bachelor's", pattern: /\bbachelor'?s?\b|\bb\.?tech\b|\bb\.?e\b|\bbs\b|\bba\b|undergraduate/i },
  { level: "Degree", pattern: /\bdegree\b|\bdiploma\b/i },
];

const FIELD_PATTERN = /computer science|\bcs\b|software|engineering|information technology|\bit\b|related field/i;

export function scoreEducation(
  candidateEducation: string[],
  description: string,
): ComponentOutcome {
  const out = empty();
  const requirement = DEGREE_LEVELS.find((d) => d.pattern.test(description));
  if (!requirement) {
    out.uncertain.push("The job states no explicit education requirement.");
    return out;
  }
  if (candidateEducation.length === 0) {
    out.uncertain.push(`Asks for ${requirement.level}; your profile lists no education.`);
    return out;
  }
  const blob = candidateEducation.join(" ");
  const levelHit =
    requirement.level === "Degree"
      ? true
      : DEGREE_LEVELS.some(
          (d) =>
            DEGREE_LEVELS.indexOf(d) <= DEGREE_LEVELS.indexOf(requirement) &&
            d.pattern.test(blob),
        );
  const fieldRelevant = FIELD_PATTERN.test(description)
    ? FIELD_PATTERN.test(blob)
    : true;
  if (levelHit && fieldRelevant) {
    out.score = 100;
    out.matched.push(`Education background covers the stated ${requirement.level} requirement.`);
    out.reasons.push("Your education covers the stated requirement.");
  } else {
    out.score = 40;
    out.uncertain.push(
      `Asks for ${requirement.level}; only a partial education overlap was detected.`,
    );
  }
  return out;
}
