import type { Request, Response, NextFunction } from "express";
import { devBypassEnabled } from "../auth/auth-config.js";
import { getSessionToken } from "../auth/cookies.js";
import { validateSession } from "../auth/session.js";
import { isDbConfigured } from "@jobcopilot/db";

/**
 * Phase 9 — real session authentication.
 * Production: secure HttpOnly session cookie → hash lookup → revocation +
 * expiry checks → req.userId. No default fake user: unauthenticated
 * requests get a consistent 401 (no existence oracle).
 *
 * Development/test ONLY: when AUTH_DEV_BYPASS=true (and never in
 * production), an EXPLICIT `x-dev-user-id` header still works so existing
 * tooling/tests keep functioning. The header is never inferred: a request
 * without a session cookie and without the header is unauthenticated even
 * when the bypass flag is enabled. Production fails closed.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

function unauthorized(res: Response): void {
  res.status(401).json({ error: "Unauthorized" });
}

function requestedDevUser(req: Request): string | null {
  const raw = req.headers["x-dev-user-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 200) : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getSessionToken(req.headers.cookie);
  const devBypass = devBypassEnabled();
  const devUser = devBypass ? requestedDevUser(req) : null;

  // Explicit dev/test header only. No header means unauthenticated; this is
  // what prevents the local app from silently acting as a fake signed-in user.
  if (!token) {
    if (devUser) {
      req.userId = devUser;
      next();
      return;
    }
    unauthorized(res);
    return;
  }

  // Async session validation; void return keeps Express 4 sync contract.
  void (async (): Promise<void> => {
    try {
      if (isDbConfigured()) {
        const session = await validateSession(token);
        if (session) {
          // A real session always wins over the dev bypass, so password /
          // Google logins actually switch users in local development.
          req.userId = session.userId;
          next();
          return;
        }
        // A presented but invalid/revoked session must not silently fall
        // back to the dev user (that would hide logout/expiry bugs).
        unauthorized(res);
        return;
      }
      // A cookie was presented but cannot be validated without the database.
      unauthorized(res);
    } catch {
      unauthorized(res);
    }
  })();
}
