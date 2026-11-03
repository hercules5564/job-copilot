-- Phase 6: Gmail + application tracking.
-- Integration gains account metadata (all optional: existing rows valid).
-- New EmailMessage table stores normalized metadata only (no attachments).
-- ApplicationEvent/Notification gain optional evidence references.

-- AlterTable
ALTER TABLE "integrations" ADD COLUMN "accountEmail" TEXT;
ALTER TABLE "integrations" ADD COLUMN "providerAccountId" TEXT;
ALTER TABLE "integrations" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DISCONNECTED';
ALTER TABLE "integrations" ADD COLUMN "tokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "integrations" ADD COLUMN "connectedAt" TIMESTAMP(3);
ALTER TABLE "integrations" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
ALTER TABLE "integrations" ADD COLUMN "lastSyncError" TEXT;

ALTER TABLE "application_events" ADD COLUMN "emailMessageId" TEXT;

ALTER TABLE "notifications" ADD COLUMN "applicationId" TEXT;
ALTER TABLE "notifications" ADD COLUMN "emailMessageId" TEXT;

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google-gmail',
    "providerMessageId" TEXT NOT NULL,
    "threadId" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL DEFAULT '',
    "snippet" TEXT NOT NULL DEFAULT '',
    "bodyText" TEXT NOT NULL DEFAULT '',
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "classificationScore" INTEGER NOT NULL DEFAULT 0,
    "classificationReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "applicationId" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchReason" TEXT,
    "matchCandidates" JSONB,
    "emailEventCreated" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_userId_provider_providerMessageId_key" ON "email_messages"("userId", "provider", "providerMessageId");

-- CreateIndex
CREATE INDEX "email_messages_userId_receivedAt_idx" ON "email_messages"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "email_messages_applicationId_idx" ON "email_messages"("applicationId");

-- CreateIndex
CREATE INDEX "application_events_emailMessageId_idx" ON "application_events"("emailMessageId");

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
