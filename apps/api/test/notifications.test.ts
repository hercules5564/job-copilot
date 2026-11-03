/**
 * Phase 11 tests — notification center API: listing, unread count,
 * idempotent mark-read, ownership isolation, validation, field hygiene.
 * Requires PostgreSQL. Isolation: users `p11test-<name>-<ts>`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import { createApp } from "../src/app.js";
import { createNotification } from "../src/services/notifications.js";
import { ensureUser } from "../src/services/users.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const U = (name: string) => `p11test-${name}-${TS}`;
const H = (name: string) => ({ "x-dev-user-id": U(name) });

const app = createApp();

async function seedNotifications(name: string, count: number): Promise<string[]> {
  const userId = U(name);
  await ensureUser(userId);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const { notification } = await createNotification(userId, {
      type: "test",
      title: `Note ${i}`,
      body: `Body ${i}`,
    });
    ids.push(notification.id);
  }
  return ids;
}

beforeAll(async () => {
  if (!DB) return;
  await seedNotifications("reader", 3);
});

afterAll(async () => {
  if (!DB) return;
  await prisma.user.deleteMany({ where: { id: { startsWith: "p11test-" } } });
  await prisma.$disconnect();
});

describe.skipIf(!DB)("notifications API", () => {
  it("lists authenticated notifications newest-first", async () => {
    const res = await request(app).get("/api/notifications").set(H("reader")).expect(200);
    expect(res.body.notifications).toHaveLength(3);
    const titles = res.body.notifications.map((n: { title: string }) => n.title);
    expect(titles).toEqual(["Note 2", "Note 1", "Note 0"]);
  });

  it("filters unreadOnly and validates limit", async () => {
    const ids = await seedNotifications("filter", 2);
    await request(app).patch(`/api/notifications/${ids[0]}`).set(H("filter")).expect(200);
    const unread = await request(app).get("/api/notifications?unreadOnly=true").set(H("filter")).expect(200);
    expect(unread.body.notifications).toHaveLength(1);
    expect(unread.body.notifications[0].id).toBe(ids[1]);
    const all = await request(app).get("/api/notifications?unreadOnly=false").set(H("filter")).expect(200);
    expect(all.body.notifications).toHaveLength(2);
    const limited = await request(app).get("/api/notifications?limit=1").set(H("filter")).expect(200);
    expect(limited.body.notifications).toHaveLength(1);
    await request(app).get("/api/notifications?limit=500").set(H("filter")).expect(400);
    await request(app).get("/api/notifications?limit=0").set(H("filter")).expect(400);
    await request(app).get("/api/notifications?unreadOnly=yes").set(H("filter")).expect(400);
  });

  it("returns the unread count without side effects", async () => {
    const before = await request(app).get("/api/notifications/unread-count").set(H("reader")).expect(200);
    expect(before.body).toEqual({ unread: 3 });
    // No side effects: count is stable across reads.
    const again = await request(app).get("/api/notifications/unread-count").set(H("reader")).expect(200);
    expect(again.body).toEqual({ unread: 3 });
  });

  it("marks a notification read, idempotently", async () => {
    const ids = await seedNotifications("markread", 1);
    const first = await request(app).patch(`/api/notifications/${ids[0]}`).set(H("markread")).expect(200);
    expect(first.body.notification.id).toBe(ids[0]);
    expect(first.body.notification.read).toBe(true);
    const second = await request(app).patch(`/api/notifications/${ids[0]}`).set(H("markread")).expect(200);
    expect(second.body.notification.read).toBe(true);
    const count = await request(app).get("/api/notifications/unread-count").set(H("markread")).expect(200);
    expect(count.body).toEqual({ unread: 0 });
  });

  it("returns 404 for foreign and missing notifications", async () => {
    const ids = await seedNotifications("owner", 1);
    await request(app).patch(`/api/notifications/${ids[0]}`).set(H("stranger")).expect(404);
    await request(app).patch("/api/notifications/does-not-exist").set(H("owner")).expect(404);
    // Stranger's list never contains the owner's rows.
    const list = await request(app).get("/api/notifications").set(H("stranger")).expect(200);
    expect(list.body.notifications).toEqual([]);
    const count = await request(app).get("/api/notifications/unread-count").set(H("stranger")).expect(200);
    expect(count.body).toEqual({ unread: 0 });
  });

  it("rejects unauthenticated access consistently", async () => {
    const saved = process.env.AUTH_DEV_BYPASS;
    delete process.env.AUTH_DEV_BYPASS;
    try {
      await request(app).get("/api/notifications").expect(401);
      await request(app).get("/api/notifications/unread-count").expect(401);
      await request(app).patch("/api/notifications/whatever").expect(401);
    } finally {
      if (saved !== undefined) process.env.AUTH_DEV_BYPASS = saved;
    }
  });

  it("exposes only safe fields", async () => {
    const res = await request(app).get("/api/notifications").set(H("reader")).expect(200);
    for (const n of res.body.notifications) {
      expect(Object.keys(n).sort()).toEqual(
        ["applicationId", "body", "createdAt", "emailMessageId", "id", "read", "title", "type"].sort(),
      );
      expect(n).not.toHaveProperty("userId");
    }
    expect(JSON.stringify(res.body)).not.toMatch(/token|secret|cookie|password/i);
  });
});
