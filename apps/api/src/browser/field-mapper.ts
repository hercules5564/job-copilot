import type { FieldMapping, FormFieldType } from "@jobcopilot/shared";
import type { PageFormField } from "./types.js";

/**
 * Phase 7 — deterministic field mapping (no LLM).
 * Sensitive fields are detected FIRST and quarantined as
 * UNSUPPORTED_SENSITIVE_FIELD: never stored as answers, never filled.
 */

const SENSITIVE_PATTERNS = [
  "password",
  "passwd",
  "passcode",
  "ssn",
  "social security",
  "credit card",
  "card number",
  "cvv",
  "cvc",
  "bank account",
  "routing number",
  "iban",
  "otp",
  "one-time",
  "auth code",
  "authentication code",
  "verification code",
  "verify code",
  "2fa",
  "two-factor",
  "mfa code",
  "pin code",
];

export function isSensitiveField(field: { type: string; name: string; label: string; placeholder: string; autocomplete: string }): boolean {
  if (field.type.toLowerCase() === "password") return true;
  const hay = `${field.name} ${field.label} ${field.placeholder} ${field.autocomplete}`.toLowerCase();
  if (/\bcc\b|\bexp(iry|iration)\b/.test(` ${hay} `) && /card|credit|payment/.test(hay)) return true;
  return SENSITIVE_PATTERNS.some((p) => hay.includes(p));
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const MAPPING_RULES: { mapping: Exclude<FieldMapping, "UNKNOWN" | "UNSUPPORTED_SENSITIVE_FIELD">; terms: string[] }[] = [
  { mapping: "candidate.email", terms: ["email", "e-mail"] },
  { mapping: "candidate.phone", terms: ["phone", "mobile", "telephone", "contact number", "phone number"] },
  { mapping: "candidate.githubUrl", terms: ["github", "git hub"] },
  { mapping: "candidate.linkedinUrl", terms: ["linkedin", "linked in"] },
  { mapping: "candidate.portfolioUrl", terms: ["portfolio", "personal website", "personal site", "website", "site url"] },
  { mapping: "candidate.experience", terms: ["years of experience", "years experience", "yoe", "work experience", "experience (years)"] },
  { mapping: "candidate.education", terms: ["education", "degree", "university", "college", "school", "major", "field of study"] },
  { mapping: "candidate.skills", terms: ["skills", "tech stack", "technologies", "programming languages"] },
  { mapping: "candidate.location", terms: ["location", "city", "address", "country", "current location", "where are you based"] },
  { mapping: "candidate.coverLetter", terms: ["cover letter", "why do you want", "why are you interested", "motivation", "why should we hire", "why this role", "pitch"] },
  { mapping: "candidate.projects", terms: ["projects", "relevant work", "past work", "describe a project", "side project"] },
];

const AUTOCOMPLETE_MAP: Record<string, FieldMapping> = {
  email: "candidate.email",
  name: "candidate.fullName",
  "given-name": "candidate.fullName",
  "family-name": "candidate.fullName",
  "tel-national": "candidate.phone",
  tel: "candidate.phone",
  url: "candidate.portfolioUrl",
  "street-address": "candidate.location",
  "address-level2": "candidate.location",
  "address-level1": "candidate.location",
  "country-name": "candidate.location",
};

export function mapFieldType(rawType: string): FormFieldType {
  const t = rawType.toLowerCase();
  if (t === "password") return "unsupported";
  if (t === "email") return "email";
  if (t === "tel") return "phone";
  if (t === "url") return "url";
  if (t === "textarea") return "textarea";
  if (t === "select") return "select";
  if (t === "radio") return "radio";
  if (t === "checkbox" || t === "checkbox-group") return "checkbox";
  if (t === "file") return "file";
  if (t === "hidden" || t === "submit" || t === "button" || t === "image") return "unsupported";
  if (t === "number") return "text";
  return "unknown";
}

export function mapField(field: PageFormField): { mapping: FieldMapping; fieldType: FormFieldType } {
  if (isSensitiveField(field)) return { mapping: "UNSUPPORTED_SENSITIVE_FIELD", fieldType: "unsupported" };
  const fieldType = mapFieldType(field.type);
  if (fieldType === "unsupported") return { mapping: "UNSUPPORTED_SENSITIVE_FIELD", fieldType };
  const auto = norm(field.autocomplete);
  if (auto && AUTOCOMPLETE_MAP[auto]) return { mapping: AUTOCOMPLETE_MAP[auto], fieldType };
  // File inputs are resume uploads: mapped so the UI shows which resume to
  // attach, but always NEEDS_USER_INPUT (never auto-filled).
  if (fieldType === "file") return { mapping: "candidate.resume", fieldType };
  const hay = ` ${norm(`${field.label} ${field.name} ${field.placeholder}`)} `;
  for (const rule of MAPPING_RULES) {
    for (const term of rule.terms) {
      if (hay.includes(` ${term} `) || hay.includes(` ${term}s `)) {
        return { mapping: rule.mapping, fieldType };
      }
    }
  }
  // Full name: specific forms first, then bare "name" — never company/org names.
  if (/\bfirst name\b|\blast name\b|\bfull name\b|\byour name\b|\bapplicant name\b/.test(hay)) {
    return { mapping: "candidate.fullName", fieldType };
  }
  if (/\bname\b/.test(hay) && !/company|organization|organisation|employer|referrer|emergency/.test(hay)) {
    return { mapping: "candidate.fullName", fieldType };
  }
  return { mapping: "UNKNOWN", fieldType };
}
