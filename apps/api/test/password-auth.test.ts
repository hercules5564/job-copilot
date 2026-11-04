/**
 * Phase 21 — email + password authentication.
 * Unit tests run everywhere; integration tests require PostgreSQL.
 */
import { describe, it, expect, afterAll, afterEach, beforeAll } from "vitest";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import { createApp } from "../src/app.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { findOrCreateUserForIdentity } from "../src/auth/account-linking.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const EMAIL = `p21test-${TS}@example.com`;
const PASSWORD = "correct-horse-battery";

const app = createApp();

beforeAll(() => {
  process.env.AUTH_DEV_BYPASS = "true";
});

afterEach(() => {
  process.env.AUTH_DEV_BYPASS = "true";
});

afterAll(async () => {
  if (!DB) return;
  await prisma.user.deleteMany({ where: { email: { startsWith: "p21test-" } } });
  await prisma.$disconnect();
});

function firstCookie(res: request.Response): string {
  const header = res.headers["set-cookie"] as unknown;
  const list = Array.isArray(header) ? header : typeof header === "string" ? [header] : [];
  return String(list[0] ?? "").split(";")[0] ?? "";
}

describe("password hashing", () => {
  it("hashes with a random salt and verifies only the right password", async () => {
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);
    expect(a).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain(PASSWORD);
    await expect(verifyPassword(PASSWORD, a)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", a)).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, null)).resolves.toBe(false);
    await expect(verifyPassword(PASSWORD, "not-a-hash")).resolves.toBe(false);
  });
});

describe.skipIf(!DB)("password auth API", () => {
  it("registers, sets an HttpOnly session, and never returns the hash", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: EMAIL, password: PASSWORD, name: "Test User" });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(EMAIL);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    const cookie = firstCookie(res);
    expect(cookie.startsWith("jobpilot_session=")).toBe(true);

    const stored = await prisma.user.findUnique({ where: { email: EMAIL } });
    expect(stored?.passwordHash).toMatch(/^scrypt\$/);

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(EMAIL);
    expect(JSON.stringify(me.body)).not.toContain("passwordHash");
  });

  it("rejects duplicate registration and weak passwords", async () => {
    const dup = await request(app)
      .post("/api/auth/register")
      .send({ email: EMAIL, password: PASSWORD });
    expect(dup.status).toBe(409);

    const weak = await request(app)
      .post("/api/auth/register")
      .send({ email: `p21test-weak-${TS}@example.com`, password: "short" });
    expect(weak.status).toBe(400);
  });

  it("logs in, rejects wrong credentials, and logout revokes the session", async () => {
    const wrong = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: "wrong-password" });
    expect(wrong.status).toBe(401);

    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ email: `p21test-missing-${TS}@example.com`, password: PASSWORD });
    expect(unknown.status).toBe(401);

    const ok = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL.toUpperCase(), password: PASSWORD });
    expect(ok.status).toBe(200);
    const cookie = firstCookie(ok);

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);

    const out = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(out.status).toBe(200);

    const after = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(after.status).toBe(401);
  });

  it("never links a Google identity onto an unverified password account", async () => {
    const linkEmail = `p21test-link-${TS}@example.com`;
    await prisma.user.create({
      data: { email: linkEmail, passwordHash: await hashPassword(PASSWORD) },
    });
    await expect(
      findOrCreateUserForIdentity({
        provider: "google",
        providerAccountId: `p21-google-${TS}`,
        email: linkEmail,
        emailVerified: true,
        name: "Someone",
      }),
    ).rejects.toThrow(/Sign in with your password/);
  });
});
