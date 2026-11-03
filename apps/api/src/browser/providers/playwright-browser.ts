import { randomUUID } from "node:crypto";
import { badRequest } from "../../services/errors.js";
import { assertNavigationAllowed } from "../net-guard.js";
import type {
  BrowserProvider,
  BrowserSessionHandle,
  FillItem,
  FillOutcome,
  PageFormField,
  PageInspection,
  PageSnapshot,
  SubmitDetection,
} from "../types.js";

/**
 * Phase 7 — Playwright browser provider (the ONLY file that imports
 * playwright-core) + Phase 8 hardening. Headless Chromium by default
 * (BROWSER_HEADED=1 enables a visible window for manual login), one
 * isolated BrowserContext per session, fixed timeouts, origin-restricted
 * navigation with redirect-escape detection, page-count cap, no stealth
 * plugins, no fingerprint spoofing, no proxy rotation. Block/verification
 * signals are reported, never bypassed.
 */

const NAV_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 10_000;
const MAX_PAGES_PER_CONTEXT = 3;

const BLOCK_TITLE_PATTERNS = [/captcha/i, /verify you are human/i, /access denied/i, /forbidden/i, /rate limit/i, /too many requests/i];
const BLOCK_BODY_PATTERNS = [/are you a robot/i, /captcha/i, /access denied/i, /request blocked/i];

class PlaywrightHandle implements BrowserSessionHandle {
  constructor(
    public readonly sessionDbId: string,
    public readonly providerId: "playwright",
    public readonly handleId: string,
  ) {}
}

interface LiveSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any;
  closed: boolean;
}

// Lazy import keeps playwright-core out of the module graph unless used.
async function loadPlaywright(): Promise<typeof import("playwright-core")> {
  return import("playwright-core");
}

export class PlaywrightBrowserProvider implements BrowserProvider {
  readonly id = "playwright" as const;
  private readonly sessions = new Map<string, LiveSession>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private browserPromise: Promise<any> | null = null;

