import { prisma } from "@jobcopilot/db";
import {
  ResumeExtractionSchema,
  type ExtractedExperience,
  type ExtractedProject,
  type ExtractedSkill,
  type ResumeExtraction,
  type SkillCategory,
} from "@jobcopilot/shared";
import { badRequest, notFound, unprocessable } from "./errors.js";
import {
  describeGenerationConfig,
  getGenerationProvider,
} from "./generation.js";
import { extractSkills, normalizeSkill, skillLabel } from "./skill-normalizer.js";
import { extractDocumentText } from "./resume-text.js";
import { readDocument } from "./resume-storage.js";

/**
 * Phase 22 — resume parsing.
 *
 * Preferred path: the application's configured LLM provider (structured
 * JSON, validated by Zod). When no provider is configured (or it fails),
 * a conservative deterministic extractor runs instead. Both paths are
 * instructed/designed to leave unknown fields empty — never invented.
 */

const AI_SYSTEM_PROMPT = `You extract structured facts from a candidate resume.
Return ONLY a JSON object with this exact shape:
{
  "summary": string|null,
  "currentTitle": string|null,
  "yearsOfExperience": number|null,
  "education": string[],
  "location": string|null,
  "preferredLocations": string[],
  "skills": [{"name": string, "category": "language"|"framework"|"database"|"cloud"|"devops"|"tool"|"platform"|"other"}],
  "experience": [{"company": string|null, "title": string|null, "responsibilities": string[], "achievements": string[], "internship": boolean}],
  "projects": [{"name": string, "description": string, "technologies": string[]}],
  "targetRoles": string[],
  "workMode": "REMOTE"|"HYBRID"|"ONSITE"|"ANY",
  "employmentTypes": string[],
  "minSalary": number|null,
  "experienceLevel": "INTERN"|"ENTRY"|"MID"|"SENIOR"|"LEAD"|null,
  "confidence": number,
  "warnings": string[]
}
Rules:
- Never invent facts. If the resume does not state something, use null or [].
- Do not infer a salary, location, preference, or degree that is not written.
- Keep the candidate's wording for titles/companies; do not embellish.
- confidence is your own 0-1 estimate of extraction completeness.
- Output JSON only.`;

const SKILL_CATEGORIES: Record<string, SkillCategory> = {
  typescript: "language",
  javascript: "language",
  python: "language",
  java: "language",
  go: "language",
  rust: "language",
  csharp: "language",
  php: "language",
  ruby: "language",
  sql: "database",
  postgresql: "database",
  mongodb: "database",
  redis: "database",
  elasticsearch: "database",
  react: "framework",
  node: "framework",
  nextjs: "framework",
  angular: "framework",
  vue: "framework",
  svelte: "framework",
  redux: "framework",
  html: "framework",
  css: "framework",
  graphql: "framework",
  rest: "framework",
  aws: "cloud",
  azure: "cloud",
  gcp: "cloud",
  docker: "devops",
  kubernetes: "devops",
  terraform: "devops",
  kafka: "devops",
  jest: "tool",
  vitest: "tool",
  playwright: "tool",
  cypress: "tool",
  git: "tool",
  figma: "tool",
  linux: "platform",
};

const ROLE_WORD =
  /\b(engineer|developer|programmer|manager|analyst|scientist|designer|architect|consultant|intern|specialist|lead|director|administrator|devops|sre|qa|recruiter|marketer)\b/i;
const DEGREE_WORD =
  /\b(bachelor|master|b\.?tech|m\.?tech|b\.?sc|m\.?sc|b\.?e\b|m\.?e\b|mba|ph\.?d|doctorate|degree|university|college|institute|diploma|high school)\b/i;
const BULLET = /^\s*(?:[-*•●▪◦]|\d+[.)])\s+/;

function cleanLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function linesOf(text: string): string[] {
  return text.split("\n").map((l) => l.replace(/\u00a0/g, " "));
}

