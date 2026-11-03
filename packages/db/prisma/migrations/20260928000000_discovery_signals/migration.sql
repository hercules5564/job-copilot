-- CreateEnum
CREATE TYPE "HiringSignalType" AS ENUM ('JOB_POSTING', 'OFFICIAL_HIRING_ANNOUNCEMENT', 'CAREERS_PAGE_UPDATE', 'PUBLIC_HIRING_FEED');

-- CreateTable
CREATE TABLE "discovery_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "remoteOnly" BOOLEAN NOT NULL DEFAULT false,
    "minimumSalary" DOUBLE PRECISION,
    "employmentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experienceLevels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceKeys" TEXT[] DEFAULT ARRAY['arbeitnow']::TEXT[],
    "boards" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxJobsPerRun" INTEGER NOT NULL DEFAULT 20,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovery_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hiring_signals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "companyName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" "HiringSignalType" NOT NULL DEFAULT 'JOB_POSTING',
    "title" TEXT NOT NULL,
    "url" TEXT,
    "evidenceSummary" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "relatedJobId" TEXT,
    "dedupKey" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hiring_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discovery_configs_userId_key" ON "discovery_configs"("userId");

-- CreateIndex
CREATE INDEX "hiring_signals_userId_detectedAt_idx" ON "hiring_signals"("userId", "detectedAt");

-- CreateIndex
CREATE INDEX "hiring_signals_userId_companyId_idx" ON "hiring_signals"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "hiring_signals_userId_source_type_dedupKey_key" ON "hiring_signals"("userId", "source", "type", "dedupKey");

-- AddForeignKey
ALTER TABLE "discovery_configs" ADD CONSTRAINT "discovery_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hiring_signals" ADD CONSTRAINT "hiring_signals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hiring_signals" ADD CONSTRAINT "hiring_signals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hiring_signals" ADD CONSTRAINT "hiring_signals_relatedJobId_fkey" FOREIGN KEY ("relatedJobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

