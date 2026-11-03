import { badRequest } from "../../services/errors.js";
import { mapField } from "../field-mapper.js";
import type { PageFormField, PageInspection } from "../types.js";
import type { AdapterDescriptor } from "@jobcopilot/shared";
import type { AdapterHandle, ApplicationAdapter } from "./types.js";

/**
 * Phase 7 — generic application adapter.
 * Handles ordinary single-page forms reachable over http(s), except
 * restricted domains (LinkedIn, X/Twitter) where automation is out of
 * scope. Never submits: SUBMISSION_UNSUPPORTED on unknown sites.
 */

const BLOCKED_DOMAIN_PATTERNS = [
  /(^|\.)linkedin\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export class GenericApplicationAdapter implements ApplicationAdapter {
  readonly id = "generic" as const;
  readonly name = "Generic Adapter";

  describe(): AdapterDescriptor {
    return {
      adapterId: this.id,
      displayName: this.name,
      submissionMode: "MANUAL_ONLY",
      capabilities: ["inspect", "mapFields", "generateAnswers", "fill", "manualLogin", "resume"],
      manualLogin: true,
    };
  }

  canHandle(url: string): { supported: boolean; reason?: string } {
    const parsed = parseHttpUrl(url);
    if (!parsed) return { supported: false, reason: "Only http(s) application URLs are supported" };
    if (BLOCKED_DOMAIN_PATTERNS.some((p) => p.test(parsed.hostname))) {
      return { supported: false, reason: `Automation is not supported for ${parsed.hostname}` };
    }
    return { supported: true };
  }

  resolveTarget(
    job: { sourceUrl: string | null; title: string; companyName: string },
    overrideUrl?: string,
  ): AdapterHandle {
    if (overrideUrl) {
      const parsed = parseHttpUrl(overrideUrl);
      if (!parsed || !LOCAL_HOSTS.has(parsed.hostname)) {
        throw badRequest("URL overrides are only accepted for local demo targets");
      }
      return { targetUrl: overrideUrl, allowedOrigins: [parsed.origin] };
    }
    if (!job.sourceUrl) {
      throw badRequest("This job has no application URL; automatic assistance cannot start");
    }
    const check = this.canHandle(job.sourceUrl);
    if (!check.supported) throw badRequest(check.reason ?? "Application URL is not supported");
    const origin = new URL(job.sourceUrl).origin;
    return { targetUrl: job.sourceUrl, allowedOrigins: [origin] };
  }

  mapField(field: PageFormField) {
    return mapField(field);
  }

  supportsSubmit(): boolean {
    return false;
  }

  detectBlock(inspection: PageInspection): { blocked: boolean; code?: string; message?: string } {
    const signals = inspection.signals;
    if (signals.includes("captcha")) {
      return { blocked: true, code: "CAPTCHA_DETECTED", message: "Automation cannot continue because this site requires a CAPTCHA. Continue manually." };
    }
    if (signals.includes("login-required")) {
      return { blocked: true, code: "LOGIN_REQUIRED", message: "This application requires login. Sign in manually if the session supports it." };
    }
    if (signals.includes("body-block") || signals.includes("page-title-block")) {
      return { blocked: true, code: "ACCESS_DENIED", message: "The site denied automated access. Continue manually." };
    }
    return { blocked: false };
  }
}


