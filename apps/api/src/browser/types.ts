/**
 * Phase 7 — provider-independent browser automation types.
 * Business logic depends on these interfaces, never on Playwright.
 * No cookies, storage state, or credentials appear in any of these shapes.
 */

export type BrowserProviderId = "playwright" | "demo";

export interface PageSnapshot {
  url: string;
  title: string;
}

/** A form field as seen by the browser (values read back, never secrets). */
export interface PageFormField {
  /** Stable selector/address the provider can act on (opaque to callers). */
  ref: string;
  label: string;
  name: string;
  type: string;
  required: boolean;
  options: string[];
  placeholder: string;
  autocomplete: string;
  currentValue: string;
  visible: boolean;
  disabled: boolean;
}

export interface PageInspection {
  url: string;
  title: string;
  /** Visible h1/h2 headings (target verification context). */
  headings: string[];
  fields: PageFormField[];
  /** Block/verification signals observed (captcha, denied, login wall…). */
  signals: string[];
  hasSubmitButton: boolean;
  submitLabel: string | null;
}

export interface FillItem {
  ref: string;
  value: string;
}

export interface FillVerification {
  ref: string;
  expected: string;
  actual: string;
  matched: boolean;
}

export interface FillOutcome {
  filled: FillVerification[];
  errors: string[];
}

export interface SubmitDetection {
  submitted: boolean;
  confirmationText: string | null;
  confirmationUrl: string | null;
}

/** Opaque live browser session handle (server memory only). */
export interface BrowserSessionHandle {
  readonly sessionDbId: string;
  readonly providerId: BrowserProviderId;
}

export interface BrowserProvider {
  readonly id: BrowserProviderId;
  /** Launch an isolated context for one session. */
  launch(): Promise<BrowserSessionHandle>;
  /** Navigate within the run's approved origins only. */
  navigate(handle: BrowserSessionHandle, url: string, allowedOrigins: string[]): Promise<PageSnapshot>;
  snapshot(handle: BrowserSessionHandle): Promise<PageSnapshot>;
  inspectForm(handle: BrowserSessionHandle): Promise<PageInspection>;
  fillFields(handle: BrowserSessionHandle, items: FillItem[]): Promise<FillOutcome>;
  readField(handle: BrowserSessionHandle, ref: string): Promise<string>;
  /** Click the form's submit control (adapters decide if/when). */
  clickSubmit(handle: BrowserSessionHandle): Promise<void>;
  detectSubmission(handle: BrowserSessionHandle): Promise<SubmitDetection>;
  close(handle: BrowserSessionHandle): Promise<void>;
  /** True when the live handle is still usable. */
  isAlive(handle: BrowserSessionHandle): Promise<boolean>;
}
