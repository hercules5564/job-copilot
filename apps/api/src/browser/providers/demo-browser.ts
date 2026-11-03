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
 * Phase 7 — in-memory demo browser. Implements the full BrowserProvider
 * interface with scriptable pages so the entire run pipeline (inspect →
 * map → approve → fill → submit → detect) is exercised without any real
 * website. Used by tests and the local demo application flow.
 */

export type DemoSubmitBehavior =
  | { type: "success"; confirmationText: string; confirmationUrl: string }
  | { type: "validation-error"; errors: string[] }
  | { type: "blocked"; signals: string[] }
  | { type: "ambiguous" };

export interface DemoPage {
  url: string;
  title: string;
  headings?: string[];
  fields: PageFormField[];
  signals?: string[];
  hasSubmitButton?: boolean;
  submitLabel?: string | null;
  submitBehavior?: DemoSubmitBehavior;
}

interface DemoHandleState {
  id: string;
  pages: Map<string, DemoPage>;
  currentUrl: string | null;
  values: Map<string, string>;
  submitted: boolean;
  confirmation: { text: string; url: string } | null;
  closed: boolean;
}

export class DemoBrowserError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "DemoBrowserError";
  }
}

class DemoHandle implements BrowserSessionHandle {
  constructor(
    public readonly sessionDbId: string,
    public readonly providerId: "demo",
    public readonly state: DemoHandleState,
  ) {}
}

export class DemoBrowserProvider implements BrowserProvider {
  readonly id = "demo" as const;
  private readonly handles = new Map<string, DemoHandleState>();
  private pages: DemoPage[] = [];

  /** Script the pages this demo browser can visit. */
  setPages(pages: DemoPage[]): void {
    this.pages = pages;
  }

  async launch(): Promise<BrowserSessionHandle> {
    const state: DemoHandleState = {
      id: randomUUID(),
      pages: new Map(this.pages.map((p) => [p.url, structuredClone(p)])),
      currentUrl: null,
      values: new Map(),
      submitted: false,
      confirmation: null,
      closed: false,
    };
    this.handles.set(state.id, state);
    return new DemoHandle("", this.id, state);
  }

  /** Rebind a launched handle to its DB session id (set by session manager). */
  rebind(handle: BrowserSessionHandle, sessionDbId: string): BrowserSessionHandle {
    const state = this.require(handle);
    return new DemoHandle(sessionDbId, this.id, state);
  }

  private require(handle: BrowserSessionHandle): DemoHandleState {
    const state = (handle as DemoHandle).state;
    if (!state || !this.handles.has(state.id) || state.closed) {
      throw new DemoBrowserError("SESSION_CLOSED", "Browser session is closed");
    }
    return state;
  }

  private currentPage(state: DemoHandleState): DemoPage {
    const page = state.currentUrl ? state.pages.get(state.currentUrl) : undefined;
    if (!page) throw new DemoBrowserError("NO_PAGE", "No page is currently open");
    return page;
  }

  async navigate(handle: BrowserSessionHandle, url: string, allowedOrigins: string[]): Promise<PageSnapshot> {
    const state = this.require(handle);
    try {
      assertNavigationAllowed(url, allowedOrigins);
    } catch {
      throw badRequest("Navigation outside the approved application origin is blocked");
    }
    if (!state.pages.has(url)) {
      throw new DemoBrowserError("PAGE_NOT_FOUND", "Demo browser has no such page");
    }
    state.currentUrl = url;
    state.submitted = false;
    const page = this.currentPage(state);
    return { url, title: page.title };
  }

  async snapshot(handle: BrowserSessionHandle): Promise<PageSnapshot> {
    const state = this.require(handle);
    const page = this.currentPage(state);
    return { url: state.currentUrl!, title: page.title };
  }

  async inspectForm(handle: BrowserSessionHandle): Promise<PageInspection> {
    const state = this.require(handle);
    const page = this.currentPage(state);
    return {
      url: state.currentUrl!,
      title: page.title,
      headings: [...(page.headings ?? [])],
      fields: page.fields.map((f) => ({ ...f, currentValue: state.values.get(f.ref) ?? f.currentValue })),
      signals: [...(page.signals ?? [])],
      hasSubmitButton: page.hasSubmitButton ?? false,
      submitLabel: page.submitLabel ?? null,
    };
  }

