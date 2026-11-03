import { describe, it, expect } from "vitest";
import {
  canTransition,
  CreateJobSchema,
  CreateResumeSchema,
  CreateProjectSchema,
  CreateApplicationSchema,
  JobMatchUpsertSchema,
  TransitionApplicationSchema,
  UpdateProfileSchema,
} from "@jobcopilot/shared";
import { normalize, fingerprint } from "../src/services/jobs.js";
import { HttpError, mapPrismaError } from "../src/services/errors.js";

describe("normalize + fingerprint (dedup helpers)", () => {
  it("normalizes case, punctuation, and whitespace", () => {
    expect(normalize("  Senior  Backend-Engineer!! ")).toBe("senior backend engineer");
  });

  it("is deterministic and sensitive to company/title", () => {
    const base = { company: "Acme", title: "Backend Engineer" };
    expect(fingerprint(base)).toBe(fingerprint({ ...base }));
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, company: "Acme Inc" }));
    expect(fingerprint(base)).not.toBe(fingerprint({ ...base, location: "Remote" }));
  });
});

describe("Prisma error mapping (no raw DB errors leak)", () => {
  it("maps P2002 -> 409, P2025/P2003 -> 404, unknown -> 500", () => {
    for (const [code, status] of [["P2002", 409], ["P2025", 404], ["P2003", 404]] as const) {
      try {
        mapPrismaError({ code });
        expect.unreachable();
      } catch (err) {
        expect((err as HttpError).status).toBe(status);
      }
    }
    try {
      mapPrismaError(new Error("boom"));
      expect.unreachable();
    } catch (err) {
      expect((err as HttpError).status).toBe(500);
      expect((err as Error).message).toBe("Database error");
    }
  });
});

describe("Zod input validation", () => {
  it("rejects empty resume, bad score, bad status, bad job URL", () => {
    expect(CreateResumeSchema.safeParse({}).success).toBe(false);
    expect(JobMatchUpsertSchema.safeParse({ jobId: "x", overallScore: 101 }).success).toBe(false);
    expect(TransitionApplicationSchema.safeParse({ toStatus: "HIRED" }).success).toBe(false);
    expect(CreateJobSchema.safeParse({ title: "T", company: "C", description: "D", sourceUrl: "nope" }).success).toBe(false);
    expect(UpdateProfileSchema.safeParse({ yearsOfExperience: -1 }).success).toBe(false);
    expect(CreateProjectSchema.safeParse({ name: "", description: "x" }).success).toBe(false);
  });

  it("strips userId from application payloads (ownership comes from auth)", () => {
    const parsed = CreateApplicationSchema.parse({ jobId: "j1", userId: "evil" });
    expect((parsed as Record<string, unknown>).userId).toBeUndefined();
  });

  it("defaults application mode to MANUAL and score components to 0", () => {
    expect(CreateApplicationSchema.parse({ jobId: "j1" }).mode).toBe("MANUAL");
    const m = JobMatchUpsertSchema.parse({ jobId: "j1", overallScore: 80 });
    expect(m.skillScore).toBe(0);
  });
});

describe("shared state machine spot checks", () => {
  it("allows REVIEW->READY->APPROVED->APPLIED, blocks APPLIED->REVIEW", () => {
    expect(canTransition("REVIEW", "READY")).toBe(true);
    expect(canTransition("READY", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "APPLIED")).toBe(true);
    expect(canTransition("APPLIED", "REVIEW")).toBe(false);
    expect(canTransition("ARCHIVED", "DISCOVERED")).toBe(false);
  });
});
