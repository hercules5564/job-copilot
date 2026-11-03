-- Phase 5: semantic matching metadata on JobMatch.
-- All columns are optional/defaulted, so existing rows remain valid.
-- Raw embedding vectors are never stored (cache is in-memory only).

-- AlterTable
ALTER TABLE "job_matches" ADD COLUMN "semanticScore" INTEGER;
ALTER TABLE "job_matches" ADD COLUMN "matchMode" TEXT NOT NULL DEFAULT 'deterministic';
ALTER TABLE "job_matches" ADD COLUMN "semanticProvider" TEXT;
ALTER TABLE "job_matches" ADD COLUMN "semanticModel" TEXT;