  private async browser(): Promise<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    newContext: (opts: any) => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    close: () => Promise<any>;
  }> {
    if (!this.browserPromise) {
      this.browserPromise = (async () => {
        const { chromium } = await loadPlaywright();
        // Headed mode is opt-in (BROWSER_HEADED=1) for manual login only.
        // No stealth plugins, fingerprints, or proxies — ever.
        const headed = ["1", "true", "yes"].includes((process.env.BROWSER_HEADED ?? "").toLowerCase());
        return chromium.launch({ headless: !headed });
      })();
    }
    return this.browserPromise;
  }

  async launch(): Promise<BrowserSessionHandle> {
    const browser = await this.browser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      javaScriptEnabled: true,
    });
    context.setDefaultTimeout(ACTION_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    const page = await context.newPage();
    const handleId = randomUUID();
    this.sessions.set(handleId, { context, page, closed: false });
    return new PlaywrightHandle("", this.id, handleId);
  }

  rebind(handle: BrowserSessionHandle, sessionDbId: string): BrowserSessionHandle {
    return new PlaywrightHandle(sessionDbId, this.id, (handle as PlaywrightHandle).handleId);
  }

  private live(handle: BrowserSessionHandle): LiveSession {
    const session = this.sessions.get((handle as PlaywrightHandle).handleId);
    if (!session || session.closed) throw badRequest("Browser session is closed");
    return session;
  }

  async navigate(handle: BrowserSessionHandle, url: string, allowedOrigins: string[]): Promise<PageSnapshot> {
    try {
      assertNavigationAllowed(url, allowedOrigins);
    } catch {
      throw badRequest("Navigation outside the approved application origin is blocked");
    }
    const session = this.live(handle);
    const { page } = session;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    // Redirect-escape detection: the landed origin must still be allowed.
    const landed = page.url();
    try {
      assertNavigationAllowed(landed, allowedOrigins);
    } catch {
      throw badRequest("Navigation redirected outside the approved application origin and was blocked");
    }
    // Page-count cap: close stray popups/tabs opened by the site.
    const pages = session.context.pages() as unknown[];
    if (pages.length > MAX_PAGES_PER_CONTEXT) {
      for (const extra of pages.slice(MAX_PAGES_PER_CONTEXT)) {
        await (extra as { close(): Promise<void> }).close().catch(() => undefined);
      }
    }
    return { url: landed, title: await page.title() };
  }

  async snapshot(handle: BrowserSessionHandle): Promise<PageSnapshot> {
    const { page } = this.live(handle);
    return { url: page.url(), title: await page.title() };
  }

  private async collectBlockSignals(page: {
    title(): Promise<string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content(): Promise<string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $$eval(s: string, fn: any): Promise<any>;
  }): Promise<string[]> {
    const signals: string[] = [];
    const title = await page.title();
    if (BLOCK_TITLE_PATTERNS.some((p) => p.test(title))) signals.push("page-title-block");
    const captchaFrames = await page
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .$$eval('iframe[src*="captcha"], iframe[src*="recaptcha"], iframe[src*="challenge"]', (els: any) => els.length)
      .catch(() => 0);
    if (captchaFrames > 0) signals.push("captcha");
    const body = (await page.content()).slice(0, 20000).toLowerCase();
    if (BLOCK_BODY_PATTERNS.some((p) => p.test(body))) signals.push("body-block");
    const loginWall = /log in|sign in/.test(body) && /password/i.test(body);
    if (loginWall) signals.push("login-required");
    return signals;
  }

  async inspectForm(handle: BrowserSessionHandle): Promise<PageInspection> {
    const { page } = this.live(handle);
    const url = page.url();
    const title = await page.title();
    // Real closures (string page-functions do not invoke in this client);
    // DOM access via any-casts since the server tsconfig has no DOM lib.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields = (await page.$$eval("input, textarea, select", (els: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (els as any[]).map((el: any, index: number) => {
        const tag = String(el.tagName ?? "").toLowerCase();
        const options =
          tag === "select"
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              Array.from(el.options ?? []).map((o: any) => String(o.textContent ?? "").trim()).filter(Boolean)
            : tag === "input" && (el.type === "radio" || el.type === "checkbox")
              ? [el.value || el.type]
              : [];
        const labels = Array.from(el.labels ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((l: any) => String(l.textContent ?? "").trim())
          .filter(Boolean);
        return {
          ref: `${tag}[${index}]`,
          label: labels[0] ?? el.getAttribute?.("aria-label") ?? "",
          name: el.name ?? "",
          type: tag === "textarea" ? "textarea" : tag === "select" ? "select" : el.type || "text",
          required: Boolean(el.required),
          options,
          placeholder: el.placeholder ?? "",
          autocomplete: el.autocomplete ?? "",
          currentValue: el.value ?? "",
          visible: el.offsetParent !== null,
          disabled: Boolean(el.disabled),
        };
      }),
    )) as PageFormField[];
    const signals = await this.collectBlockSignals(page);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headings = (await page.$$eval("h1, h2", (els: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (els as any[]).map((el: any) => String(el.textContent ?? "").trim().slice(0, 300)).filter(Boolean),
    ).catch(() => []) as string[]).slice(0, 10);
    const submitButton = await this.findSubmitButton(page);
    const submitLabel = submitButton
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        String(await submitButton.evaluate((el: any) => el.textContent ?? "").catch(() => ""))
          .trim()
          .slice(0, 120) || null
      : null;
    return { url, title, headings, fields, signals, hasSubmitButton: submitButton !== null, submitLabel };
  }

  /** Submit control: explicit submit inputs first, then buttons whose text submits. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async findSubmitButton(page: any): Promise<any | null> {
    const direct = await page.$('button[type="submit"], input[type="submit"]');
    if (direct) return direct;
    const candidates = await page.$$("button:not([type])");
    for (const button of candidates) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = String(await button.evaluate((el: any) => el.textContent ?? ""));
      if (/submit|apply|send application|finish/i.test(text)) return button;
    }
    return null;
  }

  async fillFields(handle: BrowserSessionHandle, items: FillItem[]): Promise<FillOutcome> {
    const { page } = this.live(handle);
    const filled: FillOutcome["filled"] = [];
    const errors: string[] = [];
    for (const item of items) {
      try {
        const field = await this.fieldByRef(page, item.ref);
        if (!field) {
          errors.push(`unknown field: ${item.ref}`);
          continue;
        }
        const type = String(await field.getAttribute("type")).toLowerCase();
        if (type === "password") {
          errors.push(`refusing to fill sensitive field: ${item.ref}`);
          continue;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tag = String(await field.evaluate((el: any) => el.tagName.toLowerCase()));
        if (tag === "select") {
          // Match against available options first: never hang waiting for
          // a label the page does not offer.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const available = (await field.evaluate((el: any) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Array.from(el.options ?? []).map((o: any) => String(o.label || o.value || "")),
          )) as string[];
          const want = item.value.trim().toLowerCase();
          const hit = available.find((o) => o.trim().toLowerCase() === want);
          if (!hit) {
            errors.push(`no matching option for ${item.ref} (offered: ${available.slice(0, 8).join(" | ").slice(0, 160) || "none"})`);
            continue;
          }
          await field.selectOption({ label: hit });
        } else if (type === "checkbox") {
          const want = /^(true|yes|1|checked)$/i.test(item.value.trim());
          const isChecked = await field.isChecked();
          if (want !== isChecked) await field.check();
          const actualChecked = await field.isChecked();
          filled.push({
            ref: item.ref,
            expected: item.value,
            actual: actualChecked ? "true" : "false",
            matched: want === actualChecked,
          });
          continue;
        } else if (type === "radio") {
          await field.check();
          const actualChecked = await field.isChecked();
          // Radios express a choice by being selected: any affirmative
          // value ("yes", the option label, "true") matches when checked.
          const want = !/^(false|no|0|off|)$/i.test(item.value.trim());
          filled.push({
            ref: item.ref,
            expected: item.value,
            actual: actualChecked ? "true" : "false",
            matched: want === actualChecked,
          });
          continue;
        } else {
          await field.fill(item.value);
        }
        const actual = await this.readValue(page, item.ref);
        filled.push({ ref: item.ref, expected: item.value, actual, matched: actual === item.value });
      } catch (err) {
        errors.push(`could not fill ${item.ref}: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}`);
      }
    }
    return { filled, errors };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fieldByRef(page: any, ref: string): Promise<any | null> {
    // Same global indexing as inspectForm ("input, textarea, select" order).
    const match = ref.match(/^(input|textarea|select)\[(\d+)\]$/);
    if (!match) return null;
    const els = await page.$$("input, textarea, select");
    return els[Number(match[2])] ?? null;
  }

  private async readValue(page: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  }, ref: string): Promise<string> {
    const field = await this.fieldByRef(page, ref);
    if (!field) return "";
    const tag = String(await field.evaluate("el => el.tagName.toLowerCase()"));
    if (tag === "select") {
      return String(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await field.evaluate((el: any) => {
          const selected = el.options?.[el.selectedIndex];
          return selected?.textContent?.trim() || el.value || "";
        }),
      );
    }
    const type = String(await field.getAttribute("type")).toLowerCase();
    if (type === "checkbox" || type === "radio") {
      return (await field.isChecked()) ? "true" : "false";
    }
    return String(await field.inputValue().catch(() => ""));
  }

  async readField(handle: BrowserSessionHandle, ref: string): Promise<string> {
    return this.readValue(this.live(handle).page, ref);
  }

  async clickSubmit(handle: BrowserSessionHandle): Promise<void> {
    const { page } = this.live(handle);
    const button = await this.findSubmitButton(page);
    if (!button) throw badRequest("This form has no submit control");
    await button.click({ timeout: ACTION_TIMEOUT_MS });
    await page.waitForLoadState("domcontentloaded", { timeout: NAV_TIMEOUT_MS }).catch(() => undefined);
  }

  async detectSubmission(handle: BrowserSessionHandle): Promise<SubmitDetection> {
    const { page } = this.live(handle);
    const url = page.url();
    const text = (await page.content()).slice(0, 20000);
    const match = /(application submitted|thank you for applying|confirmation|reference\s*(number|id)\s*[:#]?\s*[a-z0-9-]+)/i.exec(text);
    if (match) {
      return { submitted: true, confirmationText: match[0].slice(0, 300), confirmationUrl: url };
    }
    return { submitted: false, confirmationText: null, confirmationUrl: null };
  }

  async close(handle: BrowserSessionHandle): Promise<void> {
    const session = this.sessions.get((handle as PlaywrightHandle).handleId);
    if (!session) return;
    session.closed = true;
    this.sessions.delete((handle as PlaywrightHandle).handleId);
    await session.context.close().catch(() => undefined);
  }

  async isAlive(handle: BrowserSessionHandle): Promise<boolean> {
    return this.sessions.has((handle as PlaywrightHandle).handleId);
  }

  /** Test/ops escape hatch: close every live context (prevents zombies). */
  async closeAll(): Promise<void> {
    for (const id of [...this.sessions.keys()]) {
      await this.close(new PlaywrightHandle("", this.id, id));
    }
  }
}
