import type { Request, Response, NextFunction } from "express";

/**
 * Phase 9 — bounded in-process rate limiter for authentication endpoints.
 * Fixed-window per (endpoint-group, client IP). No Redis dependency.
 * Production limitation: counters are per-process; deploy with sticky
 * sessions or an external limiter for multi-instance abuse protection.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

function clientIp(req: Request): string {
  const forwarded = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

/** Test hook: clear all counters. */
export function resetRateLimits(): void {
  buckets.clear();
}

function sweep(now: number): void {
  if (buckets.size > 5000) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }
}

export function rateLimit(group: string, opts: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${group}:${clientIp(req)}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      sweep(now);
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > opts.max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      res.status(429).json({ error: "Too many requests; retry later" });
      return;
    }
    next();
  };
}
