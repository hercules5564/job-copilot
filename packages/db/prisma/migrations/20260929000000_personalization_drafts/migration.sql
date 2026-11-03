-- CreateTable
CREATE TABLE "personalization_drafts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "jobId" TEXT,
    "jobTitle" TEXT NOT NULL,
    "jobCompany" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'APPLICATION_DRAFT',
    "status" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "content" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL DEFAULT 'p15-v1',
    "userEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personalization_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personalization_drafts_userId_applicationId_idx" ON "personalization_drafts"("userId", "applicationId");

-- AddForeignKey
ALTER TABLE "personalization_drafts" ADD CONSTRAINT "personalization_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalization_drafts" ADD CONSTRAINT "personalization_drafts_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personalization_drafts" ADD CONSTRAINT "personalization_drafts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
