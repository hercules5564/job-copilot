import { Router } from "express";
import { GoogleCallbackQuerySchema } from "@jobcopilot/shared";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { ah, requireDb } from "../middleware/db.js";
import { isDbConfigured } from "@jobcopilot/db";
import { findOrCreateUserForIdentity } from "../auth/account-linking.js";
import { devBypassEnabled, frontendBaseUrl } from "../auth/auth-config.js";
import { serializeClearCookie, serializeSessionCookie } from "../auth/cookies.js";
import {
  buildLoginUrl,
  exchangeLoginCode,
  fetchProviderIdentity,
  isAppGoogleConfigured,
  validateLoginState,
} from "../auth/google.js";
import { createSession, getSafeUser, revokeSession } from "../auth/session.js";

export const authRouter = Router();

function loginRedirect(code: string): string {
  return `${frontendBaseUrl()}/login?error=${encodeURIComponent(code)}`;
}

function logAuth(event: string, detail: Record<string, unknown> = {}): void {
  // Ids and outcomes only — never tokens, codes, emails, or provider payloads.
  console.log(JSON.stringify({ level: "info", component: "auth", event, ...detail }));
}

/**
 * Phase 9 — Google sign-in initiation (browser flow: 302 to Google).
 * Rate-limited + CSRF-exempt safe method; OAuth state/PKCE protect the
 * callback. When Google auth is unconfigured, browsers land on the login
 * page with a safe error code (no raw config details).
 */
authRouter.get(
  "/google",
  ah(async (_req, res) => {
    if (!isAppGoogleConfigured()) {
      res.redirect(302, loginRedirect("oauth_not_configured"));
      return;
    }
    logAuth("login_initiated");
    res.redirect(302, buildLoginUrl());
  }),
);

/**
 * Phase 9 — OAuth callback. Validates state (signature/expiry/purpose),
 * exchanges the code (+PKCE), resolves the provider identity, links/creates
 * the user, creates a FRESH session (fixation-safe: no pre-auth state is
 * reused), sets the HttpOnly cookie, and redirects to the app. Every
 * failure lands on /login with a safe error code — never raw provider
 * errors or stack traces.
 */
authRouter.get(
  "/google/callback",
  requireDb,
  ah(async (req, res) => {
    const parsed = GoogleCallbackQuerySchema.safeParse(req.query);
    if (!parsed.success || !isAppGoogleConfigured()) {
      res.redirect(302, loginRedirect("oauth_failed"));
      return;
    }
    let verifier: string;
    try {
      verifier = validateLoginState(parsed.data.state).verifier;
    } catch {
      logAuth("callback_invalid_state");
      res.redirect(302, loginRedirect("invalid_state"));
      return;
    }
    try {
      const tokens = await exchangeLoginCode(parsed.data.code, verifier);
      const identity = await fetchProviderIdentity(tokens.accessToken);
      const userId = await findOrCreateUserForIdentity(identity);
      const session = await createSession(userId, {
        userAgent: req.headers["user-agent"],
      });
      res.setHeader("Set-Cookie", serializeSessionCookie(session.token));
      logAuth("login_succeeded", { userId });
      res.redirect(302, `${frontendBaseUrl()}/dashboard`);
    } catch (err) {
      logAuth("callback_failed", {
        status: typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 500,
      });
      res.redirect(302, loginRedirect("oauth_failed"));
    }
  }),
);

/** Current session identity (safe fields only). */
authRouter.get(
  "/me",
  requireAuth,
  ah(async (req, res) => {
    // Dev-bypass stub mode (no DATABASE_URL): synthetic identity, as before.
    if (devBypassEnabled() && !isDbConfigured()) {
      res.json({
        user: { id: req.userId!, email: "dev@example.com", name: "Dev User", avatarUrl: null, emailVerifiedAt: null },
      });
      return;
    }
    if (!isDbConfigured()) {
      res.status(503).json({ error: "Database not configured. Set DATABASE_URL and run migrations." });
      return;
    }
    const user = await getSafeUser(req.userId!);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({ user });
  }),
);
/**
 * Logout: revoke the presented session (if any), always clear the cookie,
 * always 200. Idempotent — a second call reveals nothing.
 */
authRouter.post(
  "/logout",
  ah(async (req, res) => {
    const header = req.headers.cookie;
    const match = header?.match(/(?:^|;\s*)jobpilot_session=([^;]+)/);
    if (match?.[1]) {
      try {
        await revokeSession(decodeURIComponent(match[1]));
      } catch {
        // Revocation is best-effort; the cookie is cleared regardless.
      }
    }
    res.setHeader("Set-Cookie", serializeClearCookie());
    logAuth("logout");
    res.json({ ok: true });
  }),
);

/** Legacy stub endpoint removed in Phase 9 (use GET /api/auth/google). */
authRouter.get("/google/url", (_req, res) => {
  res.status(410).json({
    error: "Replaced by Google sign-in (GET /api/auth/google)",
    authUrl: `${config.frontendUrl}/login`,
  });
});
