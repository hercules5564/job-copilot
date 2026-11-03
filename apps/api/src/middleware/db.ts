import type { Request, Response, NextFunction } from "express";
import { isDbConfigured } from "@jobcopilot/db";
import { ensureUser } from "../services/users.js";

const DB_UNAVAILABLE = {
  error: "Database not configured. Set DATABASE_URL and run migrations.",
} as const;

/** Reject Prisma-backed routes when Postgres is unavailable (stub mode). */
export function requireDb(_req: Request, res: Response, next: NextFunction): void {
  if (!isDbConfigured()) {
    res.status(503).json(DB_UNAVAILABLE);
    return;
  }
  next();
}

/** Ensure the FK user row exists. No-op in stub mode. */
export function ensureUserMw(req: Request, _res: Response, next: NextFunction): void {
  if (!isDbConfigured() || !req.userId) {
    next();
    return;
  }
  ensureUser(req.userId).then(() => next(), next);
}

/** Wrap async handlers so HttpError/rejections reach the error middleware. */
export function ah(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
