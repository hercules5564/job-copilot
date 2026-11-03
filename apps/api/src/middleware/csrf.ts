import type { Request, Response, NextFunction } from "express";
import { frontendBaseUrl } from "../auth/auth-config.js";

/**
 * Phase 9 — CSRF defense for cookie-authenticated state-changing requests.
 * Layered with SameSite=Lax session cookies:
 * - safe methods (GET/HEAD/OPTIONS) pass through,
 * - unsafe methods carrying an Origin header must match the allowlist,
 * - unsafe methods with Referer but no Origin are checked via Referer origin,
 * - requests with neither (non-browser API clients, tests) pass through.
 * OAuth callbacks are GET + protected by signed state/PKCE instead.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function allowedOrigins(): string[] {
  const origins = new Set<string>(["http://localhost:3000"]);
  try {
    origins.add(new URL(frontendBaseUrl()).origin);
  } catch {
    // Fallback above already covers the default.
  }
  return [...origins];
}

export function originAllowed(raw: string | undefined): boolean {
  if (!raw) return true; // Non-browser client: nothing to check.
  let origin: string;
  try {
    origin = new URL(raw).origin;
  } catch {
    return false;
  }
  return allowedOrigins().includes(origin);
}

/** Pure decision helper (unit-tested without Express). */
export function csrfAllowed(method: string, origin: string | undefined, referer: string | undefined): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  if (origin !== undefined) return originAllowed(origin);
  if (referer !== undefined) {
    try {
      return originAllowed(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return true;
}

export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  if (!csrfAllowed(req.method, origin, referer)) {
    res.status(403).json({ error: "Cross-origin request rejected" });
    return;
  }
  next();
}
