import { z } from "zod";

/**
 * Phase 10B — discovery configuration + hiring-signal contracts.
 * Discovery reuses Profile preferences as defaults; explicit config wins.
 * All values bounded. Hiring signals are evidence, never predictions.
 */

/** Board tokens for board-based public sources (charset-validated, never URLs). */
export const SourceBoardSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Board tokens must be lowercase alphanumeric with hyphens");

export type SourceBoard = z.infer<typeof SourceBoardSchema>;

const stringArray = (max: number) =>
  z
    .array(z.string().trim().min(1).max(200))
    .max(max)
    .default([]);

/** PUT /api/discovery/config — full replacement, all fields bounded. */
export const DiscoveryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  targetRoles: stringArray(20),
  targetLocations: stringArray(20),
  remoteOnly: z.boolean().default(false),
  minimumSalary: z.number().nonnegative().max(100_000_000).optional().nullable(),
  employmentTypes: stringArray(20),
  experienceLevels: stringArray(20),
  preferredSkills: stringArray(50),
  excludedKeywords: stringArray(50),
  sourceKeys: z.array(z.string().trim().min(1).max(100)).min(1).max(5).default(["arbeitnow"]),
  boards: z.array(SourceBoardSchema).max(5).default([]),
  maxJobsPerRun: z.number().int().min(1).max(50).default(20),
  scheduleEnabled: z.boolean().default(false),
  scheduleIntervalHours: z.number().int().min(1).max(168).default(24),
  // Phase 20: autopilot prepares applications up to a filled form. It never
  // submits; the human still confirms submission on the run.
  autopilotEnabled: z.boolean().default(false),
  autopilotMinScore: z.number().int().min(0).max(100).default(80),
  autopilotMaxPerRun: z.number().int().min(1).max(10).default(3),
  autopilotResumeId: z.string().trim().min(1).max(200).optional().nullable(),
});

export type DiscoveryConfigInput = z.infer<typeof DiscoveryConfigSchema>;

/** Service-layer input (pre-default application): all fields optional. */
export type DiscoveryConfigRequest = z.input<typeof DiscoveryConfigSchema>;

/** POST /api/discovery/run — always async (202). */
export const DiscoveryRunRequestSchema = z.object({
  sourceKeys: z.array(z.string().trim().min(1).max(100)).min(1).max(3).optional(),
});

export type DiscoveryRunRequest = z.infer<typeof DiscoveryRunRequestSchema>;

/** Closed hiring-signal types. Only JOB_POSTING is produced in Phase 10B. */
export const HiringSignalTypeSchema = z.enum([
  "JOB_POSTING",
  "OFFICIAL_HIRING_ANNOUNCEMENT",
  "CAREERS_PAGE_UPDATE",
  "PUBLIC_HIRING_FEED",
]);

export type HiringSignalType = z.infer<typeof HiringSignalTypeSchema>;

export const HiringSignalQuerySchema = z.object({
  type: HiringSignalTypeSchema.optional(),
  company: z.string().trim().min(1).max(200).optional(),
  source: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export type HiringSignalQuery = z.infer<typeof HiringSignalQuerySchema>;

/** Discovery background job payload (references only — never credentials). */
export const DiscoveryJobPayloadSchema = z.object({
  userId: z.string().min(1).max(200),
  discoveryConfigId: z.string().min(1).max(200),
  sourceKeys: z.array(z.string().min(1).max(100)).min(1).max(5),
  requestedAt: z.string().min(1).max(100),
  idempotencyKey: z.string().min(1).max(200),
});

export type DiscoveryJobPayload = z.infer<typeof DiscoveryJobPayloadSchema>;

/** Bounded discovery result (summaries only — never full records in Redis). */
export const DiscoverySummarySchema = z.object({
  sourcesAttempted: z.number().int().nonnegative(),
  sourcesSucceeded: z.number().int().nonnegative(),
  discovered: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  matchingQueued: z.boolean(),
  signalsCreated: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});

export type DiscoverySummary = z.infer<typeof DiscoverySummarySchema>;
