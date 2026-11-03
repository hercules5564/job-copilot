/**
 * Phase 6 integration tests — routes, sync, matching, events, notifications.
 * Gmail/HTTP is fully mocked (no network, no Google). PostgreSQL required.
 * Isolation: rows belong to users `p6test-<name>-<ts>`, removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { prisma, type Prisma } from "@jobcopilot/db";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { gmailProvider } from "../src/integrations/gmail/provider.js";
import { issueOAuthState } from "../src/integrations/gmail/oauth.js";
import { encryptToken } from "../src/integrations/crypto.js";
import { matchEmailToApplication } from "../src/integrations/application-email-matcher.js";
import { processEmailForApplication } from "../src/integrations/email-events.js";
import type { NormalizedEmail } from "@jobcopilot/shared";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const U = (name: string) => `p6test-${name}-${TS}`;
const H = (name: string) => ({ "x-dev-user-id": U(name) });

const app = createApp();

const ORIGINAL_KEY = process.env.INTEGRATION_ENCRYPTION_KEY;
const ORIGINAL_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const ORIGINAL_CLIENT_ID = config.googleClientId;
const ORIGINAL_REDIRECT = config.googleRedirectUri;

beforeAll(() => {
  process.env.INTEGRATION_ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
  config.googleClientId = "test-google-client-id";
  config.googleRedirectUri = "http://localhost:4000/api/integrations/gmail/callback";
});

afterEach(() => {
  gmailProvider.setFetchImplForTests(undefined);
});

afterAll(async () => {
  if (ORIGINAL_KEY === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
  else process.env.INTEGRATION_ENCRYPTION_KEY = ORIGINAL_KEY;
  if (ORIGINAL_SECRET === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
  else process.env.GOOGLE_CLIENT_SECRET = ORIGINAL_SECRET;
  config.googleClientId = ORIGINAL_CLIENT_ID;
  config.googleRedirectUri = ORIGINAL_REDIRECT;
  if (!DB) return;
  await prisma.user.deleteMany({ where: { id: { startsWith: "p6test-" } } });
  await prisma.$disconnect();
});

// ---------- mock Gmail ----------

interface MockMessage {
  id: string;
  threadId?: string;
  from: string;
  subject: string;
  body: string;
  date?: string;
}

function b64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function mockGmailFetch(messages: MockMessage[], opts: { listStatus?: number; failGetIds?: string[] } = {}) {
  const seen: string[] = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    seen.push(`${init?.method ?? "GET"} ${u}`);
    if (u.includes("oauth2.googleapis.com/token")) {
      const body = String(init?.body ?? "");
      if (body.includes("grant_type=refresh_token")) {
        return new Response(JSON.stringify({ access_token: "mock-access-refreshed", expires_in: 3600 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ access_token: "mock-access-xyz", refresh_token: "mock-refresh-xyz", expires_in: 3600, scope: "openid email https://www.googleapis.com/auth/gmail.readonly" }),
        { status: 200 },
      );
    }
    if (u.includes("oauth2.googleapis.com/revoke")) return new Response("{}", { status: 200 });
    if (u.endsWith("/gmail/v1/users/me/profile")) {
      return new Response(JSON.stringify({ emailAddress: "tester@gmail.com" }), { status: 200 });
    }
    if (u.includes("/messages?")) {
      if (opts.listStatus) return new Response("err", { status: opts.listStatus });
      return new Response(JSON.stringify({ messages: messages.map((m) => ({ id: m.id, threadId: m.threadId ?? "t" })) }), { status: 200 });
    }
    const match = u.match(/\/messages\/([^?]+)/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (opts.failGetIds?.includes(id)) return new Response("x", { status: 500 });
      const m = messages.find((x) => x.id === id);
      if (!m) return new Response("{}", { status: 404 });
      return new Response(
        JSON.stringify({
          id: m.id,
          threadId: m.threadId ?? "t",
          snippet: m.body.slice(0, 100),
          internalDate: String(Date.parse(m.date ?? "2026-09-01T10:00:00Z")),
          payload: {
            headers: [
              { name: "From", value: m.from },
              { name: "To", value: "tester@gmail.com" },
              { name: "Subject", value: m.subject },
            ],
            parts: [{ mimeType: "text/plain", body: { data: b64url(m.body) } }],
          },
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, seen };
}

async function seedConnectedUser(name: string, fetchImpl?: typeof fetch) {
  const h = H(name);
  if (fetchImpl) gmailProvider.setFetchImplForTests(fetchImpl);
  await prisma.user.upsert({
    where: { id: U(name) },
    update: {},
    create: { id: U(name), email: `${U(name)}@jobcopilot.local` },
  });
  const tokenPayload = {
    access: encryptToken("mock-access-xyz"),
    refresh: encryptToken("mock-refresh-xyz"),
    obtainedAt: new Date().toISOString(),
  } as unknown as Prisma.InputJsonValue;
  await prisma.integration.upsert({
    where: { userId_provider: { userId: U(name), provider: "google-gmail" } },
    update: {
      encryptedToken: tokenPayload,
      scopes: ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"],
      accountEmail: "tester@gmail.com",
      providerAccountId: "tester@gmail.com",
      status: "CONNECTED",
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      connectedAt: new Date(),
      lastSyncError: null,
    },
    create: {
      userId: U(name),
      provider: "google-gmail",
      encryptedToken: tokenPayload,
      scopes: ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"],
      accountEmail: "tester@gmail.com",
      providerAccountId: "tester@gmail.com",
      status: "CONNECTED",
      tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      connectedAt: new Date(),
    },
  });
  return h;
}

async function seedApplication(h: Record<string, string>, title: string, company: string, toStatus = "APPLIED") {
  const job = await request(app).post("/api/jobs").set(h).send({
    title,
    company,
    description: `${title} role at ${company}.`,
  });
  const created = await request(app).post("/api/applications").set(h).send({ jobId: job.body.job.id });
  const id = created.body.application.id as string;
  const path: Record<string, string[]> = {
    APPLIED: ["MATCHED", "REVIEW", "READY", "APPROVED", "APPLIED"],
  };
  for (const s of path[toStatus] ?? []) {
    await request(app).patch(`/api/applications/${id}/status`).set(h).send({ toStatus: s });
  }
  return { jobId: job.body.job.id as string, applicationId: id };
}

// ---------- OAuth routes ----------

describe.skipIf(!DB)("gmail oauth routes", () => {
  it("reports configuration-required when Google creds are missing", async () => {
    config.googleClientId = "";
    delete process.env.GOOGLE_CLIENT_SECRET;
    const res = await request(app).get("/api/integrations/gmail/connect").set(H("oauth1")).expect(200);
    expect(res.body.configured).toBe(false);
    const status = await request(app).get("/api/integrations/gmail").set(H("oauth1")).expect(200);
    expect(status.body.integration.configured).toBe(false);
    expect(status.body.integration.connected).toBe(false);
    config.googleClientId = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
  });

  it("returns a consent URL with readonly scope and state", async () => {
    const res = await request(app).get("/api/integrations/gmail/connect").set(H("oauth2")).expect(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(res.body.url).toContain("gmail.readonly");
    expect(res.body.url).not.toContain("gmail.send");
  });

  it("completes the callback with valid code+state (mocked Google)", async () => {
    const h = H("oauth3");
    const { fetchImpl, seen } = mockGmailFetch([]);
    gmailProvider.setFetchImplForTests(fetchImpl);
    const state = issueOAuthState(U("oauth3"));
    const res = await request(app)
      .get(`/api/integrations/gmail/callback?code=authcode123&state=${encodeURIComponent(state)}`)
      .set(h)
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("gmail=connected");
    const status = await request(app).get("/api/integrations/gmail").set(h).expect(200);
    expect(status.body.integration.connected).toBe(true);
    expect(status.body.integration.accountEmail).toBe("tester@gmail.com");
    const dumped = JSON.stringify(status.body);
    expect(dumped).not.toContain("mock-access-xyz");
    expect(dumped).not.toContain("mock-refresh-xyz");
    expect(dumped).not.toContain("test-google-secret");
    // Only fixed Google endpoints were called.
    expect(seen.every((u) => u.includes("googleapis.com"))).toBe(true);
  });

  it("rejects tampered state and redirects invalid callbacks to error", async () => {
    const h = H("oauth4");
    gmailProvider.setFetchImplForTests(mockGmailFetch([]).fetchImpl);
    const bad = await request(app)
      .get("/api/integrations/gmail/callback?code=x&state=tampered.state.here")
      .set(h)
      .redirects(0);
    expect(bad.status).toBe(302);
    expect(bad.headers.location).toContain("gmail=error");
    const missing = await request(app).get("/api/integrations/gmail/callback").set(h).redirects(0);
    expect(missing.headers.location).toContain("gmail=error");
    const foreign = issueOAuthState(U("someone-else"));
    const cross = await request(app)
      .get(`/api/integrations/gmail/callback?code=x&state=${encodeURIComponent(foreign)}`)
      .set(h)
      .redirects(0);
    expect(cross.headers.location).toContain("gmail=error");
  });

  it("rejects unknown providers on the integrations API", async () => {
    await request(app).get("/api/integrations").set(H("oauth5")).expect(200);
  });
});

// ---------- sync + matching + events ----------

describe.skipIf(!DB)("gmail sync pipeline", () => {
  it("syncs, classifies, matches, creates events + notifications idempotently", async () => {
    const messages: MockMessage[] = [
      {
        id: "m-interview",
        from: "Jane Recruiter <jane@acme.com>",
        subject: "Interview invitation: Backend Engineer",
        body: "Hi, we would like to invite you to interview for the Backend Engineer role at Acme next week. Let me know if you are interested.",
      },
      {
        id: "m-news",
        from: "news@digest.com",
        subject: "Weekly tech digest",
        body: "Unsubscribe from this newsletter here. Top stories of the week.",
      },
    ];
    const { fetchImpl } = mockGmailFetch(messages);
    const h = await seedConnectedUser("sync1", fetchImpl);
    const { applicationId } = await seedApplication(h, "Backend Engineer", "Acme");

    const first = await request(app).post("/api/integrations/gmail/sync").set(h).send({ maxMessages: 25 }).expect(200);
    expect(first.body.sync.synced).toBe(2);
    expect(first.body.sync.matched).toBe(1);
    expect(first.body.sync.eventsCreated).toBe(1);
    expect(first.body.sync.notificationsCreated).toBe(1);

    // Application moved APPLIED -> INTERVIEW via the state machine.
    const detail = await request(app).get(`/api/applications/${applicationId}`).set(h).expect(200);
    expect(detail.body.application.status).toBe("INTERVIEW");
    expect(detail.body.application.events.some((e: { source: string }) => e.source === "GMAIL")).toBe(true);
    expect(detail.body.application.emails).toHaveLength(1);

    // Inbox reflects classification + linkage.
    const inbox = await request(app).get("/api/inbox").set(h).expect(200);
    expect(inbox.body.emails).toHaveLength(2);
    const interview = inbox.body.emails.find((e: { providerMessageId: string }) => e.providerMessageId === "m-interview");
    expect(interview.classification).toBe("INTERVIEW_INVITATION");
    expect(interview.applicationId).toBe(applicationId);
    const news = await request(app).get("/api/inbox?classification=NEWSLETTER").set(h).expect(200);
    expect(news.body.emails).toHaveLength(1);

    // Second sync: no duplicates anywhere.
    const second = await request(app).post("/api/integrations/gmail/sync").set(h).send({ maxMessages: 25 }).expect(200);
    expect(second.body.sync.synced).toBe(2);
    expect(second.body.sync.eventsCreated).toBe(0);
    expect(second.body.sync.notificationsCreated).toBe(0);
    const events = await request(app).get(`/api/applications/${applicationId}/events`).set(h).expect(200);
    const gmailEvents = events.body.events.filter((e: { source: string }) => e.source === "GMAIL");
    expect(gmailEvents).toHaveLength(1);
    const notifs = await prisma.notification.findMany({ where: { userId: U("sync1") } });
    expect(notifs).toHaveLength(1);
  });

  it("protects illegal state transitions (evidence event only)", async () => {
    const messages: MockMessage[] = [
      {
        id: "m-iv",
        from: "talent@acme.com",
        subject: "Interview next steps",
        body: "We would like to invite you to interview for the Designer role at Acme.",
      },
    ];
    const h = await seedConnectedUser("protect", mockGmailFetch(messages).fetchImpl);
    const { applicationId } = await seedApplication(h, "Designer", "Acme", "DISCOVERED");
    // DISCOVERED -> INTERVIEW is illegal: state must stay, evidence recorded.
    const before = await request(app).get(`/api/applications/${applicationId}`).set(h).expect(200);
    expect(before.body.application.status).toBe("DISCOVERED");
    await request(app).post("/api/integrations/gmail/sync").set(h).send({ maxMessages: 10 }).expect(200);
    const after = await request(app).get(`/api/applications/${applicationId}`).set(h).expect(200);
    expect(after.body.application.status).toBe("DISCOVERED");
    const gmailEvents = after.body.application.events.filter((e: { source: string }) => e.source === "GMAIL");
    expect(gmailEvents).toHaveLength(1);
    expect(gmailEvents[0].oldStatus).toBe(gmailEvents[0].newStatus);
  });

  it("marks ambiguous matches NEEDS_REVIEW with candidates (never misattaches)", async () => {
    const messages: MockMessage[] = [
      {
        id: "m-amb",
        from: "jobs@acme.com",
        subject: "Update on your application",
        body: "Thank you for applying. Your application status is under review.",
      },
    ];
    const h = await seedConnectedUser("ambig", mockGmailFetch(messages).fetchImpl);
    await seedApplication(h, "Backend Engineer", "Acme");
    await seedApplication(h, "Backend Developer", "Acme");
    await request(app).post("/api/integrations/gmail/sync").set(h).send({ maxMessages: 10 }).expect(200);
    const row = await prisma.emailMessage.findFirst({ where: { userId: U("ambig") } });
    expect(row?.matchStatus).toBe("NEEDS_REVIEW");
    expect(row?.applicationId).toBeNull();
    const review = await request(app).get("/api/inbox?matchStatus=NEEDS_REVIEW").set(h).expect(200);
    expect(review.body.emails).toHaveLength(1);
    // No event was created for the ambiguous email.
    const events = await prisma.applicationEvent.findMany({
      where: { application: { userId: U("ambig") }, source: "GMAIL" },
    });
    expect(events).toHaveLength(0);
  });

  it("handles provider failures with safe categories", async () => {
    const { fetchImpl: fail401 } = mockGmailFetch([], { listStatus: 401 });
    const h1 = await seedConnectedUser("fail401", fail401);
    const r401 = await request(app).post("/api/integrations/gmail/sync").set(h1).send({ maxMessages: 5 }).expect(200);
    expect(r401.body.sync.status).toBe("REAUTH_REQUIRED");
    const st401 = await request(app).get("/api/integrations/gmail").set(h1).expect(200);
    expect(st401.body.integration.status).toBe("REAUTH_REQUIRED");

    const { fetchImpl: fail403 } = mockGmailFetch([], { listStatus: 403 });
    const h2 = await seedConnectedUser("fail403", fail403);
    const r403 = await request(app).post("/api/integrations/gmail/sync").set(h2).send({ maxMessages: 5 }).expect(200);
    expect(r403.body.sync.status).toBe("ERROR");
    expect(r403.body.sync.errors[0]).toMatch(/permission/);

    const { fetchImpl: fail429 } = mockGmailFetch([], { listStatus: 429 });
    const h3 = await seedConnectedUser("fail429", fail429);
    const r429 = await request(app).post("/api/integrations/gmail/sync").set(h3).send({ maxMessages: 5 }).expect(200);
    expect(r429.body.sync.errors[0]).toMatch(/rate limit/);
    expect(r429.body.sync.synced).toBe(0);
  });

  it("continues past per-message failures and enforces batch limits", async () => {
    const messages: MockMessage[] = [
      { id: "m-ok", from: "jobs@acme.com", subject: "Thanks for applying", body: "Thank you for applying to Acme." },
      { id: "m-bad", from: "jobs@acme.com", subject: "Broken", body: "x" },
    ];
    const h = await seedConnectedUser("partial", mockGmailFetch(messages, { failGetIds: ["m-bad"] }).fetchImpl);
    await seedApplication(h, "Backend Engineer", "Acme");
    const res = await request(app).post("/api/integrations/gmail/sync").set(h).send({ maxMessages: 10 }).expect(200);
    expect(res.body.sync.synced).toBe(1);
    expect(res.body.sync.errors.length).toBeGreaterThan(0);
    await request(app).post("/api/integrations/gmail/sync").set(h).send({ maxMessages: 101 }).expect(400);
  });

  it("disconnect removes credentials and stops syncing", async () => {
    const h = await seedConnectedUser("disc", mockGmailFetch([]).fetchImpl);
    const out = await request(app).post("/api/integrations/gmail/disconnect").set(h).expect(200);
    expect(out.body.integration.connected).toBe(false);
    expect(out.body.integration.status).toBe("DISCONNECTED");
    const row = await prisma.integration.findUnique({
      where: { userId_provider: { userId: U("disc"), provider: "google-gmail" } },
    });
    expect(row?.encryptedToken).toBeNull();
    const sync = await request(app).post("/api/integrations/gmail/sync").set(h).send({ maxMessages: 5 }).expect(200);
    expect(sync.body.sync.status).toBe("REAUTH_REQUIRED");
  });
});

// ---------- matcher + events (service level) ----------

describe.skipIf(!DB)("application-email matcher service", () => {
  function norm(partial: Partial<NormalizedEmail>): NormalizedEmail {
    return {
      providerMessageId: `m-${Math.random().toString(36).slice(2)}`,
      threadId: null,
      fromEmail: "x@example.com",
      fromName: null,
      toEmails: [],
      subject: "",
      snippet: "",
      bodyText: "",
      receivedAt: new Date().toISOString(),
      ...partial,
    };
  }

  it("matches on sender domain + title, leaves weak mail unmatched", async () => {
    const h = H("matchsvc");
    await seedConnectedUser("matchsvc");
    const { applicationId } = await seedApplication(h, "Backend Engineer", "Acme");
    const hit = await matchEmailToApplication(U("matchsvc"), norm({
      fromEmail: "jane@acme.com",
      subject: "Re: Backend Engineer interview",
      bodyText: "Interview for the Backend Engineer position.",
    }));
    expect(hit.status).toBe("MATCHED");
    expect(hit.applicationId).toBe(applicationId);
    const miss = await matchEmailToApplication(U("matchsvc"), norm({
      fromEmail: "news@digest.com",
      subject: "Weekly digest",
      bodyText: "Unsubscribe here.",
    }));
    expect(miss.status).toBe("UNMATCHED");
    expect(miss.applicationId).toBeNull();
  });

  it("processEmailForApplication is idempotent", async () => {
    const h = H("idemsvc");
    await seedConnectedUser("idemsvc");
    const messages: MockMessage[] = [
      { id: "m-rej", from: "talent@acme.com", subject: "Update", body: "Unfortunately, we will not be moving forward with your Backend Engineer application at Acme." },
    ];
    gmailProvider.setFetchImplForTests(mockGmailFetch(messages).fetchImpl);
    const { applicationId } = await seedApplication(h, "Backend Engineer", "Acme");
    await request(app).post("/api/integrations/gmail/sync").set(h).send({ maxMessages: 10 }).expect(200);
    const row = await prisma.emailMessage.findFirst({ where: { userId: U("idemsvc") } });
    expect(row?.applicationId).toBe(applicationId);
    const first = await processEmailForApplication(U("idemsvc"), row!.id);
    expect(first.eventCreated).toBe(false); // already processed by sync
    const events = await prisma.applicationEvent.findMany({ where: { applicationId, source: "GMAIL" } });
    expect(events).toHaveLength(1);
    const detail = await request(app).get(`/api/applications/${applicationId}`).set(h).expect(200);
    expect(detail.body.application.status).toBe("REJECTED");
  });
});

// ---------- user isolation ----------

describe.skipIf(!DB)("gmail user isolation", () => {
  it("never exposes another user's emails or integrations", async () => {
    const messages: MockMessage[] = [
      { id: "m-priv", from: "jobs@acme.com", subject: "Thanks for applying", body: "Thank you for applying to Acme Backend Engineer." },
    ];
    const h = await seedConnectedUser("owner", mockGmailFetch(messages).fetchImpl);
    await seedApplication(h, "Backend Engineer", "Acme");
    await request(app).post("/api/integrations/gmail/sync").set(h).send({ maxMessages: 10 }).expect(200);
    const row = await prisma.emailMessage.findFirst({ where: { userId: U("owner") } });

    const stranger = H("stranger");
    await request(app).get("/api/inbox").set(stranger).expect(200).then((res) => {
      expect(res.body.emails).toHaveLength(0);
    });
    await request(app).get(`/api/inbox/${row!.id}`).set(stranger).expect(404);
    const status = await request(app).get("/api/integrations/gmail").set(stranger).expect(200);
    expect(status.body.integration.connected).toBe(false);
  });
});
