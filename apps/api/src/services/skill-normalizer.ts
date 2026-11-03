/**
 * Phase 4 — centralized deterministic skill normalization.
 * Single alias map reused by extraction and candidate normalization.
 * Matching is token-based with word boundaries: "java" never matches
 * "javascript".
 */

/** Canonical skill -> known aliases (all lowercase, raw forms). */
const SKILL_ALIASES: Record<string, string[]> = {
  typescript: ["typescript", "ts", "type script"],
  javascript: ["javascript", "js", "java script", "ecmascript", "es6"],
  react: ["react", "react.js", "reactjs", "react js", "react native", "reactnative"],
  node: ["node", "node.js", "nodejs", "node js", "express.js", "expressjs", "express js"],
  nextjs: ["next.js", "nextjs", "next js"],
  angular: ["angular", "angularjs", "angular.js"],
  vue: ["vue", "vue.js", "vuejs", "nuxt", "nuxt.js"],
  svelte: ["svelte", "sveltekit"],
  redux: ["redux", "redux toolkit", "rtk"],
  html: ["html", "html5"],
  css: ["css", "css3", "sass", "scss", "less", "tailwind", "tailwindcss", "tailwind css"],
  python: ["python", "django", "flask", "fastapi"],
  java: ["java", "spring", "spring boot"],
  go: ["golang"],
  rust: ["rust"],
  csharp: ["c#", "c sharp", ".net", "dotnet", "asp.net"],
  php: ["php", "laravel", "symfony"],
  ruby: ["ruby", "rails", "ruby on rails"],
  sql: ["sql", "mysql", "sqlite", "oracle db", "mssql"],
  postgresql: ["postgresql", "postgres"],
  mongodb: ["mongodb", "mongo"],
  redis: ["redis"],
  aws: ["aws", "amazon web services", "ec2", "s3", "lambda"],
  azure: ["azure", "microsoft azure"],
  gcp: ["gcp", "google cloud", "google cloud platform"],
  docker: ["docker", "docker compose", "containerization"],
  kubernetes: ["kubernetes", "k8s"],
  terraform: ["terraform", "infrastructure as code", "iac"],
  graphql: ["graphql"],
  rest: ["rest api", "restful", "restful api"],
  kafka: ["kafka", "apache kafka"],
  elasticsearch: ["elasticsearch", "elastic search", "elk"],
  jest: ["jest"],
  vitest: ["vitest"],
  playwright: ["playwright"],
  cypress: ["cypress"],
  git: ["git", "github", "gitlab", "version control"],
  linux: ["linux", "unix", "bash", "shell scripting"],
  figma: ["figma", "ui design", "ux design"],
};

/** Display label per canonical skill. */
const SKILL_LABELS: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  react: "React",
  node: "Node.js",
  nextjs: "Next.js",
  angular: "Angular",
  vue: "Vue",
  svelte: "Svelte",
  redux: "Redux",
  html: "HTML",
  css: "CSS",
  python: "Python",
  java: "Java",
  go: "Go",
  rust: "Rust",
  csharp: "C#",
  php: "PHP",
  ruby: "Ruby",
  sql: "SQL",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
  redis: "Redis",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  docker: "Docker",
  kubernetes: "Kubernetes",
  terraform: "Terraform",
  graphql: "GraphQL",
  rest: "REST",
  kafka: "Kafka",
  elasticsearch: "Elasticsearch",
  jest: "Jest",
  vitest: "Vitest",
  playwright: "Playwright",
  cypress: "Cypress",
  git: "Git",
  linux: "Linux",
  figma: "Figma",
};

/** Normalize free text for token matching: lowercase, non-alnum -> space. */
export function normalizeSkillText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9#+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize a single alias the same way so multi-word aliases match. */
function normalizeAlias(alias: string): string {
  return normalizeSkillText(alias);
}

const ALIAS_ENTRIES: { canonical: string; alias: string }[] = (() => {
  const entries: { canonical: string; alias: string }[] = [];
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    for (const alias of aliases) {
      entries.push({ canonical, alias: normalizeAlias(alias) });
    }
  }
  // Longest aliases first so "react native" wins over "react" positionally
  // (both are still recorded — extraction dedupes per canonical skill).
  entries.sort((a, b) => b.alias.length - a.alias.length);
  return entries;
})();

/**
 * Normalize one raw skill string to its canonical key.
 * Returns null when the skill is not in the dictionary (unknown skills
 * are kept verbatim by callers that need them, never silently dropped
 * into a wrong bucket).
 */
export function normalizeSkill(raw: string): string | null {
  const n = normalizeSkillText(raw);
  if (!n) return null;
  for (const { canonical, alias } of ALIAS_ENTRIES) {
    if (n === alias) return canonical;
  }
  return null;
}

/** Human label for a canonical skill key. */
export function skillLabel(canonical: string): string {
  return SKILL_LABELS[canonical] ?? canonical;
}

/** All known canonical skill keys (for tests/docs). */
export function knownSkills(): string[] {
  return Object.keys(SKILL_ALIASES);
}

/**
 * Framework compounds split by normalization ("node.js" -> "node js")
 * are rejoined before matching so the trailing "js" does not also
 * count as a standalone JavaScript mention.
 */
const COMPOUND_JOINS: [string, string][] = [
  ["react", "js"],
  ["node", "js"],
  ["vue", "js"],
  ["next", "js"],
  ["express", "js"],
  ["nuxt", "js"],
  ["angular", "js"],
  ["type", "script"],
  ["java", "script"],
];

function joinCompounds(normalized: string): string {
  let out = ` ${normalized} `;
  for (const [first, second] of COMPOUND_JOINS) {
    out = out.replace(new RegExp(`\\b${first}\\s+${second}\\b`, "g"), `${first}${second}`);
  }
  return out;
}

/**
 * Extract canonical skills mentioned in free text.
 * Token/boundary-based: each alias must appear as a whole token run,
 * so "java" does not match "javascript". Each skill counted once.
 */
export function extractSkills(text: string): string[] {
  const hay = joinCompounds(normalizeSkillText(text));
  if (!hay.trim()) return [];
  const found = new Set<string>();
  for (const { canonical, alias } of ALIAS_ENTRIES) {
    if (alias && hay.includes(` ${alias} `)) found.add(canonical);
  }
  return [...found].sort();
}

/**
 * Normalize a candidate's raw skill list. Known skills collapse to
 * canonical keys; unknown entries are kept as normalized free text so
 * they can still match verbatim (e.g. niche tools), flagged separately.
 */
export function normalizeCandidateSkills(raw: string[]): {
  known: string[];
  unknown: string[];
} {
  const known = new Set<string>();
  const unknown = new Set<string>();
  for (const item of raw) {
    const canonical = normalizeSkill(item);
    if (canonical) known.add(canonical);
    else {
      const n = normalizeSkillText(item);
      if (n) unknown.add(n);
    }
  }
  return { known: [...known].sort(), unknown: [...unknown].sort() };
}
