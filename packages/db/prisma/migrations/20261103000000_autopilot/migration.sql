-- Phase 20: autopilot settings on discovery configs.
-- Autopilot prepares applications up to a filled form; submission stays
-- human-confirmed, so no submission flag is stored here.
ALTER TABLE "discovery_configs"
  ADD COLUMN "autopilotEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autopilotMinScore" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN "autopilotMaxPerRun" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "autopilotResumeId" TEXT,
  ADD COLUMN "autopilotLastRunAt" TIMESTAMP(3),
  ADD COLUMN "autopilotLastSummary" JSONB;
