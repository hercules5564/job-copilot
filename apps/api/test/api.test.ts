import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { canTransition } from "@jobcopilot/shared";

const app = createApp();

// Unique identity per run: with DATABASE_URL set these tests exercise the
// Prisma path, where job fingerprints are deduplicated per user.
const H = { "x-dev-user-id": `phase1-${Date.now()}` };

describe("health", () => {
  it("GET /api/health returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("jobs + applications flow", () => {
  it("creates a job, creates an application, transitions status", async () => {
    const jobRes = await request(app).post("/api/jobs").set(H).send({
      title: "Backend Engineer",
      company: "Acme",
      description: "Build APIs",
    });
    expect(jobRes.status).toBe(201);

    const appRes = await request(app)
      .post("/api/applications")
      .set(H)
      .send({ jobId: jobRes.body.job.id });
    expect(appRes.status).toBe(201);
    expect(appRes.body.application.status).toBe("DISCOVERED");

    const bad = await request(app)
      .patch(`/api/applications/${appRes.body.application.id}/status`)
      .set(H)
      .send({ toStatus: "OFFER" });
    expect(bad.status).toBe(422);

    const good = await request(app)
      .patch(`/api/applications/${appRes.body.application.id}/status`)
      .set(H)
      .send({ toStatus: "MATCHED" });
    expect(good.status).toBe(200);
    expect(good.body.application.status).toBe("MATCHED");
  });

  it("rejects invalid job payload", async () => {
    const res = await request(app).post("/api/jobs").set(H).send({ title: "" });
    expect(res.status).toBe(400);
  });
});

describe("state machine", () => {
  it("matches shared transition rules", () => {
    expect(canTransition("DISCOVERED", "MATCHED")).toBe(true);
    expect(canTransition("DISCOVERED", "OFFER")).toBe(false);
  });
});
