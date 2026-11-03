import { Prisma, prisma } from "@jobcopilot/db";
import {
  GmailSyncResultSchema,
  type GmailSyncResult,
  type IntegrationStatusInfo,
  type NormalizedEmail,
} from "@jobcopilot/shared";
import { badRequest, HttpError, notFound } from "../../services/errors.js";
import { ensureUser } from "../../services/users.js";
import { decryptToken, encryptToken, type EncryptedEnvelope } from "../crypto.js";
import type { IntegrationProvider } from "../types.js";
import {
  GmailApiError,
  GmailClient,
} from "./client.js";
import { normalizeGmailMessage } from "./parser.js";
import { classifyEmail } from "./classifier.js";
import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  isGoogleConfigured,
  refreshAccessToken,
  validateOAuthState,
} from "./oauth.js";
import { matchEmailToApplication } from "../application-email-matcher.js";
import { processEmailForApplication } from "../email-events.js";

const PROVIDER_ID = "google-gmail" as const;
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const SYNC_QUERY =
  "(application OR interview OR recruiter OR offer OR assessment) newer_than:90d";
const TOKEN_SKEW_MS = 60 * 1000;

interface StoredTokens {
  access: EncryptedEnvelope;
  refresh: EncryptedEnvelope | null;
  obtainedAt: string;
}

