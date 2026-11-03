/**
 * Phase 19 tests — production CORS allowlist.
 * In production only the configured FRONTEND_URL is a permitted origin;
 * the localhost development exception must not leak into production.
 * No DB required (preflight never reaches auth/routes).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";

const REAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...REAL_ENV };
  vi.resetModules();
});

async function prodAppWithFrontend(url: string) {
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_URL = url;
  const { createApp } = await import("../src/app.js");
  return createApp();
}

describe("production CORS", () => {
  it("rejects the localhost dev origin when the frontend is a real domain", async () => {
    const app = await prodAppWithFrontend("https://app.example.com");
    const preflight = await request(app)
      .options("/api/applications")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "POST");
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows the configured frontend origin in production", async () => {
    const app = await prodAppWithFrontend("https://app.example.com");
    const preflight = await request(app)
      .options("/api/applications")
      .set("Origin", "https://app.example.com")
      .set("Access-Control-Request-Method", "POST");
    expect(preflight.headers["access-control-allow-origin"]).toBe("https://app.example.com");
  });

  it("keeps the localhost exception outside production", async () => {
    process.env.NODE_ENV = "test";
    process.env.FRONTEND_URL = "https://app.example.com";
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const preflight = await request(app)
      .options("/api/applications")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "POST");
    expect(preflight.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
});
