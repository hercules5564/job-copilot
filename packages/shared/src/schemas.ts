import { z } from "zod";
import { ApplicationStatusSchema } from "./application-status.js";

/** Truthfulness boundary: AI must never invent these. */
export const ProfilePreferencesSchema = z.object({
  targetRoles: z.array(z.string().min(1)).default([]),
  skills: z.array(z.string().min(1)).default([]),
  minSalary: z.number().nonnegative().nullable().default(null),
  preferredSalary: z.number().nonnegative().nullable().default(null),
  salaryCurrency: z.string().default("USD"),
  preferredLocations: z.array(z.string().min(1)).default([]),
  workMode: z.enum(["REMOTE", "HYBRID", "ONSITE", "ANY"]).default("ANY"),
  employmentTypes: z.array(z.string()).default([]),
  noticePeriodDays: z.number().int().nonnegative().nullable().default(null),
  workAuthorization: z.array(z.string()).default([]),
  preferredIndustries: z.array(z.string()).default([]),
  preferredCompanies: z.array(z.string()).default([]),
  excludedCompanies: z.array(z.string()).default([]),
});

export type ProfilePreferences = z.infer<typeof ProfilePreferencesSchema>;

export const UpdateProfileSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  headline: z.string().max(300).optional().nullable(),
  summary: z.string().max(5000).optional().nullable(),
  yearsOfExperience: z.number().nonnegative().max(80).optional().nullable(),
  education: z.unknown().optional(), // structured JSON, validated at service layer
  preferences: ProfilePreferencesSchema.partial().optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  technologies: z.array(z.string().min(1)).default([]),
  role: z.string().max(200).optional().nullable(),
  contributions: z.string().max(5000).optional().nullable(),
  achievements: z.string().max(5000).optional().nullable(),
  githubUrl: z.string().url().optional().nullable(),
  liveUrl: z.string().url().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const CreateJobSchema = z.object({
  title: z.string().min(1).max(300),
  company: z.string().min(1).max(300),
  location: z.string().max(300).optional().nullable(),
  remote: z.boolean().default(false),
  employmentType: z.string().max(100).optional().nullable(),
  salaryMin: z.number().nonnegative().optional().nullable(),
  salaryMax: z.number().nonnegative().optional().nullable(),
  salaryCurrency: z.string().max(10).default("USD"),
  description: z.string().min(1),
  sourceUrl: z.string().url().optional().nullable(),
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export const ApplicationModeSchema = z.enum(["AUTO", "APPROVAL", "MANUAL"]);

export const CreateApplicationSchema = z.object({
  jobId: z.string().min(1),
  resumeId: z.string().min(1).optional().nullable(),
  mode: ApplicationModeSchema.default("MANUAL"),
  // SECURITY: any `userId` supplied in a request body is ignored.
  // Ownership always derives from the authenticated identity (requireAuth).
});

export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>;

export const UpdateApplicationSchema = z.object({
  resumeId: z.string().min(1).optional().nullable(),
  mode: ApplicationModeSchema.optional(),
});

export type UpdateApplicationInput = z.infer<typeof UpdateApplicationSchema>;

export const TransitionApplicationSchema = z.object({
  toStatus: ApplicationStatusSchema,
  note: z.string().max(2000).optional().nullable(),
});

export type TransitionApplicationInput = z.infer<
  typeof TransitionApplicationSchema
>;

// ---- Phase 2: CRUD schemas (all userId-scoped server-side) ----

export const CreateResumeSchema = z.object({
  name: z.string().min(1).max(200),
  targetRoles: z.array(z.string().min(1)).default([]),
  isActive: z.boolean().default(true),
  fileUrl: z.string().url().max(2000).optional().nullable(),
  parsedText: z.string().max(100000).optional().nullable(),
});

export type CreateResumeInput = z.infer<typeof CreateResumeSchema>;

export const UpdateResumeSchema = CreateResumeSchema.partial();

export type UpdateResumeInput = z.infer<typeof UpdateResumeSchema>;

export const UpdateProjectSchema = CreateProjectSchema.partial();

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export const UpdateJobSchema = CreateJobSchema.partial();

export type UpdateJobInput = z.infer<typeof UpdateJobSchema>;

const scoreField = z.number().int().min(0).max(100);

export const JobMatchUpsertSchema = z.object({
  jobId: z.string().min(1),
  overallScore: scoreField,
  skillScore: scoreField.default(0),
  experienceScore: scoreField.default(0),
  educationScore: scoreField.default(0),
  projectScore: scoreField.default(0),
  locationScore: scoreField.default(0),
  salaryScore: scoreField.default(0),
  employmentTypeScore: scoreField.default(0),
  workAuthScore: scoreField.default(0),
  reasons: z.array(z.string()).default([]),
  missingRequirements: z.array(z.string()).default([]),
  riskFlags: z.array(z.string()).default([]),
  recommendedProjectIds: z.array(z.string()).default([]),
});

export type JobMatchUpsertInput = z.infer<typeof JobMatchUpsertSchema>;

export const UpdateJobMatchSchema = JobMatchUpsertSchema.omit({ jobId: true }).partial();

export type UpdateJobMatchInput = z.infer<typeof UpdateJobMatchSchema>;

/** GET /api/notifications — explicit string flag (coerce.Boolean("false") is true!). */
export const NotificationsQuerySchema = z.object({
  unreadOnly: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type NotificationsQuery = z.infer<typeof NotificationsQuerySchema>;
