import { Router } from "express";
import { createHash } from "node:crypto";
import { prisma } from "@jobcopilot/db";
import {
  GmailCallbackQuerySchema,
  GmailSyncSchema,
  IntegrationProviderSchema,
  type GmailSyncInput,
} from "@jobcopilot/shared";
import { QueueUnavailableError, enqueueGmailSync } from "@jobcopilot/queues";
import { config } from "../config.js";
import { validateBody } from "../middleware/validate.js";
import { ah, requireDb } from "../middleware/db.js";
import { badRequest, notFound } from "../services/errors.js";
import { getIntegrationProvider, listIntegrationProviders } from "../integrations/registry.js";
import { gmailProvider, type GmailProvider } from "../integrations/gmail/provider.js";
import { registerIntegrationProvider } from "../integrations/registry.js";
import { ensureQueueRegistry } from "../queues/queue-init.js";

/** Deterministic idempotency key for identical sync requests. */
function defaultSyncKey(userId: string, integrationId: string, body: GmailSyncInput): string {
  return createHash("sha256")
    .update(JSON.stringify({ userId, integrationId, maxMessages: body.maxMessages ?? null }))
    .digest("hex")
    .slice(0, 32);
}

registerIntegrationProvider(gmailProvider);

export const integrationsRouter = Router();

integrationsRouter.use(requireDb);

/** Sanitized list of the user's integrations (closed provider set, no tokens). */
integrationsRouter.get(
  "/",
  ah(async (req, res) => {
    const rows = await prisma.integration.findMany({ where: { userId: req.userId! } });
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    res.json({
      integrations: listIntegrationProviders().map((p) => {
        const row = byProvider.get(p.id);
        if (!row) {
          return {
            provider: p.id,
            configured: p.isConfigured(),
            connected: false,
            status: "DISCONNECTED",
            accountEmail: null,
            scopes: [],
            connectedAt: null,
            lastSyncedAt: null,
            lastSyncError: null,
          };
        }
        return {
          provider: row.provider,
          configured: p.isConfigured(),
          connected: row.status === "CONNECTED",
          status: row.status,
          accountEmail: row.accountEmail,
          scopes: row.scopes,
          connectedAt: row.connectedAt?.toISOString() ?? null,
          lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
          lastSyncError: row.lastSyncError,
        };
      }),
    });
  }),
);

function gmailOnly(provider: string): GmailProvider {
  const parsed = IntegrationProviderSchema.safeParse(provider);
  if (!parsed.success || parsed.data !== "google-gmail") {
    throw badRequest(`Unknown integration provider: "${provider}"`);
  }
  return getIntegrationProvider(parsed.data) as GmailProvider;
}

integrationsRouter.get(
  "/gmail",
  ah(async (req, res) => {
    res.json({ integration: await gmailOnly("google-gmail").getStatus(req.userId!) });
  }),
);

integrationsRouter.get(
  "/gmail/connect",
  ah(async (req, res) => {
    const provider = gmailOnly("google-gmail");
    if (!provider.isConfigured()) {
      res.json({
        configured: false,
        message: "Gmail integration requires server configuration (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).",
      });
      return;
    }
    const { url } = await provider.getConnectUrl(req.userId!);
    res.json({ configured: true, url });
  }),
);

integrationsRouter.get(
  "/gmail/callback",
  ah(async (req, res) => {
    const parsed = GmailCallbackQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.redirect(`${config.frontendUrl}/integrations?gmail=error`);
      return;
    }
    try {
      await gmailOnly("google-gmail").handleCallback(req.userId!, parsed.data.code, parsed.data.state);
      res.redirect(`${config.frontendUrl}/integrations?gmail=connected`);
    } catch {
      res.redirect(`${config.frontendUrl}/integrations?gmail=error`);
    }
  }),
);

integrationsRouter.post(
  "/gmail/sync",
  validateBody(GmailSyncSchema),
  ah(async (req, res) => {
    const fallback = Math.min(Math.max(Number(process.env.GMAIL_SYNC_MAX_MESSAGES ?? 25), 1), 100);
    // Phase 10A: async mode enqueues (202); sync behavior unchanged otherwise.
    if (req.body.async) {
      try {
        ensureQueueRegistry();
        const row = await prisma.integration.findFirst({
          where: { userId: req.userId!, provider: "google-gmail" },
        });
        if (!row) throw notFound("Gmail integration not found");
        const enqueued = await enqueueGmailSync({
          userId: req.userId!,
          integrationId: row.id,
          maxMessages: req.body.maxMessages ?? fallback,
          idempotencyKey: defaultSyncKey(req.userId!, row.id, req.body),
        });
        res.status(202).json({ queued: true, jobId: enqueued.jobId, queue: enqueued.queue });
        return;
      } catch (err) {
        if (err instanceof QueueUnavailableError) {
          res.status(503).json({ error: "Background queues unavailable" });
          return;
        }
        throw err;
      }
    }
    res.json({
      sync: await gmailOnly("google-gmail").syncMessages(req.userId!, req.body.maxMessages ?? fallback),
    });
  }),
);

integrationsRouter.post(
  "/gmail/disconnect",
  ah(async (req, res) => {
    res.json({ integration: await gmailOnly("google-gmail").disconnect(req.userId!) });
  }),
);
