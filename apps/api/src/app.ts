import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config, notFound, errorHandler } from "./config.js";
import { isProduction } from "./auth/auth-config.js";
import { requireAuth } from "./middleware/auth.js";
import { requireDb, ensureUserMw } from "./middleware/db.js";
import { csrfGuard } from "./middleware/csrf.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { jobsRouter } from "./routes/jobs.js";
import { applicationsRouter } from "./routes/applications.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { profileRouter } from "./routes/profile.js";
import { resumesRouter } from "./routes/resumes.js";
import { projectsRouter } from "./routes/projects.js";
import { matchesRouter } from "./routes/matches.js";
import { integrationsRouter } from "./routes/integrations.js";
import { inboxRouter } from "./routes/inbox.js";
import {
  applicationRunsNestedRouter,
  applicationRunsRouter,
} from "./routes/application-runs.js";
import { queuesRouter } from "./routes/queues.js";
import { discoveryRouter } from "./routes/discovery.js";
import { signalsRouter } from "./routes/signals.js";
import { notificationsRouter } from "./routes/notifications.js";
import { personalizationRouter } from "./routes/personalization.js";
import { analyticsRouter } from "./routes/analytics.js";
import { autopilotRouter } from "./routes/autopilot.js";
import { registerDefaultSources } from "./sources/index.js";
import { registerBrowserDefaults } from "./browser/index.js";

registerDefaultSources();
registerBrowserDefaults();

export function createApp() {
  const app = express();
  app.use(helmet());
  // Phase 19: in production only the configured frontend origin is allowed.
  // The localhost exception exists for local development only.
  const allowedOrigins = isProduction()
    ? [config.frontendUrl]
    : [config.frontendUrl, "http://localhost:3000"];
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  // Phase 9: CSRF guard for cookie-authenticated unsafe methods (checked).
  app.use(csrfGuard);

  app.use("/api/health", healthRouter);
  // Phase 9: real session auth. /google + /google/callback are public
  // (OAuth state/PKCE protected); /me requires a session; /logout is
  // idempotent. Auth endpoints are volume-limited (in-process).
  app.use("/api/auth", rateLimit("auth", { windowMs: 60_000, max: 120 }), authRouter);

  // Phase 9: real session auth on all data routes (dev/test bypass only
  // with explicit AUTH_DEV_BYPASS=true outside production).
  // ensureUserMw provisions the FK user row when Postgres is configured.
  const authed = [requireAuth, ensureUserMw] as const;
  app.use("/api/jobs", ...authed, jobsRouter);
  app.use("/api/applications", ...authed, applicationsRouter);
  app.use("/api/dashboard", ...authed, dashboardRouter);
  // Phase 2: Prisma-backed resources (503 in stub mode without DATABASE_URL).
  app.use("/api/profile", ...authed, requireDb, profileRouter);
  app.use("/api/resumes", ...authed, requireDb, resumesRouter);
  app.use("/api/projects", ...authed, requireDb, projectsRouter);
  app.use("/api/matches", ...authed, requireDb, matchesRouter);
  // Phase 6: Gmail integrations + inbox (credential-bearing, always DB-backed).
  app.use("/api/integrations", ...authed, integrationsRouter);
  app.use("/api/inbox", ...authed, inboxRouter);
  // Phase 7: human-approved application assistance.
  app.use("/api/applications", ...authed, applicationRunsNestedRouter);
  // Phase 15: AI personalization drafts (review-gated, never auto-submits).
  app.use("/api/applications", ...authed, personalizationRouter);
  app.use("/api/application-runs", ...authed, applicationRunsRouter);
  // Phase 10A: queue operations (health, status, cancel, dead-letter).
  app.use("/api/queues", ...authed, queuesRouter);
  // Phase 10B: automated discovery + hiring signals.
  app.use("/api/discovery", ...authed, discoveryRouter);
  // Phase 20: autopilot (prepare + fill; submission stays human-confirmed).
  app.use("/api/autopilot", ...authed, autopilotRouter);
  app.use("/api/signals", ...authed, signalsRouter);
  // Phase 11: track & monitor reads (notification center backend).
  app.use("/api/notifications", ...authed, notificationsRouter);
  // Phase 12C: descriptive analytics over persisted records (no predictions).
  app.use("/api/analytics", ...authed, analyticsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
