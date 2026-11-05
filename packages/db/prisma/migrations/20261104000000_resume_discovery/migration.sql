-- Phase 22: resume/portfolio-based job discovery

ALTER TABLE "profiles"
  ADD COLUMN "portfolioUrl" TEXT,
  ADD COLUMN "githubUrl" TEXT,
  ADD COLUMN "linkedinUrl" TEXT,
  ADD COLUMN "experienceLevel" TEXT;

ALTER TABLE "resumes"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'RESUME',
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "sizeBytes" INTEGER,
  ADD COLUMN "originalName" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'UPLOADED',
  ADD COLUMN "parseError" TEXT,
  ADD COLUMN "parsedAt" TIMESTAMP(3);

CREATE TABLE "saved_jobs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_jobs_userId_jobId_key" ON "saved_jobs"("userId", "jobId");
CREATE INDEX "saved_jobs_userId_createdAt_idx" ON "saved_jobs"("userId", "createdAt");

ALTER TABLE "saved_jobs"
  ADD CONSTRAINT "saved_jobs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saved_jobs"
  ADD CONSTRAINT "saved_jobs_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