  async fillFields(handle: BrowserSessionHandle, items: FillItem[]): Promise<FillOutcome> {
    const state = this.require(handle);
    const page = this.currentPage(state);
    const filled: FillOutcome["filled"] = [];
    const errors: string[] = [];
    for (const item of items) {
      const field = page.fields.find((f) => f.ref === item.ref);
      if (!field) {
        errors.push(`unknown field: ${item.ref}`);
        continue;
      }
      if (field.disabled) {
        errors.push(`field is disabled: ${item.ref}`);
        continue;
      }
      if (field.type === "password") {
        errors.push(`refusing to fill sensitive field: ${item.ref}`);
        continue;
      }
      state.values.set(item.ref, item.value);
      const actual = state.values.get(item.ref) ?? "";
      filled.push({ ref: item.ref, expected: item.value, actual, matched: actual === item.value });
    }
    return { filled, errors };
  }

  async readField(handle: BrowserSessionHandle, ref: string): Promise<string> {
    const state = this.require(handle);
    return state.values.get(ref) ?? "";
  }

  async clickSubmit(handle: BrowserSessionHandle): Promise<void> {
    const state = this.require(handle);
    const page = this.currentPage(state);
    if (!page.hasSubmitButton) {
      throw new DemoBrowserError("NO_SUBMIT", "This form has no submit control");
    }
    const behavior = page.submitBehavior ?? {
      type: "success",
      confirmationText: "Application submitted",
      confirmationUrl: `${state.currentUrl}#confirmation`,
    };
    if (behavior.type === "validation-error") {
      throw new DemoBrowserError("FORM_VALIDATION_ERROR", `Form validation failed: ${behavior.errors.join("; ")}`);
    }
    if (behavior.type === "blocked") {
      page.signals = [...(page.signals ?? []), ...behavior.signals];
      throw new DemoBrowserError("BLOCKED", "Site presents a verification challenge");
    }
    if (behavior.type === "ambiguous") {
      // Click went through but no confirmation can be detected: the caller
      // must treat the outcome as unknown and never auto-retry.
      state.submitted = false;
      state.confirmation = null;
      return;
    }
    state.submitted = true;
    state.confirmation = { text: behavior.confirmationText, url: behavior.confirmationUrl };
    state.currentUrl = behavior.confirmationUrl;
  }

  async detectSubmission(handle: BrowserSessionHandle): Promise<SubmitDetection> {
    const state = this.require(handle);
    if (!state.submitted || !state.confirmation) {
      return { submitted: false, confirmationText: null, confirmationUrl: null };
    }
    return { submitted: true, confirmationText: state.confirmation.text, confirmationUrl: state.confirmation.url };
  }

  async close(handle: BrowserSessionHandle): Promise<void> {
    const state = (handle as DemoHandle).state;
    if (state) {
      state.closed = true;
      this.handles.delete(state.id);
    }
  }

  async isAlive(handle: BrowserSessionHandle): Promise<boolean> {
    const state = (handle as DemoHandle).state;
    return Boolean(state && this.handles.has(state.id) && !state.closed);
  }

  /**
   * Test-only: patch a scripted page (e.g. remove a login wall to simulate
   * a completed manual login, or flip a submit behavior). Applies to the
   * templates AND live handles so in-flight sessions observe the change,
   * mirroring a real site whose state changed out-of-band. Never used in
   * production flows.
   */
  mutatePage(url: string, patch: Partial<DemoPage>): void {
    const template = this.pages.find((p) => p.url === url);
    if (!template) throw new DemoBrowserError("PAGE_NOT_FOUND", "Demo browser has no such page");
    Object.assign(template, structuredClone({ ...patch, url: template.url }));
    for (const state of this.handles.values()) {
      const live = state.pages.get(url);
      if (live) Object.assign(live, structuredClone({ ...patch, url }));
    }
  }
}
