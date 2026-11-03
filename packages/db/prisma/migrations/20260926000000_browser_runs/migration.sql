-- Phase 7: browser automation metadata + human-approved application runs.
-- Live browser handles stay in server memory; no cookies, storage state,
-- or credentials are persisted here. All tables are user-scoped.

-- CreateTable
CREATE TABLE "browser_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'playwright',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "currentUrl" TEXT,
    "currentTitle" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "browser_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sessionId" TEXT,
    "adapter" TEXT NOT NULL DEFAULT 'demo',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "currentStep" TEXT NOT NULL DEFAULT 'created',
    "targetUrl" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_answers" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "fieldType" TEXT NOT NULL DEFAULT 'unknown',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "mapping" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "proposedValue" TEXT NOT NULL DEFAULT '',
    "editedValue" TEXT,
    "source" TEXT NOT NULL DEFAULT 'none',
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "filled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "browser_sessions_userId_status_idx" ON "browser_sessions"("userId", "status");

-- CreateIndex
CREATE INDEX "application_runs_userId_status_idx" ON "application_runs"("userId", "status");

-- CreateIndex
CREATE INDEX "application_runs_applicationId_createdAt_idx" ON "application_runs"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "application_answers_runId_fieldId_key" ON "application_answers"("runId", "fieldId");

-- AddForeignKey
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_runs" ADD CONSTRAINT "application_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_runs" ADD CONSTRAINT "application_runs_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_runs" ADD CONSTRAINT "application_runs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_runs" ADD CONSTRAINT "application_runs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "browser_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_runId_fkey" FOREIGN KEY ("runId") REFERENCES "application_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
