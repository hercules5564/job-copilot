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
 * production), the legacy `x-dev-user-id` header still works so existing
 * tooling/tests keep functioning. Production fails closed.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const DEV_USER_ID = "dev-user-1";

function unauthorized(res: Response): void {
  res.status(401).json({ error: "Unauthorized" });
}

function useDevUser(req: Request): void {
  const devUser = req.headers["x-dev-user-id"] as string | undefined;
  req.userId = devUser ?? DEV_USER_ID;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = getSessionToken(req.headers.cookie);
  const devBypass = devBypassEnabled();

  // No session cookie in dev/test: keep the explicit header bypass.
  if (devBypass && !token) {
    useDevUser(req);
    next();
    return;
  }

  // Async session validation; void return keeps Express 4 sync contract.
  void (async (): Promise<void> => {
    try {
      if (token && isDbConfigured()) {
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
      if (devBypass) {
        useDevUser(req);
        next();
        return;
      }
      unauthorized(res);
    } catch {
      if (devBypass) {
        useDevUser(req);
        next();
        return;
      }
      unauthorized(res);
    }
  })();
}
