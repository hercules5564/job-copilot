-- Phase 3: enforce strongest dedup identifier (source + externalId) at the
-- database level so concurrent ingestions stay idempotent even when the
-- fingerprint differs. Rows with NULL externalId (manual jobs) are
-- unaffected: PostgreSQL treats NULLs as distinct in unique constraints.

-- CreateIndex
CREATE UNIQUE INDEX "jobs_userId_sourceKey_externalId_key" ON "jobs"("userId", "sourceKey", "externalId");
