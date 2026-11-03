import { badRequest } from "../../services/errors.js";
import { mapField } from "../field-mapper.js";
import type { PageFormField, PageInspection } from "../types.js";
import type { AdapterDescriptor } from "@jobcopilot/shared";
import type { AdapterHandle, ApplicationAdapter } from "./types.js";

/**
 * Phase 7 — demo adapter for tests and the local demo application page.
 * Supports the full loop including verified submission, but ONLY on local
 * demo origins (localhost / 127.0.0.1 / demo.local). Never a production
 * automation path.
 */

const DEMO_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "demo.local"]);

export class DemoApplicationAdapter implements ApplicationAdapter {
  readonly id = "demo" as const;
  readonly name = "Demo Adapter";

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
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !DEMO_HOSTS.has(parsed.hostname)) {
      return { supported: false, reason: "Demo adapter only supports local demo targets" };
    }
    return { supported: true };
  }

  resolveTarget(
    _job: { sourceUrl: string | null; title: string; companyName: string },
    overrideUrl?: string,
  ): AdapterHandle {
    if (!overrideUrl) {
      throw badRequest("Demo runs require an explicit local targetUrl");
    }
    const check = this.canHandle(overrideUrl);
    if (!check.supported) throw badRequest(check.reason ?? "Demo target is not supported");
    return { targetUrl: overrideUrl, allowedOrigins: [new URL(overrideUrl).origin] };
  }

  mapField(field: PageFormField) {
    return mapField(field);
  }

  supportsSubmit(): boolean {
    return true;
  }

  detectBlock(inspection: PageInspection): { blocked: boolean; code?: string; message?: string } {
    const signals = inspection.signals;
    if (signals.includes("captcha")) {
      return { blocked: true, code: "CAPTCHA_DETECTED", message: "Demo page presents a CAPTCHA simulation. Automation stops here." };
    }
    if (signals.includes("login-required")) {
      return { blocked: true, code: "LOGIN_REQUIRED", message: "Demo page requires login." };
    }
    return { blocked: false };
  }
}


