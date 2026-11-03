import { badRequest } from "../../services/errors.js";
import { config } from "../../config.js";
import { mapField } from "../field-mapper.js";
import type { PageFormField, PageInspection } from "../types.js";
import type { AdapterDescriptor } from "@jobcopilot/shared";
import type { AdapterHandle, ApplicationAdapter } from "./types.js";

/**
 * Phase 8 — production-style ATS adapter exercised against a CONTROLLED
 * LOCAL FIXTURE (the /ats-demo pages in apps/web). This is NOT a
 * third-party integration: no LinkedIn, Indeed, X, or any external
 * platform is claimed or touched.
 *
 * Production properties demonstrated here:
 * - explicit origin allowlist (fixture origin only),
 * - target/context verification (FORM_CHANGED on job mismatch),
 * - ATS-style fields (work authorization, EEO voluntary section),
 * - HUMAN_CONFIRMED submission with confirmation detection,
 * - login-wall detection with manual-login continuation.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "demo.local"]);

function fixtureOrigins(): string[] {
  try {
    return [new URL(config.frontendUrl).origin];
  } catch {
    return ["http://localhost:3000"];
  }
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export class FixtureAtsAdapter implements ApplicationAdapter {
  readonly id = "fixture-ats" as const;
  readonly name = "Fixture ATS Adapter";

  describe(): AdapterDescriptor {
    return {
      adapterId: this.id,
      displayName: this.name,
      submissionMode: "HUMAN_CONFIRMED",
      capabilities: ["inspect", "mapFields", "generateAnswers", "fill", "submit", "manualLogin", "resume"],
      manualLogin: true,
    };
  }

  canHandle(url: string): { supported: boolean; reason?: string } {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { supported: false, reason: "Only http(s) application URLs are supported" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { supported: false, reason: "Only http(s) application URLs are supported" };
    }
    if (!LOCAL_HOSTS.has(parsed.hostname)) {
      return { supported: false, reason: "Fixture ATS adapter only supports the controlled local fixture" };
    }
    if (!parsed.pathname.startsWith("/ats-demo/")) {
      return { supported: false, reason: "Fixture ATS adapter only supports /ats-demo/ fixture pages" };
    }
    return { supported: true };
  }

  resolveTarget(
    job: { sourceUrl: string | null; title: string; companyName: string },
    overrideUrl?: string,
  ): AdapterHandle {
    const raw = overrideUrl ?? job.sourceUrl;
    if (!raw) {
      throw badRequest("Fixture ATS runs require an explicit fixture targetUrl");
    }
    const check = this.canHandle(raw);
    if (!check.supported) throw badRequest(check.reason ?? "Fixture target is not supported");
    const origin = new URL(raw).origin;
    if (!fixtureOrigins().includes(origin) && !LOCAL_HOSTS.has(new URL(raw).hostname)) {
      throw badRequest("Fixture target origin is not allowlisted");
    }
    return { targetUrl: raw, allowedOrigins: [origin] };
  }

  mapField(field: PageFormField) {
    return mapField(field);
  }

  supportsSubmit(): boolean {
    return true;
  }

  /** Verify the opened page belongs to the expected job (title/company). */
  verifyTarget(
    inspection: PageInspection,
    job: { title: string; companyName: string },
  ): { ok: boolean; reason?: string } {
    const hay = norm(`${inspection.title} ${inspection.headings.join(" ")} ${inspection.fields.map((f) => f.label).join(" ")}`);
    const titleTokens = norm(job.title).split(" ").filter((t) => t.length > 2);
    const companyTokens = norm(job.companyName).split(" ").filter((t) => t.length > 2);
    const titleHit = titleTokens.length === 0 || titleTokens.some((t) => hay.includes(t));
    const companyHit = companyTokens.length === 0 || companyTokens.some((t) => hay.includes(t));
    if (!titleHit || !companyHit) {
      return { ok: false, reason: `Page does not match ${job.title} at ${job.companyName}; refusing to continue` };
    }
    return { ok: true };
  }

  detectBlock(inspection: PageInspection): { blocked: boolean; code?: string; message?: string } {
    const signals = inspection.signals;
    if (signals.includes("captcha")) {
      return { blocked: true, code: "CAPTCHA_DETECTED", message: "The application presents a CAPTCHA. Complete it manually if you choose; automation will not bypass it." };
    }
    if (signals.includes("login-required")) {
      return { blocked: true, code: "LOGIN_REQUIRED", message: "Login is required. Sign in manually in the browser window, then resume this run." };
    }
    if (signals.includes("body-block") || signals.includes("page-title-block")) {
      return { blocked: true, code: "ACCESS_DENIED", message: "The fixture denied automated access. Continue manually." };
    }
    return { blocked: false };
  }
}


