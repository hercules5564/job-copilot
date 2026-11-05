import { z } from "zod";

/**
 * Phase 22 — resume/portfolio-based job discovery contracts.
 * Extraction is intentionally conservative: every field is optional and
 * defaults to "unknown" so missing resume data is never invented.
 */

export const WorkModeSchema = z.enum(["REMOTE", "HYBRID", "ONSITE", "ANY"]);
export type WorkMode = z.infer<typeof WorkModeSchema>;

export const ExperienceLevelSchema = z.enum(["INTERN", "ENTRY", "MID", "SENIOR", "LEAD"]);
export type ExperienceLevel = z.infer<typeof ExperienceLevelSchema>;

export const SkillCategorySchema = z.enum([
  "language",
  "framework",
  "database",
  "cloud",
  "devops",
  "tool",
  "platform",
  "other",
]);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

function stringArray(max: number, itemMax = 200) {
  return z.array(z.string().trim().min(1).max(itemMax)).max(max).default([]);
}

export const ExtractedSkillSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: SkillCategorySchema.default("other"),
});
export type ExtractedSkill = z.infer<typeof ExtractedSkillSchema>;

export const ExtractedExperienceSchema = z.object({
  company: z.string().trim().max(200).nullable().default(null),
  title: z.string().trim().max(200).nullable().default(null),
  responsibilities: stringArray(20, 1000),
  achievements: stringArray(20, 1000),
  internship: z.boolean().default(false),
});
export type ExtractedExperience = z.infer<typeof ExtractedExperienceSchema>;

export const ExtractedProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(""),
  technologies: stringArray(30, 100),
});
export type ExtractedProject = z.infer<typeof ExtractedProjectSchema>;

export const ResumeExtractionSchema = z.object({
  summary: z.string().trim().max(5000).nullable().default(null),
  currentTitle: z.string().trim().max(200).nullable().default(null),
  yearsOfExperience: z.number().nonnegative().max(80).nullable().default(null),
  education: stringArray(20, 500),
  location: z.string().trim().max(200).nullable().default(null),
  preferredLocations: stringArray(20),
  skills: z.array(ExtractedSkillSchema).max(200).default([]),
  experience: z.array(ExtractedExperienceSchema).max(50).default([]),
  projects: z.array(ExtractedProjectSchema).max(50).default([]),
  targetRoles: stringArray(20),
  workMode: WorkModeSchema.default("ANY"),
  employmentTypes: stringArray(10, 100),
  minSalary: z.number().nonnegative().nullable().default(null),
  experienceLevel: ExperienceLevelSchema.nullable().default(null),
  /** 0–1 heuristic confidence (never used as a match score). */
  confidence: z.number().min(0).max(1).default(0),
  warnings: z.array(z.string().max(500)).max(20).default([]),
});
export type ResumeExtraction = z.infer<typeof ResumeExtractionSchema>;

export const ConfirmExtractionSchema = z.object({
  extraction: ResumeExtractionSchema,
  portfolioUrl: z.string().url().max(2000).nullable().optional(),
  githubUrl: z.string().url().max(2000).nullable().optional(),
  linkedinUrl: z.string().url().max(2000).nullable().optional(),
  setActive: z.boolean().default(true),
});
export type ConfirmExtractionInput = z.infer<typeof ConfirmExtractionSchema>;

export const AnalyzePortfolioSchema = z.object({
  url: z.string().url().max(2000),
});
export type AnalyzePortfolioInput = z.infer<typeof AnalyzePortfolioSchema>;

export const PortfolioAnalysisSchema = z.object({
  accessible: z.boolean(),
  url: z.string(),
  kind: z.enum(["website", "github"]).default("website"),
  projects: z.array(ExtractedProjectSchema).max(50).default([]),
  skills: z.array(ExtractedSkillSchema).max(200).default([]),
  error: z.string().max(500).nullable().default(null),
  warnings: z.array(z.string().max(500)).max(20).default([]),
});
export type PortfolioAnalysis = z.infer<typeof PortfolioAnalysisSchema>;

export const RecommendationSortSchema = z.enum(["score", "recent", "salary"]);
export type RecommendationSort = z.infer<typeof RecommendationSortSchema>;

export const RecommendationsQuerySchema = z.object({
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  role: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  workMode: WorkModeSchema.optional(),
  employmentType: z.string().trim().max(100).optional(),
  experienceLevel: ExperienceLevelSchema.optional(),
  postedWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  sort: RecommendationSortSchema.default("score"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type RecommendationsQuery = z.infer<typeof RecommendationsQuerySchema>;

export const RunRecommendationsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  mode: z.enum(["deterministic", "semantic", "hybrid"]).optional(),
  async: z.boolean().default(false),
});
export type RunRecommendationsInput = z.infer<typeof RunRecommendationsSchema>;

export const SaveJobSchema = z.object({
  jobId: z.string().min(1),
});
export type SaveJobInput = z.infer<typeof SaveJobSchema>;
