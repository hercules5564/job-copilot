/**
 * Phase 9 — application authentication configuration.
 * App login (Google OIDC + server sessions) is independent from Gmail
 * integration tokens. GOOGLE_AUTH_* vars are preferred; the client
 * id/secret fall back to the Gmail GOOGLE_* vars so operators are not
 * forced to create a second OAuth client — this fallback is deliberate
 * and documented (README: authentication).
 */

export const SESSION_COOKIE_NAME = "jobpilot_session";

/** Absolute session lifetime: 30 days. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Throttle lastSeenAt writes to at most one per hour. */
export const LAST_SEEN_UPDATE_MS = 60 * 60 * 1000;

/** OAuth state single-use window: 10 minutes. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function readSecret(): string {
  return process.env.AUTH_SESSION_SECRET ?? process.env.SESSION_SECRET ?? "";
}

/** HMAC/secret readiness for OAuth state signing (fail closed when absent). */
export function authSecretReady(): boolean {
  return readSecret().length >= 32;
}

export function authSecret(): string {
  const secret = readSecret();
  if (secret.length < 32) {
    throw new Error("Application authentication requires AUTH_SESSION_SECRET (min 32 chars)");
  }
  return secret;
}

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function googleAuthConfig(): GoogleAuthConfig | null {
  const clientId = process.env.GOOGLE_AUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_AUTH_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
  const redirectUri =
    process.env.GOOGLE_AUTH_REDIRECT_URI ?? "http://localhost:4000/api/auth/google/callback";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

let warnedDevBypassProduction = false;

/**
 * Explicit development/test-only auth bypass. NEVER active in production:
 * even AUTH_DEV_BYPASS=true is ignored when NODE_ENV=production (fail closed).
 * Tests enable it via vitest env; production has no default fake user.
 */
export function devBypassEnabled(): boolean {
  if (isProduction()) {
    if (process.env.AUTH_DEV_BYPASS && !warnedDevBypassProduction) {
      warnedDevBypassProduction = true;
      console.warn(
        JSON.stringify({
          level: "warn",
          component: "auth",
          event: "dev_bypass_ignored_in_production",
        }),
      );
    }
    return false;
  }
  const raw = (process.env.AUTH_DEV_BYPASS ?? "").toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function frontendBaseUrl(): string {
  return process.env.FRONTEND_URL ?? "http://localhost:3000";
}