function unique(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function skillObjects(text: string): ExtractedSkill[] {
  return extractSkills(text).map((canonical) => ({
    name: skillLabel(canonical),
    category: SKILL_CATEGORIES[canonical] ?? "other",
  }));
}

function dedupeSkills(list: ExtractedSkill[], max = 200): ExtractedSkill[] {
  const seen = new Set<string>();
  const out: ExtractedSkill[] = [];
  for (const skill of list) {
    const key = skill.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
    if (out.length >= max) break;
  }
  return out;
}

function skillsFromSection(text: string): ExtractedSkill[] {
  const lines = linesOf(text);
  const start = lines.findIndex((l) => /^\s*(technical\s+)?skills?\b/i.test(l));
  if (start < 0) return [];
  const collected: string[] = [];
  for (let i = start; i < Math.min(lines.length, start + 15); i += 1) {
    const line = cleanLine(lines[i]);
    if (!line) continue;
    if (i > start && /^[A-Z][A-Za-z &/]{2,40}$/.test(line) && !/[,|]/.test(line)) break;
    collected.push(line.replace(/^\s*(technical\s+)?skills?\s*[:\-]?\s*/i, ""));
  }
  const tokens = collected
    .join(", ")
    .split(/[,;|/•·]/)
    .map((t) => cleanLine(t))
    .filter((t) => t.length >= 2 && t.length <= 40);
  const out: ExtractedSkill[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const canonical = normalizeSkill(token);
    const name = canonical ? skillLabel(canonical) : token;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: name.slice(0, 100),
      category: canonical ? (SKILL_CATEGORIES[canonical] ?? "other") : "other",
    });
    if (out.length >= 100) break;
  }
  return out;
}

function extractYears(text: string): number | null {
  const patterns = [
    /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional\s+|relevant\s+)?experience/i,
    /experience\s*(?:of|:)?\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i,
    /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\s+(?:in|with)\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 60) return n;
    }
  }
  return null;
}

function extractEducation(text: string): string[] {
  const out: string[] = [];
  for (const line of linesOf(text)) {
    const value = cleanLine(line).replace(BULLET, "");
    if (!value || value.length > 300) continue;
    if (DEGREE_WORD.test(value)) out.push(value);
  }
  return unique(out, 10);
}

function extractCurrentTitle(text: string): string | null {
  const lines = linesOf(text).slice(0, 60);
  const candidates: string[] = [];
  for (const line of lines) {
    const value = cleanLine(line).replace(BULLET, "");
    if (!value || value.length > 90 || !ROLE_WORD.test(value)) continue;
    if (/[.!?]$/.test(value) && value.split(" ").length > 8) continue;
    candidates.push(value.replace(/^[A-Z][a-z]+ \d{4}\s*[-–]\s*(?:present|[A-Z][a-z]+ \d{4})\s*/i, "").trim());
  }
  return candidates[0] ?? null;
}

