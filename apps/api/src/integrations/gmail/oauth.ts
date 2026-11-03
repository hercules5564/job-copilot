import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../../config.js";
import { badRequest } from "../../services/errors.js";
import { HttpError } from "../../services/errors.js";
import { GOOGLE_TOKEN_URL } from "./client.js";

/**
 * Phase 6 — Google OAuth helpers (Gmail is a separate integration; the
 * Phase-1 app auth stub is untouched). Minimum scope: readonly Gmail.
 * State is a self-contained HMAC token (10-minute expiry) preventing CSRF
 * and user mismatch. No server-side session store required.
 */

export const GMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
];

const STATE_TTL_MS = 10 * 60 * 1000;

function base64UrlEncode(raw: Buffer | string): string {
  return Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(raw: string): Buffer {
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

export function isGoogleConfigured(): boolean {
  return Boolean(config.googleClientId && process.env.GOOGLE_CLIENT_SECRET);
}

function requireGoogleConfigured(): void {
  if (!isGoogleConfigured()) {
    throw new HttpError(503, "Gmail integration requires server configuration (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)");
  }
}

/** Issue a signed state token binding the OAuth flow to one user. */
export function issueOAuthState(userId: string): string {
  const payload = JSON.stringify({
    userId,
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  });
  const encoded = base64UrlEncode(payload);
  const sig = createHmac("sha256", config.sessionSecret).update(encoded).digest();
  return `${encoded}.${base64UrlEncode(sig)}`;
}

/** Validate state and return the bound userId. Rejects tampered/expired/foreign states. */
export function validateOAuthState(state: string, expectedUserId: string): string {
  const [encoded, sig] = state.split(".");
  if (!encoded || !sig) throw badRequest("Invalid OAuth state");
  let payloadRaw: Buffer;
  try {
    payloadRaw = base64UrlDecode(encoded);
  } catch {
    throw badRequest("Invalid OAuth state");
  }
  const expected = createHmac("sha256", config.sessionSecret).update(encoded).digest();
  const actual = base64UrlDecode(sig);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw badRequest("Invalid OAuth state");
  }
  let payload: { userId?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(payloadRaw.toString("utf8")) as typeof payload;
  } catch {
    throw badRequest("Invalid OAuth state");
  }
  if (typeof payload.userId !== "string" || typeof payload.exp !== "number" || payload.exp < Date.now()) {
    throw badRequest("Invalid or expired OAuth state");
  }
  if (payload.userId !== expectedUserId) throw badRequest("OAuth state does not match user");
  return payload.userId;
}

export function buildGoogleAuthUrl(userId: string): string {
  requireGoogleConfigured();
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: issueOAuthState(userId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scopes: string[];
}

/** Exchange an authorization code for tokens (fixed Google endpoint, timeout). */
export async function exchangeCodeForTokens(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenExchangeResult> {
  requireGoogleConfigured();
  let res: Response;
  try {
    res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: config.googleRedirectUri,
        grant_type: "authorization_code",
      }).toString(),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, "Google token exchange failed");
  }
  if (!res.ok) throw badRequest("Google authorization was rejected or expired");
  const payload = (await res.json()) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    scope?: unknown;
  };
  if (typeof payload.access_token !== "string") throw badRequest("Google authorization was rejected or expired");
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : 3600,
    scopes: typeof payload.scope === "string" && payload.scope ? payload.scope.split(" ") : [...GMAIL_SCOPES],
  };
}

/** Refresh an access token (fixed Google endpoint, timeout). */
export async function refreshAccessToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  requireGoogleConfigured();
  let res: Response;
  try {
    res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: config.googleClientId,
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, "Google token refresh failed");
  }
  if (res.status === 400 || res.status === 401) {
    const err = badRequest("Gmail authorization expired");
    (err as { gmailReauth?: boolean }).gmailReauth = true;
    throw err;
  }
  if (!res.ok) throw new HttpError(502, "Google token refresh failed");
  const payload = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== "string") {
    const err = badRequest("Gmail authorization expired");
    (err as { gmailReauth?: boolean }).gmailReauth = true;
    throw err;
  }
  return {
    accessToken: payload.access_token,
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : 3600,
  };
}
