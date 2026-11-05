import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { Request, Response, NextFunction } from "express";

/**
 * Load environment files from both the API package and the monorepo root.
 * npm workspaces run the API with cwd=apps/api, so a plain
 * `import "dotenv/config"` would miss the root `.env` that documents the
 * authoritative DATABASE_URL/SESSION_SECRET values. Existing variables win;
 * the first matching file is API-local, then the root file.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
for (const candidate of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(here, "../../../.env"),
  path.resolve(here, "../../../../.env"),
]) {
  dotenv.config({ path: candidate });
}

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-change-me-32-chars-minimum",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  // Phase 9: the Gmail default points at the integrations callback. The
  // application sign-in callback lives at /api/auth/google/callback
  // (GOOGLE_AUTH_REDIRECT_URI) — the two flows must not share a URI.
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ??
    "http://localhost:4000/api/integrations/gmail/callback",
  databaseUrl: process.env.DATABASE_URL ?? "",
  // Billing: "razorpay" (production), "mock" (local only), or "disabled".
  // Never defaults to mock in production so a misconfigured deploy fails
  // closed instead of granting paid access.
  paymentProvider:
    (process.env.PAYMENT_PROVIDER ?? "").toLowerCase() ||
    (process.env.NODE_ENV === "production" ? "disabled" : "mock"),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
};

export function getRequestId(req: Request): string {
  return (req.headers["x-request-id"] as string) ?? Math.random().toString(36).slice(2);
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const rid = getRequestId(req);
  // Typed service errors (HttpError) carry a safe public message.
  const status =
    typeof (err as { status?: unknown })?.status === "number"
      ? ((err as { status: number }).status >= 400 &&
        (err as { status: number }).status < 600
          ? (err as { status: number }).status
          : 500)
      : 500;
  if (status >= 500) {
    console.error(JSON.stringify({ level: "error", requestId: rid, err: String(err) }));
  }
  const message = status === 500 ? "Internal server error" : String((err as Error)?.message ?? "Request failed");
  if (status === 500) {
    res.status(500).json({ error: message, requestId: rid });
    return;
  }
  res.status(status).json({ error: message });
}
