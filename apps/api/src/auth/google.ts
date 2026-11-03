import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ProviderIdentity } from "@jobcopilot/shared";
import { authSecret, authSecretReady, googleAuthConfig, OAUTH_STATE_TTL_MS } from "./auth-config.js";
import { badRequest, HttpError } from "../services/errors.js";

/**
 * Phase 9 — Google OIDC login for the main application (separate from
 * Gmail integration tokens). Stateless flow: signed state binds
 * nonce + expiry + PKCE verifier (10-minute, single-use in practice
 * because authorization codes are single-use). Identity comes ONLY from
 * the provider userinfo response — never from browser-supplied email.
 *
 * PKCE (S256) is included even though this is a confidential client:
 * it costs nothing stateless and hardens the code exchange.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const LOGIN_SCOPES = ["openid", "email", "profile"];

function base64UrlEncode(raw: Buffer | string): string {
  return Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(raw: string): Buffer {
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

export function isAppGoogleConfigured(): boolean {
  return googleAuthConfig() !== null && authSecretReady();
}

function requireAppGoogleConfigured(): void {
  if (!googleAuthConfig()) {
    throw new HttpError(
      503,
      "Google sign-in requires server configuration (GOOGLE_AUTH_CLIENT_ID/GOOGLE_AUTH_CLIENT_SECRET)",
    );
  }
  if (!authSecretReady()) {
    throw new HttpError(503, "Google sign-in requires server configuration (AUTH_SESSION_SECRET)");
  }
}

export interface IssuedState {
  state: string;
}

/** Issue a signed login state token (embeds the PKCE verifier). */
export function issueLoginState(verifier?: string): IssuedState {
  const payload = JSON.stringify({
    purpose: "app-login",
    nonce: randomBytes(16).toString("hex"),
    verifier: verifier ?? randomBytes(32).toString("base64url"),
    exp: Date.now() + OAUTH_STATE_TTL_MS,
  });
  const encoded = base64UrlEncode(payload);
  const sig = createHmac("sha256", authSecret()).update(encoded).digest();
  return { state: `${encoded}.${base64UrlEncode(sig)}` };
}

export interface ValidatedState {
  verifier: string;
}

/** Validate state signature + expiry + purpose. Returns the PKCE verifier. */
export function validateLoginState(state: string): ValidatedState {
  const fail = (): never => {
    throw badRequest("Invalid or expired sign-in state");
  };
  const [encoded, sig] = state.split(".");
  if (!encoded || !sig) fail();
  let payloadRaw: Buffer;
  try {
    payloadRaw = base64UrlDecode(encoded);
  } catch {
    fail();
  }
  let expected: Buffer;
  try {
    expected = createHmac("sha256", authSecret()).update(encoded).digest();
  } catch {
    fail();
  }
  const actual = base64UrlDecode(sig);
  if (actual.length !== expected!.length || !timingSafeEqual(actual, expected!)) fail();
  let payload: { purpose?: unknown; nonce?: unknown; verifier?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(payloadRaw!.toString("utf8")) as typeof payload;
  } catch {
    fail();
  }
  if (
    payload!.purpose !== "app-login" ||
    typeof payload!.nonce !== "string" ||
    typeof payload!.verifier !== "string" ||
    typeof payload!.exp !== "number" ||
    payload!.exp < Date.now()
  ) {
    fail();
  }
  return { verifier: payload!.verifier as string };
}

/** Build the Google authorization URL (302 target for GET /api/auth/google). */
export function buildLoginUrl(): string {
  requireAppGoogleConfigured();
  const cfg = googleAuthConfig()!;
  const verifier = randomBytes(32).toString("base64url");
  const { state } = issueLoginState(verifier);
  const challenge = base64UrlEncode(createHash("sha256").update(verifier, "utf8").digest());
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: LOGIN_SCOPES.join(" "),
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface CodeExchangeResult {
  accessToken: string;
  idToken: string | null;
}

/** Exchange code (+PKCE verifier) for tokens. Safe errors only. */
export async function exchangeLoginCode(
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CodeExchangeResult> {
  requireAppGoogleConfigured();
  const cfg = googleAuthConfig()!;
  let res: Response;
  try {
    res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }).toString(),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, "Google sign-in failed");
  }
  if (!res.ok) throw badRequest("Google sign-in was rejected or expired");
  const payload = (await res.json()) as { access_token?: unknown; id_token?: unknown };
  if (typeof payload.access_token !== "string") throw badRequest("Google sign-in was rejected or expired");
  return {
    accessToken: payload.access_token,
    idToken: typeof payload.id_token === "string" ? payload.id_token : null,
  };
}

/**
 * Resolve the validated provider identity via userinfo (TLS + bearer
 * token from the just-completed code exchange). Requires a verified
 * email; unverified accounts cannot sign in.
 */
export async function fetchProviderIdentity(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderIdentity> {
  let res: Response;
  try {
    res = await fetchImpl(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(502, "Google sign-in failed");
  }
  if (!res.ok) throw badRequest("Google sign-in was rejected or expired");
  const payload = (await res.json()) as {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    name?: unknown;
    picture?: unknown;
  };
  if (typeof payload.sub !== "string" || !payload.sub) throw badRequest("Google sign-in was rejected or expired");
  if (typeof payload.email !== "string" || !payload.email) throw badRequest("Google sign-in was rejected or expired");
  if (payload.email_verified !== true && payload.email_verified !== "true") {
    throw badRequest("Google account email is not verified");
  }
  return {
    provider: "google",
    providerAccountId: payload.sub,
    email: payload.email,
    emailVerified: true,
    name: typeof payload.name === "string" ? payload.name.slice(0, 200) : null,
    avatarUrl: typeof payload.picture === "string" ? payload.picture.slice(0, 2000) : null,
  };
}