function extractLocation(text: string): string | null {
  const lines = linesOf(text).slice(0, 40);
  for (const line of lines) {
    const labelled = /^\s*(?:location|based in|address)\s*[:\-]\s*(.+)$/i.exec(line);
    if (labelled) return cleanLine(labelled[1]).slice(0, 200);
  }
  for (const line of lines) {
    const value = cleanLine(line);
    if (
      DEGREE_WORD.test(value) ||
      /\b(university|college|institute)\b/i.test(value) ||
      /^(skills?|experience|education|projects?|summary|profile)\b/i.test(value)
    ) {
      continue;
    }
    if (/^[A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .'-]+$/.test(value) && value.length <= 80) {
      return value;
    }
  }
  return null;
}

function extractSummary(text: string): string | null {
  const lines = linesOf(text);
  const start = lines.findIndex((l) =>
    /^\s*(professional\s+)?(summary|profile|objective|about)\b/i.test(l),
  );
  if (start >= 0) {
    const parts: string[] = [];
    for (let i = start + 1; i < lines.length && parts.join(" ").length < 1200; i += 1) {
      const value = cleanLine(lines[i]);
      if (!value) {
        if (parts.length > 0) break;
        continue;
      }
      if (/^[A-Z][A-Za-z &/]{2,40}$/.test(value) && !/[.,]/.test(value)) break;
      if (/^(skills?|experience|education|projects?|certifications?|awards?)\b/i.test(value)) break;
      parts.push(value);
    }
    if (parts.length > 0) return parts.join(" ").slice(0, 2000);
  }
  const prose = lines
    .map(cleanLine)
    .filter((l) => l.length >= 60 && !ROLE_WORD.test(l) && !DEGREE_WORD.test(l))
    .slice(0, 2);
  return prose.length > 0 ? prose.join(" ").slice(0, 1200) : null;
}

function extractExperience(text: string): ExtractedExperience[] {
  const lines = linesOf(text);
  const out: ExtractedExperience[] = [];
  for (let i = 0; i < lines.length && out.length < 20; i += 1) {
    const value = cleanLine(lines[i]).replace(BULLET, "");
    if (!value || value.length > 160 || !ROLE_WORD.test(value)) continue;
    const sep = /\s+(?:at|@)\s+|\s+[|—–]\s+|\s+-\s+/.exec(value);
    if (!sep) continue;
    const left = cleanLine(value.slice(0, sep.index));
    const right = cleanLine(value.slice(sep.index + sep[0].length));
    const leftIsRole = ROLE_WORD.test(left);
    const title = (leftIsRole ? left : right).slice(0, 200) || null;
    const company = (leftIsRole ? right : left).slice(0, 200) || null;
    const responsibilities: string[] = [];
    for (let j = i + 1; j < Math.min(lines.length, i + 12); j += 1) {
      const next = cleanLine(lines[j]);
      if (!next) break;
      if (!BULLET.test(lines[j])) break;
      responsibilities.push(next.replace(BULLET, "").slice(0, 1000));
    }
    out.push({
      company,
      title,
      responsibilities: responsibilities.slice(0, 20),
      achievements: [],
      internship: /\bintern(?:ship)?\b/i.test(value),
    });
  }
  return out;
}

function extractProjects(text: string): ExtractedProject[] {
  const lines = linesOf(text);
  const start = lines.findIndex((l) => /^\s*(projects?|portfolio|selected work)\b/i.test(l));
  if (start < 0) return [];
  const out: ExtractedProject[] = [];
  let current: ExtractedProject | null = null;
  for (let i = start + 1; i < lines.length && out.length < 20; i += 1) {
    const raw = lines[i];
    const value = cleanLine(raw).replace(BULLET, "");
    if (!value) continue;
    if (/^\s*(experience|education|skills?|certifications?|awards?)\b/i.test(value)) break;
    const isBullet = BULLET.test(raw);
    if (!isBullet && value.length <= 100) {
      if (current) out.push(current);
      current = {
        name: value.slice(0, 200),
        description: "",
        technologies: skillObjects(value).map((s) => s.name),
      };
      continue;
    }
    if (current) {
      current.description = `${current.description} ${value}`.trim().slice(0, 5000);
      const techs = skillObjects(value).map((s) => s.name);
      current.technologies = unique([...current.technologies, ...techs], 30);
    }
  }
  if (current) out.push(current);
  return out.filter((p) => p.name.length > 0);
}

function deriveLevel(
  years: number | null,
  title: string | null,
  experience: ExtractedExperience[],
): ResumeExtraction["experienceLevel"] {
  if (experience.some((e) => e.internship) || (title ? /\bintern\b/i.test(title) : false)) {
    return "INTERN";
  }
  if (years === null) return null;
  if (years < 1) return "ENTRY";
  if (years < 4) return "MID";
  if (years < 8) return "SENIOR";
  return "LEAD";
}

function explicitWorkMode(text: string): ResumeExtraction["workMode"] {
  if (/prefer(?:red)?\s+(?:fully\s+)?remote|open to (?:fully\s+)?remote|remote (?:work|role|position) preferred/i.test(text)) {
    return "REMOTE";
  }
  if (/prefer(?:red)?\s+hybrid|open to hybrid/i.test(text)) return "HYBRID";
  if (/prefer(?:red)?\s+(?:on-?site|in-?office)|open to on-?site/i.test(text)) return "ONSITE";
  return "ANY";
}

function explicitEmploymentTypes(text: string): string[] {
  const out: string[] = [];
  if (/prefer(?:red)?\s+(?:full[- ]?time)|open to (?:full[- ]?time)/i.test(text)) out.push("Full-time");
  if (/prefer(?:red)?\s+(?:part[- ]?time)|open to (?:part[- ]?time)/i.test(text)) out.push("Part-time");
  if (/prefer(?:red)?\s+(?:contract|contractor)|open to (?:contract|contractor)/i.test(text)) out.push("Contract");
  if (/prefer(?:red)?\s+internship|open to (?:an?\s+)?internship/i.test(text)) out.push("Internship");
  return unique(out, 10);
}

function explicitMinSalary(text: string): number | null {
  const match =
    /(?:expected|minimum|min)\s*(?:salary|ctc|compensation)\s*[:\-]?\s*[^\d]{0,6}([\d,]+)/i.exec(text) ??
    /(?:salary|ctc)\s*(?:expectation|expected)\s*[:\-]?\s*[^\d]{0,6}([\d,]+)/i.exec(text);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Deterministic, conservative extraction used offline or as an AI fallback. */
export function heuristicExtraction(text: string): ResumeExtraction {
  const skills = dedupeSkills([...skillObjects(text), ...skillsFromSection(text)], 200);
  const experience = extractExperience(text);
  const projects = extractProjects(text);
  const years = extractYears(text);
  const currentTitle = extractCurrentTitle(text);
  const education = extractEducation(text);
  const location = extractLocation(text);
  const targetRoles = unique(
    [currentTitle, ...experience.map((e) => e.title)].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    ),
    6,
  );
  const summary = extractSummary(text);
  const experienceLevel = deriveLevel(years, currentTitle, experience);
  const found = [skills.length > 0, Boolean(currentTitle), years !== null, education.length > 0, experience.length > 0, projects.length > 0, Boolean(summary)].filter(Boolean).length;
  return {
    summary,
    currentTitle,
    yearsOfExperience: years,
    education,
    location,
    preferredLocations: [],
    skills,
    experience,
    projects,
    targetRoles,
    workMode: explicitWorkMode(text),
    employmentTypes: explicitEmploymentTypes(text),
    minSalary: explicitMinSalary(text),
    experienceLevel,
    confidence: Math.min(1, Math.round((found / 7) * 100) / 100),
    warnings: ["Extracted with the built-in deterministic parser; review every field before saving."],
  };
}

async function extractWithAi(text: string): Promise<ResumeExtraction | null> {
  if (!describeGenerationConfig().configured) return null;
  try {
    const provider = getGenerationProvider();
    const { text: output } = await provider.generateText({
      systemPrompt: AI_SYSTEM_PROMPT,
      userPrompt: `RESUME_TEXT_START\n${text.slice(0, 30_000)}\nRESUME_TEXT_END`,
      maxOutputTokens: 2500,
    });
    const parsed = JSON.parse(output) as unknown;
    const validated = ResumeExtractionSchema.safeParse(parsed);
    if (!validated.success) return null;
    return {
      ...validated.data,
      warnings: unique(
        [...validated.data.warnings, "Extracted with the configured AI provider; review before saving."],
        20,
      ),
    };
  } catch {
    return null;
  }
}

export interface ParseResumeResult {
  extraction: ResumeExtraction;
  provider: "ai" | "heuristic";
}

/** Read the stored extraction for review; null until the resume is parsed. */
export async function getResumeExtraction(
  userId: string,
  resumeId: string,
): Promise<ResumeExtraction | null> {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw notFound("Resume not found");
  if (!resume.parsedJson) return null;
  const parsed = ResumeExtractionSchema.safeParse(resume.parsedJson);
  return parsed.success ? parsed.data : null;
}

export async function parseResume(userId: string, resumeId: string): Promise<ParseResumeResult> {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw notFound("Resume not found");
  if (!resume.storageKey) throw badRequest("This resume has no uploaded document to parse.");

  await prisma.resume.update({
    where: { id: resume.id },
    data: { status: "PARSING", parseError: null },
  });

  try {
    const buffer = await readDocument(resume.storageKey);
    const text = await extractDocumentText(buffer, resume.mimeType ?? "");
    const ai = await extractWithAi(text);
    const extraction = ai ?? heuristicExtraction(text);
    await prisma.resume.update({
      where: { id: resume.id },
      data: {
        parsedText: text,
        parsedJson: extraction,
        status: "PARSED",
        parsedAt: new Date(),
        parseError: null,
        ...(extraction.currentTitle && resume.targetRoles.length === 0
          ? { targetRoles: extraction.targetRoles.slice(0, 20) }
          : {}),
      },
    });
    return { extraction, provider: ai ? "ai" : "heuristic" };
  } catch (err) {
    const status = (err as { status?: unknown })?.status;
    const message =
      err instanceof Error && typeof status === "number" && status < 500
        ? err.message
        : "Could not analyse this document. Try a text-based PDF or DOCX.";
    await prisma.resume.update({
      where: { id: resume.id },
      data: { status: "FAILED", parseError: message.slice(0, 500) },
    });
    throw unprocessable(message);
  }
}
