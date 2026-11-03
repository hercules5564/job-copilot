-- Phase 4: explainable matching columns on JobMatch.
-- All columns carry defaults, so existing rows remain valid (no data loss).

-- AlterTable
ALTER TABLE "job_matches" ADD COLUMN "decision" TEXT NOT NULL DEFAULT 'LOW_MATCH';
ALTER TABLE "job_matches" ADD COLUMN "roleScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "job_matches" ADD COLUMN "matchedSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "job_matches" ADD COLUMN "missingSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "job_matches" ADD COLUMN "matchedRequirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "job_matches" ADD COLUMN "uncertainRequirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "job_matches" ADD COLUMN "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
