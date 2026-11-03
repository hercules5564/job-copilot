import { isProduction, SESSION_COOKIE_NAME, SESSION_TTL_MS } from "./auth-config.js";

/**
 * Phase 9 — session cookie helpers (no external cookie dependency).
 * The cookie carries an opaque random token. The DB stores only its
 * SHA-256 hash. Nothing here logs or returns secrets.
 */

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[name] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

export function getSessionToken(cookieHeader: string | undefined): string | null {
  const token = parseCookies(cookieHeader)[SESSION_COOKIE_NAME];
  if (!token || token.length < 20 || token.length > 500) return null;
  if (!/^[A-Za-z0-9\-_]+$/.test(token)) return null;
  return token;
}

function cookieAttributes(maxAgeSeconds: number): string {
  const parts = [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isProduction()) parts.push("Secure");
  return parts.join("; ");
}

/** Set-Cookie value that establishes the session (raw token leaves only here). */
export function serializeSessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieAttributes(Math.floor(SESSION_TTL_MS / 1000))}`;
}

/** Set-Cookie value that clears the session (logout, idempotent). */
export function serializeClearCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction() ? "; Secure" : ""}`;
}
