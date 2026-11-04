-- Phase 21: email + password authentication.
-- Google-only accounts keep passwordHash NULL. The value is a scrypt hash
-- (salt + parameters encoded) and is never returned by any API.
ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT;
