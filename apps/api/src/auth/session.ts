import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@jobcopilot/db";
import { LAST_SEEN_UPDATE_MS, SESSION_TTL_MS } from "./auth-config.js";

/**
 * Phase 9 — server-side session store.
 * Tokens are cryptographically random (32 bytes, base64url). Only the
 * SHA-256 hex hash is persisted. Logs carry session ids, never tokens.
 */

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface SessionRecord {
  id: string;
  userId: string;
}

function logSession(event: string, sessionId: string, userId: string): void {
  console.log(JSON.stringify({ level: "info", component: "auth-session", event, sessionId, userId }));
}

/** Create a fresh session (new login / rotation). Never reuses tokens. */
export async function createSession(
  userId: string,
  opts: { userAgent?: string } = {},
): Promise<{ token: string; id: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const row = await prisma.authSession.create({
    data: {
      userId,
      sessionTokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: opts.userAgent?.slice(0, 200) ?? null,
    },
  });
  logSession("session_created", row.id, userId);
  return { token, id: row.id, expiresAt: row.expiresAt };
}

/**
 * Validate a presented token: hash lookup, revocation + expiry checks,
 * throttled lastSeenAt refresh. Expired rows are revoked lazily so they
 * can never validate again. Returns null for every failure mode alike
 * (no user/session existence oracle).
 */
export async function validateSession(token: string): Promise<SessionRecord | null> {
  const hash = hashSessionToken(token);
  const row = await prisma.authSession.findUnique({ where: { sessionTokenHash: hash } });
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) {
    if (row && !row.revokedAt && row.expiresAt.getTime() <= Date.now()) {
      await prisma.authSession.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
    }
    return null;
  }
  if (row.lastSeenAt.getTime() + LAST_SEEN_UPDATE_MS < Date.now()) {
    await prisma.authSession.update({
      where: { id: row.id },
      data: { lastSeenAt: new Date() },
    });
  }
  return { id: row.id, userId: row.userId };
}

/** Revoke one session (logout). Idempotent: unknown tokens are a no-op. */
export async function revokeSession(token: string): Promise<void> {
  const hash = hashSessionToken(token);
  const row = await prisma.authSession.findUnique({ where: { sessionTokenHash: hash } });
  if (!row || row.revokedAt) return;
  await prisma.authSession.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  logSession("session_revoked", row.id, row.userId);
}

/** Safe public user payload for GET /api/auth/me (no secrets, ever). */
export async function getSafeUser(userId: string): Promise<{
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
} | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
  };
}
