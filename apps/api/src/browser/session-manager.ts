import { prisma } from "@jobcopilot/db";
import { HttpError, notFound, unprocessable } from "../services/errors.js";
import { getBrowserProvider } from "./registry.js";
import type { BrowserProviderId, BrowserSessionHandle, PageSnapshot } from "./types.js";

/**
 * Phase 7 — browser session manager (+ Phase 8 modes, transitions, limits).
 * DB rows hold metadata only (status/urls/titles/activity). Live handles
 * live in server memory keyed by session id; cookies/storage/credentials
 * are never persisted and never leave the server. Sessions expire lazily
 * on access (idle 10 min, absolute 30 min); expired handles are closed.
 */

const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_IDLE_MS = 10 * 60 * 1000;

/** Read at call time so tests/ops can tune without restarts. */
function sessionLimits(): { perUser: number; total: number } {
  const perUser = Number(process.env.BROWSER_MAX_SESSIONS_PER_USER ?? 3);
  const total = Number(process.env.BROWSER_MAX_SESSIONS ?? 20);
  return {
    perUser: Number.isFinite(perUser) && perUser > 0 ? Math.floor(perUser) : 3,
    total: Number.isFinite(total) && total > 0 ? Math.floor(total) : 20,
  };
}

export type SessionMode = "HEADLESS" | "HEADED";

/** Validated session transitions; anything else fails safely. */
const SESSION_TRANSITIONS: Record<string, string[]> = {
  CREATED: ["STARTING"],
  STARTING: ["READY", "FAILED"],
  READY: ["RUNNING", "WAITING_FOR_USER", "WAITING_FOR_LOGIN", "CLOSED", "EXPIRED"],
  RUNNING: ["WAITING_FOR_USER", "WAITING_FOR_LOGIN", "BLOCKED", "FAILED", "COMPLETED", "CLOSED", "EXPIRED"],
  WAITING_FOR_USER: ["RUNNING", "BLOCKED", "COMPLETED", "CLOSED", "EXPIRED"],
  WAITING_FOR_LOGIN: ["RUNNING", "BLOCKED", "CLOSED", "EXPIRED"],
  BLOCKED: ["RUNNING", "CLOSED", "EXPIRED"],
  FAILED: ["CLOSED", "EXPIRED"],
  COMPLETED: ["CLOSED"],
  EXPIRED: [],
  CLOSED: [],
};

const ACTIVE_SESSION_STATUSES = ["CREATED", "STARTING", "READY", "RUNNING", "WAITING_FOR_USER", "WAITING_FOR_LOGIN", "BLOCKED"];

const liveHandles = new Map<string, BrowserSessionHandle>();

export function resolveBrowserProviderId(explicit?: string): BrowserProviderId {
  const raw = (explicit ?? process.env.BROWSER_PROVIDER ?? "playwright").toLowerCase();
  if (raw === "demo") return "demo";
  return "playwright";
}

export function resolveSessionMode(): SessionMode {
  return ["1", "true", "yes"].includes((process.env.BROWSER_HEADED ?? "").toLowerCase()) ? "HEADED" : "HEADLESS";
}

export async function createSession(userId: string, providerId: BrowserProviderId, adapterId?: string) {
  const limits = sessionLimits();
  const activeForUser = await prisma.browserSession.count({
    where: { userId, status: { in: ACTIVE_SESSION_STATUSES } },
  });
  if (activeForUser >= limits.perUser) {
    throw new HttpError(429, "Too many active browser sessions for this user; close one and retry");
  }
  const activeTotal = await prisma.browserSession.count({
    where: { status: { in: ACTIVE_SESSION_STATUSES } },
  });
  if (activeTotal >= limits.total) {
    throw new HttpError(429, "Browser capacity is full; retry later");
  }
  const provider = getBrowserProvider(providerId);
  const row = await prisma.browserSession.create({
    data: {
      userId,
      provider: providerId,
      status: "STARTING",
      mode: resolveSessionMode(),
      adapterId: adapterId ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  try {
    const launched = await provider.launch();
    const handle = (provider as unknown as { rebind(h: BrowserSessionHandle, id: string): BrowserSessionHandle }).rebind(launched, row.id);
    liveHandles.set(row.id, handle);
    return prisma.browserSession.update({
      where: { id: row.id },
      data: { status: "READY", lastActivityAt: new Date() },
    });
  } catch (err) {
    await prisma.browserSession.update({
      where: { id: row.id },
      data: { status: "FAILED" },
    });
    throw err;
  }
}

async function expireSession(row: { id: string }): Promise<never> {
  const handle = liveHandles.get(row.id);
  liveHandles.delete(row.id);
  if (handle) {
    try {
      const provider = getBrowserProvider((handle as { providerId: BrowserProviderId }).providerId);
      await provider.close(handle);
    } catch {
      // Closing is best-effort; the row state is authoritative.
    }
  }
  await prisma.browserSession.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
  throw notFound("Browser session expired");
}

/** Load a live handle with ownership + expiry enforcement (foreign → 404). */
export async function getLiveHandle(sessionId: string, userId: string): Promise<{ row: { id: string; provider: string }; handle: BrowserSessionHandle }> {
  const row = await prisma.browserSession.findFirst({ where: { id: sessionId, userId } });
  if (!row) throw notFound("Browser session not found");
  if (["CLOSED", "EXPIRED", "FAILED"].includes(row.status)) throw notFound("Browser session expired");
  if (row.expiresAt.getTime() < Date.now() || row.lastActivityAt.getTime() + SESSION_IDLE_MS < Date.now()) {
    await expireSession(row);
  }
  const handle = liveHandles.get(row.id);
  if (!handle) {
    // Live handle lost (e.g. process restart): mark expired, never resurrect.
    await prisma.browserSession.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
    throw notFound("Browser session expired");
  }
  return { row, handle };
}

export async function touchSession(sessionId: string, snapshot?: PageSnapshot): Promise<void> {
  await prisma.browserSession.update({
    where: { id: sessionId },
    data: {
      lastActivityAt: new Date(),
      ...(snapshot ? { currentUrl: snapshot.url.slice(0, 2000), currentTitle: snapshot.title.slice(0, 500) } : {}),
    },
  });
}

export async function setSessionStatus(sessionId: string, status: string): Promise<void> {
  const row = await prisma.browserSession.findUnique({ where: { id: sessionId } });
  if (!row) throw notFound("Browser session not found");
  const allowed = SESSION_TRANSITIONS[row.status] ?? [];
  if (!allowed.includes(status)) {
    throw unprocessable(`Invalid browser session transition ${row.status} -> ${status}`);
  }
  await prisma.browserSession.update({ where: { id: sessionId }, data: { status, lastActivityAt: new Date() } });
}

/** Best-effort status write that never fails the caller (terminal paths). */
export async function setSessionStatusLenient(sessionId: string, status: string): Promise<void> {
  try {
    await setSessionStatus(sessionId, status);
  } catch {
    // Terminal cleanup must not throw; the run state is authoritative.
  }
}

export async function closeSession(sessionId: string, userId: string): Promise<void> {
  const row = await prisma.browserSession.findFirst({ where: { id: sessionId, userId } });
  if (!row) throw notFound("Browser session not found");
  const handle = liveHandles.get(row.id);
  liveHandles.delete(row.id);
  if (handle) {
    try {
      await getBrowserProvider((handle as { providerId: BrowserProviderId }).providerId).close(handle);
    } catch {
      // Best-effort close.
    }
  }
  await prisma.browserSession.update({ where: { id: row.id }, data: { status: "CLOSED" } });
}
