-- Phase 8: safe run recovery + headed manual-login metadata.
-- All columns defaulted/optional: existing rows remain valid.
-- No cookies, storage state, tokens, or credentials are persisted here.

-- AlterTable
ALTER TABLE "browser_sessions" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'HEADLESS';
ALTER TABLE "browser_sessions" ADD COLUMN "adapterId" TEXT;

ALTER TABLE "application_runs" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "application_runs" ADD COLUMN "resumedFromRunId" TEXT;
ALTER TABLE "application_runs" ADD COLUMN "recoveryReason" TEXT;
ALTER TABLE "application_runs" ADD COLUMN "submissionConfirmedAt" TIMESTAMP(3);
ALTER TABLE "application_runs" ADD COLUMN "lastSafeCheckpoint" TEXT;
ALTER TABLE "application_runs" ADD COLUMN "submissionUnverified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "application_runs_resumedFromRunId_idx" ON "application_runs"("resumedFromRunId");
