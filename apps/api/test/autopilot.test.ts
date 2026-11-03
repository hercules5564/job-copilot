/**
 * Phase 20 — autopilot prepares applications up to a filled form.
 * Demo browser provider ONLY. Integration tests require PostgreSQL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "@jobcopilot/db";
import { createApp } from "../src/app.js";
import { demoBrowserProvider } from "../src/browser/index.js";
import type { DemoPage } from "../src/browser/providers/demo-browser.js";
import type { PageFormField } from "../src/browser/types.js";

const DB = Boolean(process.env.DATABASE_URL);
const TS = Date.now();
const U = (name: string) => `p20test-${name}-${TS}`;
const H = (name: string) => ({ "x-dev-user-id": U(name) });
const LOCAL_URL = "http://localhost:3000/demo-application";

const app = createApp();

function field(ref: string, partial: Partial<PageFormField> = {}): PageFormField {
  return {
    ref,
    label: "",
    name: "",
    type: "text",
    required: false,
    options: [],
    placeholder: "",
    autocomplete: "",
    currentValue: "",
    visible: true,
    disabled: false,
    ...partial,
  };
}

function demoPage(url: string): DemoPage {
  return {
    url,
    title: "Demo Application",
    fields: [
      field("input[0]", { label: "Full Name", name: "fullName", required: true, autocomplete: "name" }),
      field("input[1]", { label: "Email", name: "email", type: "email", required: true, autocomplete: "email" }),
      field("input[2]", { label: "Phone Number", name: "phone", type: "tel" }),
      field("input[3]", { label: "GitHub", name: "github", type: "url" }),
      field("input[4]", { label: "Years of Experience", name: "experience" }),
      field("textarea[5]", { label: "Cover Letter", name: "coverLetter", type: "textarea", required: true }),
      field("select[6]", { label: "Employment Type", name: "employmentType", type: "select", options: ["Full-time", "Part-time", "Contract"] }),
      field("input[7]", { label: "Favorite dinosaur?", name: "dinosaur" }),
      field("input[8]", { label: "Resume", name: "resume", type: "file" }),
      field("input[9]", { label: "Job portal password (do not automate)", name: "portalPassword", type: "password" }),
    ],
    hasSubmitButton: true,
    submitLabel: "Submit Application",
    submitBehavior: {
      type: "success",
      confirmationText: "Application submitted. Thank you!",
      confirmationUrl: `${url}#confirmation`,
    },
  };
}

beforeAll(() => {
  process.env.BROWSER_PROVIDER = "demo";
  demoBrowserProvider.setPages([demoPage(LOCAL_URL)]);
});

afterAll(async () => {
  delete process.env.BROWSER_PROVIDER;
  if (!DB) return;
  await prisma.user.deleteMany({ where: { id: { startsWith: "p20test-" } } });
  await prisma.$disconnect();
});

describe.skipIf(!DB)("autopilot", () => {
  it("fills a high-score match, stops before submission, and never duplicates", async () => {
    const userId = U("auto");
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@x.local`,
        name: "Ada Lovelace",
        profile: {
          create: {
            fullName: "Ada Lovelace",
            yearsOfExperience: 5,
            education: ["BSc Computer Science"],
            skills: ["TypeScript", "Node.js"],
            preferredLocations: ["Remote"],
            targetRoles: ["Backend Engineer"],
          },
        },
      },
    });
    const job = await prisma.job.create({
      data: {
        userId,
        companyName: "Acme",
        normalizedCompany: "acme",
        sourceKey: "demo",
        externalId: `auto-${TS}`,
        sourceUrl: LOCAL_URL,
        title: "Backend Engineer",
        normalizedTitle: "backend engineer",
        description: "Build services with TypeScript.",
      },
    });
    await prisma.jobMatch.create({
      data: {
        userId,
        jobId: job.id,
        overallScore: 95,
        decision: "STRONG_MATCH",
        skillScore: 95,
      },
    });
    await prisma.discoveryConfig.create({
      data: {
        userId,
        autopilotEnabled: true,
        autopilotMinScore: 80,
        autopilotMaxPerRun: 3,
      },
    });

    const res = await request(app).post("/api/autopilot/run").set(H("auto")).send({});
    expect(res.status).toBe(200);
    expect(res.body.autopilot.filled).toBe(1);
    expect(res.body.autopilot.items[0]).toMatchObject({
      status: "filled",
      adapter: "demo",
      jobId: job.id,
    });
    const runId = res.body.autopilot.items[0].runId as string;
    const applicationId = res.body.autopilot.items[0].applicationId as string;

    const run = await prisma.applicationRun.findUnique({ where: { id: runId } });
    expect(run?.status).toBe("WAITING_FOR_SUBMISSION");
    expect(run?.submissionConfirmedAt).toBeNull();

    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    expect(application?.status).toBe("READY");
    expect(application?.mode).toBe("APPROVAL");
    expect(
      await prisma.applicationEvent.count({
        where: { applicationId, newStatus: "APPLIED" },
      }),
    ).toBe(0);

    // A second run must not create a duplicate application/run.
    const again = await request(app).post("/api/autopilot/run").set(H("auto")).send({});
    expect(again.status).toBe(200);
    expect(again.body.autopilot.evaluated).toBe(0);
    expect(await prisma.application.count({ where: { userId } })).toBe(1);
    expect(await prisma.applicationRun.count({ where: { userId } })).toBe(1);
  });

  it("refuses to run when disabled", async () => {
    const userId = U("off");
    await prisma.user.create({ data: { id: userId, email: `${userId}@x.local` } });
    await prisma.discoveryConfig.create({ data: { userId, autopilotEnabled: false } });
    const res = await request(app).post("/api/autopilot/run").set(H("off")).send({});
    expect(res.status).toBe(422);
  });

  it("skips jobs without a supported application URL", async () => {
    const userId = U("skip");
    await prisma.user.create({ data: { id: userId, email: `${userId}@x.local` } });
    const job = await prisma.job.create({
      data: {
        userId,
        companyName: "Blocked Co",
        normalizedCompany: "blocked co",
        sourceKey: "manual",
        externalId: `skip-${TS}`,
        sourceUrl: "https://www.linkedin.com/jobs/view/123",
        title: "Engineer",
        normalizedTitle: "engineer",
        description: "Not automatable.",
      },
    });
    await prisma.jobMatch.create({
      data: { userId, jobId: job.id, overallScore: 99, decision: "STRONG_MATCH" },
    });
    await prisma.discoveryConfig.create({
      data: { userId, autopilotEnabled: true, autopilotMinScore: 80 },
    });
    const res = await request(app).post("/api/autopilot/run").set(H("skip")).send({});
    expect(res.status).toBe(200);
    expect(res.body.autopilot.skipped).toBe(1);
    expect(res.body.autopilot.items[0].status).toBe("skipped");
    expect(await prisma.application.count({ where: { userId } })).toBe(0);
  });
});