/** Plain objects satisfy Prisma Json inputs only through an explicit cast. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readTokens(encryptedToken: unknown): StoredTokens | null {
  if (!encryptedToken || typeof encryptedToken !== "object") return null;
  const t = encryptedToken as Partial<StoredTokens>;
  if (!t.access || typeof t.access !== "object") return null;
  return { access: t.access as EncryptedEnvelope, refresh: (t.refresh ?? null) as EncryptedEnvelope | null, obtainedAt: typeof t.obtainedAt === "string" ? t.obtainedAt : new Date(0).toISOString() };
}

function sanitizeStatus(row: {
  status: string;
  accountEmail: string | null;
  scopes: string[];
  connectedAt: Date | null;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
}): IntegrationStatusInfo {
  return {
    provider: PROVIDER_ID,
    configured: isGoogleConfigured(),
    connected: row.status === "CONNECTED",
    status: row.status as IntegrationStatusInfo["status"],
    accountEmail: row.accountEmail,
    scopes: row.scopes,
    connectedAt: row.connectedAt?.toISOString() ?? null,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    lastSyncError: row.lastSyncError,
  };
}

const DISCONNECTED_INFO: IntegrationStatusInfo = {
  provider: PROVIDER_ID,
  configured: false,
  connected: false,
  status: "DISCONNECTED",
  accountEmail: null,
  scopes: [],
  connectedAt: null,
  lastSyncedAt: null,
  lastSyncError: null,
};

export class GmailProvider implements IntegrationProvider {
  readonly id = PROVIDER_ID;
  private fetchImpl: typeof fetch;

  constructor(opts: { fetchImpl?: typeof fetch } = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Test-only override for the HTTP layer (mocked Gmail, never live). */
  setFetchImplForTests(fetchImpl?: typeof fetch): void {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return isGoogleConfigured();
  }

  async getStatus(userId: string): Promise<IntegrationStatusInfo> {
    const row = await prisma.integration.findUnique({
      where: { userId_provider: { userId, provider: PROVIDER_ID } },
    });
    if (!row) return { ...DISCONNECTED_INFO, configured: isGoogleConfigured() };
    return sanitizeStatus(row);
  }

  async getConnectUrl(userId: string): Promise<{ url: string }> {
    await ensureUser(userId);
    return { url: buildGoogleAuthUrl(userId) };
  }

  async handleCallback(userId: string, code: string, state: string): Promise<IntegrationStatusInfo> {
    await ensureUser(userId);
    validateOAuthState(state, userId);
    const tokens = await exchangeCodeForTokens(code, this.fetchImpl);
    if (!process.env.INTEGRATION_ENCRYPTION_KEY) {
      throw new HttpError(503, "Gmail integration requires server configuration (INTEGRATION_ENCRYPTION_KEY)");
    }
    const client = new GmailClient(tokens.accessToken, { fetchImpl: this.fetchImpl });
    const profile = await client.getProfile();
    const previous = await prisma.integration.findUnique({
      where: { userId_provider: { userId, provider: PROVIDER_ID } },
    });
    const previousTokens = readTokens(previous?.encryptedToken);
    const refresh = tokens.refreshToken ?? (previousTokens?.refresh ? decryptToken(previousTokens.refresh) : null);
    if (!refresh) {
      throw badRequest("Google did not return a refresh token; please reconnect and grant offline access");
    }
    const tokenPayload = toJson({
      access: encryptToken(tokens.accessToken),
      refresh: encryptToken(refresh),
      obtainedAt: new Date().toISOString(),
    });
    const row = await prisma.integration.upsert({
      where: { userId_provider: { userId, provider: PROVIDER_ID } },
      update: {
        encryptedToken: tokenPayload,
        scopes: tokens.scopes,
        accountEmail: profile.emailAddress,
        providerAccountId: profile.emailAddress,
        status: "CONNECTED",
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        connectedAt: new Date(),
        lastSyncError: null,
      },
      create: {
        userId,
        provider: PROVIDER_ID,
        encryptedToken: tokenPayload,
        scopes: tokens.scopes,
        accountEmail: profile.emailAddress,
        providerAccountId: profile.emailAddress,
        status: "CONNECTED",
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        connectedAt: new Date(),
      },
    });
    return sanitizeStatus(row);
  }

  /** Load a valid access token, refreshing when expired. Never returns secrets outward. */
  private async accessTokenFor(userId: string): Promise<string> {
    const row = await prisma.integration.findUnique({
      where: { userId_provider: { userId, provider: PROVIDER_ID } },
    });
    if (!row || row.status === "DISCONNECTED") throw notFound("Gmail is not connected");
    const stored = readTokens(row.encryptedToken);
    if (!stored) {
      await prisma.integration.update({
        where: { id: row.id },
        data: { status: "REAUTH_REQUIRED", lastSyncError: "stored credentials are missing" },
      });
      throw notFound("Gmail is not connected");
    }
    const expired = !row.tokenExpiresAt || row.tokenExpiresAt.getTime() - TOKEN_SKEW_MS < Date.now();
    if (!expired) return decryptToken(stored.access);
    if (!stored.refresh) {
      await prisma.integration.update({
        where: { id: row.id },
        data: { status: "REAUTH_REQUIRED", lastSyncError: "refresh token is missing" },
      });
      throw badRequest("Gmail authorization expired; please reconnect");
    }
    try {
      const refreshed = await refreshAccessToken(decryptToken(stored.refresh), this.fetchImpl);
      await prisma.integration.update({
        where: { id: row.id },
        data: {
          encryptedToken: toJson({ access: encryptToken(refreshed.accessToken), refresh: stored.refresh, obtainedAt: new Date().toISOString() }),
          tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
          status: "CONNECTED",
          lastSyncError: null,
        },
      });
      return refreshed.accessToken;
    } catch (err) {
      await prisma.integration.update({
        where: { id: row.id },
        data: { status: "REAUTH_REQUIRED", lastSyncError: "authorization expired; please reconnect" },
      });
      throw err;
    }
  }

  async syncMessages(userId: string, maxMessages: number): Promise<GmailSyncResult> {
    await ensureUser(userId);
    const capped = Math.min(Math.max(maxMessages, 1), 100);
    const started = Date.now();
    const result: GmailSyncResult = {
      synced: 0,
      matched: 0,
      needsReview: 0,
      eventsCreated: 0,
      notificationsCreated: 0,
      status: "CONNECTED",
      errors: [],
    };
    let accessToken: string;
    try {
      accessToken = await this.accessTokenFor(userId);
    } catch (err) {
      return { ...result, status: "REAUTH_REQUIRED", errors: [safeSyncError(err)] };
    }
    const client = new GmailClient(accessToken, { fetchImpl: this.fetchImpl });
    let listed: { id: string }[];
    try {
      const page = await client.listMessages(SYNC_QUERY, capped);
      listed = page.messages ?? [];
    } catch (err) {
      return this.finishWithError(userId, result, err);
    }

    for (const item of listed.slice(0, capped)) {
      try {
        const full = await client.getMessage(item.id);
        const normalized = normalizeGmailMessage(full);
        const classified = classifyEmail(normalized);
        const row = await prisma.emailMessage.upsert({
          where: { userId_provider_providerMessageId: { userId, provider: PROVIDER_ID, providerMessageId: normalized.providerMessageId } },
          update: {
            subject: normalized.subject,
            snippet: normalized.snippet,
            bodyText: normalized.bodyText,
            classification: classified.classification,
            classificationScore: classified.classificationScore,
            classificationReasons: classified.reasons,
            processedAt: new Date(),
          },
          create: {
            userId,
            provider: PROVIDER_ID,
            providerMessageId: normalized.providerMessageId,
            threadId: normalized.threadId,
            fromEmail: normalized.fromEmail,
            fromName: normalized.fromName,
            toEmails: normalized.toEmails,
            subject: normalized.subject,
            snippet: normalized.snippet,
            bodyText: normalized.bodyText,
            receivedAt: new Date(normalized.receivedAt),
            classification: classified.classification,
            classificationScore: classified.classificationScore,
            classificationReasons: classified.reasons,
            processedAt: new Date(),
          },
        });
        result.synced += 1;
        const outcome = await matchEmailToApplication(userId, normalized);
        await prisma.emailMessage.update({
          where: { id: row.id },
          data: {
            applicationId: outcome.applicationId,
            matchStatus: outcome.status,
            matchReason: outcome.reason,
            matchCandidates: outcome.candidates.length > 0 ? toJson(outcome.candidates) : undefined,
          },
        });
        if (outcome.status === "MATCHED") {
          result.matched += 1;
          const processed = await processEmailForApplication(userId, row.id);
          if (processed.eventCreated) result.eventsCreated += 1;
          if (processed.notificationCreated) result.notificationsCreated += 1;
        } else if (outcome.status === "NEEDS_REVIEW") {
          result.needsReview += 1;
        }
      } catch (err) {
        if (result.errors.length < 10) result.errors.push(safeSyncError(err));
      }
    }

    await prisma.integration.update({
      where: { userId_provider: { userId, provider: PROVIDER_ID } },
      data: { lastSyncedAt: new Date(), lastSyncError: result.errors[0] ?? null },
    });
    console.log(JSON.stringify({
      level: "info", component: "gmail-sync", userId,
      synced: result.synced, matched: result.matched, eventsCreated: result.eventsCreated,
      durationMs: Date.now() - started,
    }));
    return GmailSyncResultSchema.parse(result);
  }

  private async finishWithError(userId: string, result: GmailSyncResult, err: unknown): Promise<GmailSyncResult> {
    if (err instanceof GmailApiError && err.code === "UNAUTHENTICATED") {
      await prisma.integration.update({
        where: { userId_provider: { userId, provider: PROVIDER_ID } },
        data: { status: "REAUTH_REQUIRED", lastSyncError: "authorization expired; please reconnect" },
      });
      return { ...result, status: "REAUTH_REQUIRED", errors: ["Gmail authorization expired; please reconnect"] };
    }
    const message =
      err instanceof GmailApiError && err.code === "FORBIDDEN"
        ? "Gmail permission denied; check granted scopes"
        : err instanceof GmailApiError && err.code === "RATE_LIMITED"
          ? "Gmail rate limit exceeded; retry later"
          : "Gmail sync temporarily unavailable";
    if (err instanceof GmailApiError && err.code === "FORBIDDEN") {
      await prisma.integration.update({
        where: { userId_provider: { userId, provider: PROVIDER_ID } },
        data: { status: "ERROR", lastSyncError: message },
      });
      return { ...result, status: "ERROR", errors: [message] };
    }
    return { ...result, errors: [message] };
  }

  async disconnect(userId: string): Promise<IntegrationStatusInfo> {
    const row = await prisma.integration.findUnique({
      where: { userId_provider: { userId, provider: PROVIDER_ID } },
    });
    const stored = readTokens(row?.encryptedToken);
    // Best-effort server-side revocation; failure never blocks disconnect.
    if (stored?.refresh) {
      try {
        await this.fetchImpl(`${REVOKE_URL}?token=${encodeURIComponent(decryptToken(stored.refresh))}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        // Revocation is opportunistic; credentials are deleted regardless.
      }
    }
    if (!row) return { ...DISCONNECTED_INFO, configured: isGoogleConfigured() };
    // Credentials removed; synced email records are retained per the
    // documented retention policy (README). No further syncing occurs:
    // syncMessages requires CONNECTED status with stored tokens.
    const cleared = await prisma.integration.update({
      where: { id: row.id },
      data: { encryptedToken: Prisma.DbNull, status: "DISCONNECTED", tokenExpiresAt: null, lastSyncError: null },
    });
    return sanitizeStatus(cleared);
  }

  async getMessage(userId: string, providerMessageId: string): Promise<NormalizedEmail | null> {
    const row = await prisma.emailMessage.findUnique({
      where: { userId_provider_providerMessageId: { userId, provider: PROVIDER_ID, providerMessageId } },
    });
    if (!row) return null;
    return {
      providerMessageId: row.providerMessageId,
      threadId: row.threadId,
      fromEmail: row.fromEmail,
      fromName: row.fromName,
      toEmails: row.toEmails,
      subject: row.subject,
      snippet: row.snippet,
      bodyText: row.bodyText,
      receivedAt: row.receivedAt.toISOString(),
    };
  }
}

function safeSyncError(err: unknown): string {
  if (err instanceof GmailApiError) {
    switch (err.code) {
      case "UNAUTHENTICATED": return "Gmail authorization expired; please reconnect";
      case "FORBIDDEN": return "Gmail permission denied";
      case "RATE_LIMITED": return "Gmail rate limit exceeded; retry later";
      default: return "Gmail message processing failed";
    }
  }
  return "Email processing failed";
}

/** Shared singleton used by routes (tests override its HTTP layer). */
export const gmailProvider = new GmailProvider();
