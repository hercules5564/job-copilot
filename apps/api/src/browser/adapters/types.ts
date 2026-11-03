import type { PageFormField, PageInspection } from "../types.js";
import type {
  AdapterDescriptor,
  FieldMapping,
  FormFieldType,
} from "@jobcopilot/shared";

/**
 * Phase 7 — application adapter interface (+ Phase 8 capabilities).
 * Adapters encapsulate per-site knowledge; the run service owns the state
 * machine, approvals, and submission policy.
 */
export type AdapterId = "demo" | "generic" | "fixture-ats";

export interface AdapterHandle {
  /** Where the application form lives. */
  targetUrl: string;
  /** Origins the browser may navigate to during this run. */
  allowedOrigins: string[];
}

export interface ApplicationAdapter {
  readonly id: AdapterId;
  readonly name: string;
  /** Explicit capability declaration (Phase 8). */
  describe(): AdapterDescriptor;
  /** Can this adapter handle the URL (false + reason for blocked domains)? */
  canHandle(url: string): { supported: boolean; reason?: string };
  /** Resolve the application target for a job (validates policy). */
  resolveTarget(job: { sourceUrl: string | null; title: string; companyName: string }, overrideUrl?: string): AdapterHandle;
  /** Map an inspected field to a candidate-data key. */
  mapField(field: PageFormField): { mapping: FieldMapping; fieldType: FormFieldType };
  /** Whether this adapter may perform the final submit click after confirmation. */
  supportsSubmit(): boolean;
  /** Detect block/verification signals from an inspection. */
  detectBlock(inspection: PageInspection): { blocked: boolean; code?: string; message?: string };
  /**
   * Optional production check: verify the opened page matches the expected
   * job (title/company). Returns ok=false with a safe reason on mismatch
   * (FORM_CHANGED). Default: no check.
   */
  verifyTarget?(inspection: PageInspection, job: { title: string; companyName: string }): { ok: boolean; reason?: string };
}
