/**
 * Phase 20 — additional public job sources.
 * Adapter-level tests with mocked fetch only: no network, no DB.
 */
import { describe, it, expect } from "vitest";
import { RemoteOkAdapter } from "../src/sources/adapters/remoteok.js";
import { AdzunaAdapter } from "../src/sources/adapters/adzuna.js";
import { JoobleAdapter } from "../src/sources/adapters/jooble.js";
import { listSourceInfos, registerDefaultSources } from "../src/sources/index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("source registry (Phase 20)", () => {
  it("registers the new sources and reports availability safely", () => {
    registerDefaultSources();
    const infos = listSourceInfos();
    const ids = infos.map((i) => i.id);
    expect(ids).toContain("remoteok");
    expect(ids).toContain("adzuna");
    expect(ids).toContain("jooble");
    for (const info of infos) {
      expect(JSON.stringify(info)).not.toMatch(/secret|password|accessToken|refreshToken/i);
    }
  });
});

describe("RemoteOK adapter", () => {
  it("normalizes the public feed, strips HTML, and filters", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return jsonResponse([
        { legal: "See terms" },
        {
          id: "1",
          slug: "acme-backend",
          company: "Acme",
          position: "Backend Engineer",
          description: "<p>Build <b>TypeScript</b> services</p>",
          location: "Remote",
          tags: ["typescript", "node"],
          url: "https://remoteok.com/jobs/acme-backend",
          date: "2026-11-01T00:00:00Z",
          salary_min: 100000,
          salary_max: 140000,
          salary_currency: "USD",
        },
        {
          id: "2",
          slug: "beta-design",
          company: "Beta",
          position: "Designer",
          description: "<p>Figma</p>",
          location: "Remote",
          url: "https://remoteok.com/jobs/beta-design",
        },
      ]);
    }) as unknown as typeof fetch;

    const adapter = new RemoteOkAdapter({ fetchImpl, timeoutMs: 1000 });
    const jobs = await adapter.search({ query: "backend", limit: 10 });
    expect(calls).toHaveLength(1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: "remoteok",
      externalId: "acme-backend",
      title: "Backend Engineer",
      company: "Acme",
      remote: true,
      salaryMin: 100000,
      salaryMax: 140000,
    });
    expect(jobs[0]?.description).toBe("Build TypeScript services");
  });

  it("marks 429/5xx as transient and 4xx as permanent", async () => {
    const transient = new RemoteOkAdapter({
      fetchImpl: (async () => jsonResponse({}, 503)) as unknown as typeof fetch,
    });
    await expect(transient.search({ limit: 5 })).rejects.toThrowError(/transient:/);

    const permanent = new RemoteOkAdapter({
      fetchImpl: (async () => jsonResponse({}, 400)) as unknown as typeof fetch,
    });
    await expect(permanent.search({ limit: 5 })).rejects.toThrowError(/rejected/);
  });
});

describe("Adzuna adapter", () => {
  it("requires credentials", async () => {
    const adapter = new AdzunaAdapter({ appId: "", appKey: "" });
    expect(adapter.info().available).toBe(false);
    await expect(adapter.search({ limit: 5 })).rejects.toThrowError(/not configured/);
  });

  it("builds a bounded request and normalizes results", async () => {
    let seenUrl = "";
    const fetchImpl = (async (url: string | URL | Request) => {
      seenUrl = String(url);
      return jsonResponse({
        results: [
          {
            id: 42,
            title: "Platform Engineer",
            company: { display_name: "Gamma" },
            location: { display_name: "Berlin" },
            description: "<p>Kubernetes and Go</p>",
            redirect_url: "https://adzuna.example/jobs/42",
            created: "2026-10-30T10:00:00Z",
            salary_min: 70000,
            salary_max: 90000,
            contract_time: "full_time",
          },
        ],
      });
    }) as unknown as typeof fetch;

    const adapter = new AdzunaAdapter({
      appId: "app",
      appKey: "secret-key",
      country: "de",
      fetchImpl,
    });
    const jobs = await adapter.search({ query: "platform", location: "Berlin", limit: 10 });
    expect(seenUrl).toContain("/jobs/de/search/1");
    expect(seenUrl).toContain("app_id=app");
    expect(seenUrl).toContain("what=platform");
    expect(seenUrl).toContain("where=Berlin");
    expect(jobs[0]).toMatchObject({
      source: "adzuna",
      externalId: "42",
      title: "Platform Engineer",
      company: "Gamma",
      employmentType: "full_time",
    });
  });
});

describe("Jooble adapter", () => {
  it("requires a key", async () => {
    const adapter = new JoobleAdapter({ apiKey: "" });
    expect(adapter.info().available).toBe(false);
    await expect(adapter.search({ limit: 5 })).rejects.toThrowError(/not configured/);
  });

  it("posts bounded search params and normalizes results", async () => {
    let seenUrl = "";
    let seenBody = "";
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenBody = String(init?.body ?? "");
      return jsonResponse({
        jobs: [
          {
            id: "j-1",
            title: "Frontend Engineer",
            company: "Delta",
            location: "Remote",
            type: "Full-time",
            link: "https://jooble.example/j/1",
            description: "<p>React and TypeScript</p>",
            updated: "2026-11-02T00:00:00Z",
          },
        ],
      });
    }) as unknown as typeof fetch;

    const adapter = new JoobleAdapter({ apiKey: "test-key", fetchImpl });
    const jobs = await adapter.search({ query: "frontend", location: "Remote", limit: 10 });
    expect(seenUrl).toContain("/test-key");
    expect(JSON.parse(seenBody)).toMatchObject({ keywords: "frontend", location: "Remote", page: "1" });
    expect(jobs[0]).toMatchObject({
      source: "jooble",
      externalId: "j-1",
      title: "Frontend Engineer",
      company: "Delta",
      remote: true,
      employmentType: "Full-time",
    });
    expect(jobs[0]?.description).toBe("React and TypeScript");
  });
});
