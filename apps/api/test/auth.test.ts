/**
 * Phase 9 tests — real session authentication + Google OIDC login.
 * Unit describes run everywhere; DB describes REQUIRE PostgreSQL.
 * Google OAuth is exercised through a mocked HTTP layer (no live Google).
 * Isolation: rows belong to users `p9test-<name>-<ts>`, removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import { createApp } from "../src/app.js";
import { devBypassEnabled } from "../src/auth/auth-config.js";
import { csrfAllowed } from "../src/middleware/csrf.js";
import { rateLimit, resetRateLimits } from "../src/middleware/rate-limit.js";
import { getSessionToken, parseCookies, serializeSessionCookie } from "../src/auth/cookies.js";
import { generateSessionToken, hashSessionToken, createSession, validateSession, revokeSession } from "../src/auth/session.js";
import { issueLoginState, validateLoginState, buildLoginUrl, isAppGoogleConfigured } from "../src/auth/google.js";
import { ensureUser } from "../src/services/users.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const U = (name: string) => `p9test-${name}-${TS}`;
// Run-unique OAuth fixture identity (hermetic reruns; cleaned in afterAll).
const OAUTH_EMAIL = `p9oauth-${TS}@example.com`;
const OAUTH_SUB = `google-sub-p9-${TS}`;

const TEST_AUTH_SECRET = "p9-test-auth-secret-min-32-chars-xyz";
const TEST_GOOGLE_ID = "p9-test-google-client-id";
const TEST_GOOGLE_SECRET = "p9-test-google-client-secret";

const app = createApp();

function savedEnv() {
  return {
    bypass: process.env.AUTH_DEV_BYPASS,
    nodeEnv: process.env.NODE_ENV,
    secret: process.env.AUTH_SESSION_SECRET,
    gid: process.env.GOOGLE_AUTH_CLIENT_ID,
    gsecret: process.env.GOOGLE_AUTH_CLIENT_SECRET,
  };
}
const ENV0 = savedEnv();
function restoreEnv() {
  for (const [k, v] of Object.entries(ENV0) as [keyof typeof ENV0, string | undefined][]) {
    const key = { bypass: "AUTH_DEV_BYPASS", nodeEnv: "NODE_ENV", secret: "AUTH_SESSION_SECRET", gid: "GOOGLE_AUTH_CLIENT_ID", gsecret: "GOOGLE_AUTH_CLIENT_SECRET" }[k];
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
}
function bypassOff() {
  delete process.env.AUTH_DEV_BYPASS;
}
function bypassOn() {
  process.env.AUTH_DEV_BYPASS = "true";
}

beforeAll(() => {
  process.env.AUTH_SESSION_SECRET = TEST_AUTH_SECRET;
  process.env.GOOGLE_AUTH_CLIENT_ID = TEST_GOOGLE_ID;
  process.env.GOOGLE_AUTH_CLIENT_SECRET = TEST_GOOGLE_SECRET;
  resetRateLimits();
});

afterEach(() => {
  restoreEnv();
  process.env.AUTH_DEV_BYPASS = "true";
  process.env.AUTH_SESSION_SECRET = TEST_AUTH_SECRET;
  process.env.GOOGLE_AUTH_CLIENT_ID = TEST_GOOGLE_ID;
  process.env.GOOGLE_AUTH_CLIENT_SECRET = TEST_GOOGLE_SECRET;
  resetRateLimits();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  restoreEnv();
  if (!DB) return;
  await prisma.user.deleteMany({ where: { id: { startsWith: "p9test-" } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: "p9oauth-" } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: "p9unverified-" } } });
  await prisma.$disconnect();
});

function sessionCookie(token: string): string {
  return `jobpilot_session=${encodeURIComponent(token)}`;
}

// ---------- unit: tokens ----------

describe("session token primitives", () => {
  it("generates unique opaque tokens and one-way hashes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const t = generateSessionToken();
      expect(t).toMatch(/^[A-Za-z0-9\-_]+$/);
      expect(t.length).toBeGreaterThanOrEqual(40);
      seen.add(t);
      const h = hashSessionToken(t);
      expect(h).toMatch(/^[0-9a-f]{64}$/);
      expect(h).not.toContain(t.slice(0, 8));
      expect(hashSessionToken(t)).toBe(h);
    }
    expect(seen.size).toBe(50);
  });
});

// ---------- unit: cookies ----------

describe("session cookies", () => {
  it("parses and validates the session cookie", () => {
    const t = generateSessionToken();
    expect(getSessionToken(`a=1; jobpilot_session=${t}; b=2`)).toBe(t);
    expect(getSessionToken(undefined)).toBeNull();
    expect(getSessionToken("")).toBeNull();
    expect(getSessionToken("jobpilot_session=short")).toBeNull();
    expect(getSessionToken("jobpilot_session=<script>")).toBeNull();
    expect(parseCookies("a=1; a=2")["a"]).toBe("1");
  });

  it("serializes HttpOnly SameSite=Lax cookies, Secure only in production", () => {
    const t = generateSessionToken();
    const set = serializeSessionCookie(t);
    expect(set.startsWith(`jobpilot_session=${encodeURIComponent(t)};`)).toBe(true);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    expect(set).toContain("Path=/");
    expect(set).toContain("Max-Age=");
    expect(set).not.toContain("Secure");
    process.env.NODE_ENV = "production";
    expect(serializeSessionCookie(t)).toContain("Secure");
  });
});

// ---------- unit: OAuth state ----------

describe("login state tokens", () => {
  it("round-trips and rejects tampering, expiry, and wrong purpose", () => {
    expect(isAppGoogleConfigured()).toBe(true);
    const { state } = issueLoginState();
    const v = validateLoginState(state);
    expect(v.verifier.length).toBeGreaterThanOrEqual(43);

    const [encoded, sig] = state.split(".");
    expect(() => validateLoginState(`${encoded}X.${sig}`)).toThrowError(/Invalid or expired/);
    expect(() => validateLoginState("garbage")).toThrowError(/Invalid or expired/);
    expect(() => validateLoginState(`${encoded}.AAAA`)).toThrowError(/Invalid or expired/);

    // Expired payload, correctly signed.
    const expired = JSON.stringify({ purpose: "app-login", nonce: "n", verifier: "v", exp: Date.now() - 1000 });
    const enc = Buffer.from(expired).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const signature = createHmac("sha256", TEST_AUTH_SECRET).update(enc).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(() => validateLoginState(`${enc}.${signature}`)).toThrowError(/Invalid or expired/);

    // Wrong purpose (e.g. a Gmail state replayed here).
    const other = JSON.stringify({ purpose: "gmail-link", nonce: "n", verifier: "v", exp: Date.now() + 60000 });
    const enc2 = Buffer.from(other).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const sig2 = createHmac("sha256", TEST_AUTH_SECRET).update(enc2).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(() => validateLoginState(`${enc2}.${sig2}`)).toThrowError(/Invalid or expired/);
  });

  it("builds a Google URL with PKCE and minimal scopes", () => {
    const url = buildLoginUrl();
    expect(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")).toBe(true);
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain("code_challenge=");
    expect(url).toContain("scope=openid+email+profile");
    expect(url).not.toContain("gmail.readonly");
  });

  it("round-trips a safe post-login destination and drops unsafe ones", () => {
    const safe = issueLoginState(undefined, "/jobs?query=designer#top");
    expect(validateLoginState(safe.state).next).toBe("/jobs?query=designer#top");

    for (const unsafe of [
      "https://evil.example/steal",
      "//evil.example/steal",
      "/\\evil.example/steal",
      "/login?next=/dashboard",
      "/login",
      "/dashboard\nLocation: https://evil.example",
    ]) {
      const issued = issueLoginState(undefined, unsafe);
      expect(validateLoginState(issued.state).next).toBeNull();
    }

    const url = new URL(buildLoginUrl("/applications/app_1"));
    const state = url.searchParams.get("state") ?? "";
    expect(validateLoginState(state).next).toBe("/applications/app_1");
  });
});

// ---------- unit: CSRF + rate limit + bypass ----------

describe("csrf decisions", () => {
  it("allows safe methods and originless clients, blocks foreign origins on writes", () => {
    expect(csrfAllowed("GET", "https://evil.com", undefined)).toBe(true);
    expect(csrfAllowed("POST", undefined, undefined)).toBe(true);
    expect(csrfAllowed("POST", "http://localhost:3000", undefined)).toBe(true);
    expect(csrfAllowed("POST", "https://evil.com", undefined)).toBe(false);
    expect(csrfAllowed("DELETE", undefined, "https://evil.com/x")).toBe(false);
    expect(csrfAllowed("PATCH", undefined, "http://localhost:3000/jobs")).toBe(true);
    expect(csrfAllowed("POST", "not-a-url", undefined)).toBe(false);
  });
});

describe("rate limiter", () => {
  function mockRes() {
    return { statusCode: 0, headers: {} as Record<string, string>, status(c: number) { this.statusCode = c; return this; }, json(_b: unknown) { return this; }, setHeader(k: string, v: string) { this.headers[k] = v; } };
  }
  it("allows within budget and rejects beyond, then resets", () => {
    const mw = rateLimit("unit", { windowMs: 60000, max: 3 });
    const req = { headers: {}, socket: { remoteAddress: "10.9.9.9" } } as never;
    let next = 0;
    for (let i = 0; i < 3; i++) mw(req, mockRes() as never, (() => { next += 1; }) as never);
    expect(next).toBe(3);
    const res = mockRes();
    mw(req, res as never, (() => { next += 1; }) as never);
    expect(res.statusCode).toBe(429);
    expect(next).toBe(3);
    resetRateLimits();
    mw(req, mockRes() as never, (() => { next += 1; }) as never);
    expect(next).toBe(4);
  });
});

describe("dev bypass fail-closed", () => {
  it("is on in tests and impossible in production", () => {
    expect(devBypassEnabled()).toBe(true);
    process.env.NODE_ENV = "production";
    expect(devBypassEnabled()).toBe(false);
  });
});

// ---------- integration: sessions over HTTP ----------

describe.skipIf(!DB)("session authentication", () => {
  async function sessionFor(name: string): Promise<{ token: string; userId: string }> {
    const userId = U(name);
    await ensureUser(userId);
    const s = await createSession(userId, { userAgent: "p9-test-agent" });
    return { token: s.token, userId };
  }

  it("stores only the hash, never the raw token", async () => {
    const { token, userId } = await sessionFor("hash");
    const row = await prisma.authSession.findFirst({ where: { userId } });
    expect(row).not.toBeNull();
    expect(row!.sessionTokenHash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(JSON.stringify(row)).not.toContain(token.slice(0, 12));
  });

  it("authenticates /me with a valid cookie and returns safe fields only", async () => {
    bypassOff();
    const { token, userId } = await sessionFor("me");
    const res = await request(app).get("/api/auth/me").set("Cookie", sessionCookie(token)).expect(200);
    expect(res.body.user.id).toBe(userId);
    expect(typeof res.body.user.email).toBe("string");
    const dump = JSON.stringify(res.body);
    expect(dump).not.toMatch(/sessionTokenHash|accessToken|refreshToken|secret|cookie/i);
    expect(Object.keys(res.body.user).sort()).toEqual(
      ["avatarUrl", "email", "emailVerifiedAt", "id", "name"].sort(),
    );
  });

  it("does not auto-authenticate from AUTH_DEV_BYPASS without the explicit header", async () => {
    bypassOn();
    await request(app).get("/api/auth/me").expect(401);
    await request(app).get("/api/jobs").expect(401);
    await request(app).get("/api/analytics").expect(401);
  });

  it("rejects missing, tampered, expired, and revoked sessions with 401", async () => {
    bypassOff();
    await request(app).get("/api/auth/me").expect(401);
    await request(app).get("/api/jobs").expect(401);
    const { token, userId } = await sessionFor("reject");
    await request(app).get("/api/auth/me").set("Cookie", sessionCookie(token + "X")).expect(401);
    await request(app).get("/api/auth/me").set("Cookie", "jobpilot_session=short").expect(401);
    // Expired.
    await prisma.authSession.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await request(app).get("/api/auth/me").set("Cookie", sessionCookie(token)).expect(401);
    const expired = await prisma.authSession.findFirst({ where: { userId } });
    expect(expired!.revokedAt).not.toBeNull();
    // Revoked.
    const fresh = await createSession(userId);
    await revokeSession(fresh.token);
    await request(app).get("/api/auth/me").set("Cookie", sessionCookie(fresh.token)).expect(401);
    // Revocation is idempotent.
    await revokeSession(fresh.token);
  });

  it("logout revokes the session, clears the cookie, and is idempotent", async () => {
    bypassOff();
    const { token } = await sessionFor("logout");
    const res = await request(app).post("/api/auth/logout").set("Cookie", sessionCookie(token)).expect(200);
    expect(res.body.ok).toBe(true);
    const cleared = (res.headers["set-cookie"] as unknown as string[]).join(";");
    expect(cleared).toContain("jobpilot_session=");
    expect(cleared).toContain("Max-Age=0");
    await request(app).get("/api/auth/me").set("Cookie", sessionCookie(token)).expect(401);
    const again = await request(app).post("/api/auth/logout").expect(200);
    expect(again.body.ok).toBe(true);
  });

  it("enforces ownership with real sessions, not headers", async () => {
    bypassOff();
    const a = await sessionFor("ownerA");
    const b = await sessionFor("ownerB");
    const job = await request(app).post("/api/jobs").set("Cookie", sessionCookie(a.token)).send({ title: "T", company: "C", description: "x" }).expect(201);
    const appRes = await request(app).post("/api/applications").set("Cookie", sessionCookie(a.token)).send({ jobId: job.body.job.id }).expect(201);
    const appId = appRes.body.application.id as string;
    await request(app).get(`/api/applications/${appId}`).set("Cookie", sessionCookie(b.token)).expect(404);
    await request(app).get(`/api/applications/${appId}`).set("Cookie", sessionCookie(a.token)).expect(200);
    // Header spoofing no longer authenticates.
    await request(app).get(`/api/applications/${appId}`).set("x-dev-user-id", a.userId).expect(401);
  });
});

// ---------- integration: CSRF over HTTP ----------

describe.skipIf(!DB)("csrf guard", () => {
  it("blocks foreign origins on writes, allows reads and originless writes", async () => {
    bypassOff();
    const userId = U("csrf");
    await ensureUser(userId);
    const { token } = await createSession(userId);
    const cookie = sessionCookie(token);
    await request(app).get("/api/jobs").set("Cookie", cookie).set("Origin", "https://evil.example.com").expect(200);
    await request(app).post("/api/jobs").set("Cookie", cookie).set("Origin", "https://evil.example.com").send({ title: "T", company: "C", description: "x" }).expect(403);
    await request(app).post("/api/jobs").set("Cookie", cookie).send({ title: "T", company: "C", description: "x-live" }).expect(201);
    await request(app).post("/api/jobs").set("Cookie", cookie).set("Origin", "http://localhost:3000").send({ title: "T2", company: "C", description: "x" }).expect(201);
  });
});

// ---------- integration: OAuth callback fixture (mocked Google) ----------

describe.skipIf(!DB)("google login fixture", () => {
  function mockGoogle(opts: { userinfo?: Record<string, unknown>; tokenStatus?: number } = {}) {
    let tokenCalls = 0;
    vi.stubGlobal("fetch", async (url: unknown) => {
      const u = String(url);
      if (u.includes("oauth2.googleapis.com/token")) {
        tokenCalls += 1;
        if ((opts.tokenStatus ?? 200) !== 200 || tokenCalls > 1) {
          return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
        }
        return new Response(JSON.stringify({ access_token: "mock-access", id_token: "mock-id", expires_in: 3600 }), { status: 200 });
      }
      if (u.includes("userinfo")) {
        return new Response(
          JSON.stringify({
            sub: OAUTH_SUB,
            email: OAUTH_EMAIL,
            email_verified: true,
            name: "OAuth User",
            picture: "https://example.com/a.png",
            ...(opts.userinfo ?? {}),
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    return { tokenCalls: () => tokenCalls };
  }

  it("completes login: user + linked account + session cookie + dashboard redirect", async () => {
    bypassOff();
    mockGoogle();
    const before = await prisma.authSession.count({ where: { user: { email: OAUTH_EMAIL } } });
    const { state } = issueLoginState();
    const res = await request(app).get(`/api/auth/google/callback?code=authcode-1&state=${encodeURIComponent(state)}`).expect(302);
    expect(res.headers.location).toBe("http://localhost:3000/dashboard");
    const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(";");
    expect(setCookie).toContain("jobpilot_session=");
    expect(setCookie).toContain("HttpOnly");
    const raw = /jobpilot_session=([^;]+)/.exec(setCookie)?.[1];
    expect(raw).toBeTruthy();
    const user = await prisma.user.findUnique({ where: { email: OAUTH_EMAIL } });
    expect(user).not.toBeNull();
    expect(user!.emailVerifiedAt).not.toBeNull();
    const account = await prisma.authAccount.findUnique({ where: { provider_providerAccountId: { provider: "google", providerAccountId: OAUTH_SUB } } });
    expect(account?.userId).toBe(user!.id);
    const after = await prisma.authSession.count({ where: { userId: user!.id } });
    expect(after).toBe(before + 1);
    // The fresh session authenticates.
    const me = await request(app).get("/api/auth/me").set("Cookie", `jobpilot_session=${raw}`).expect(200);
    expect(me.body.user.email).toBe(OAUTH_EMAIL);
    // No duplicate user on second login; a second session is minted (no fixation).
    mockGoogle();
    const res2 = await request(app).get(`/api/auth/google/callback?code=authcode-2&state=${encodeURIComponent(issueLoginState().state)}`).expect(302);
    const raw2 = /jobpilot_session=([^;]+)/.exec((res2.headers["set-cookie"] as unknown as string[]).join(";"))?.[1];
    expect(raw2).toBeTruthy();
    expect(raw2).not.toBe(raw);
    expect(await prisma.user.count({ where: { email: OAUTH_EMAIL } })).toBe(1);
  });

  it("rejects invalid state, expired state, and provider failures without creating sessions", async () => {
    mockGoogle();
    const countBefore = await prisma.authSession.count();
    await request(app).get("/api/auth/google/callback?code=x&state=tampered").expect(302).expect("Location", /error=invalid_state/);
    expect(await prisma.authSession.count()).toBe(countBefore);
    // Expired state.
    const expired = JSON.stringify({ purpose: "app-login", nonce: "n", verifier: "v", exp: Date.now() - 1000 });
    const enc = Buffer.from(expired).toString("base64url");
    const sig = createHmac("sha256", TEST_AUTH_SECRET).update(enc).digest("base64url");
    await request(app).get(`/api/auth/google/callback?code=x&state=${encodeURIComponent(`${enc}.${sig}`)}`).expect(302).expect("Location", /error=invalid_state/);
    // Unverified email cannot sign in.
    const unverifiedEmail = `p9unverified-${TS}@example.com`;
    mockGoogle({ userinfo: { sub: `google-sub-unverified-${TS}`, email: unverifiedEmail, email_verified: false } });
    await request(app).get(`/api/auth/google/callback?code=x&state=${encodeURIComponent(issueLoginState().state)}`).expect(302).expect("Location", /error=oauth_failed/);
    expect(await prisma.user.findUnique({ where: { email: unverifiedEmail } })).toBeNull();
    expect(await prisma.authSession.count()).toBe(countBefore);
  });

  it("does not duplicate sessions when an authorization code is replayed", async () => {
    const gate = mockGoogle();
    const { state } = issueLoginState();
    await request(app).get(`/api/auth/google/callback?code=replay-code&state=${encodeURIComponent(state)}`).expect(302);
    expect(gate.tokenCalls()).toBe(1);
    const countAfterFirst = await prisma.authSession.count();
    // Same state + same code replayed: Google rejects the reused code.
    await request(app).get(`/api/auth/google/callback?code=replay-code&state=${encodeURIComponent(state)}`).expect(302).expect("Location", /error=oauth_failed/);
    expect(gate.tokenCalls()).toBe(2);
    expect(await prisma.authSession.count()).toBe(countAfterFirst);
  });

  it("redirects to login with a safe code when Google auth is unconfigured", async () => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_AUTH_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    await request(app).get("/api/auth/google").expect(302).expect("Location", /error=oauth_not_configured/);
  });

  it("never mixes app sessions with Gmail integration tokens", async () => {
    mockGoogle();
    const { state } = issueLoginState();
    await request(app).get(`/api/auth/google/callback?code=iso-code&state=${encodeURIComponent(state)}`).expect(302);
    // Scoped to the login user: parallel suites also write integrations.
    expect(await prisma.integration.count({ where: { user: { email: OAUTH_EMAIL } } })).toBe(0);
  });
});
