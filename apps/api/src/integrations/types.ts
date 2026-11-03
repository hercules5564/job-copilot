import type {
  GmailSyncResult,
  IntegrationProviderId,
  IntegrationStatusInfo,
  NormalizedEmail,
} from "@jobcopilot/shared";

/**
 * Phase 6 — integration provider abstraction.
 * Gmail logic lives in providers, never in routes. Future providers
 * (Outlook, …) implement this interface without touching tracking code.
 * Tokens never leave the server; methods return sanitized info only.
 */
export interface IntegrationProvider {
  readonly id: IntegrationProviderId;

  /** Is server-side OAuth configuration present (no secrets revealed)? */
  isConfigured(): boolean;

  /** Sanitized connection status for the user. Never includes tokens. */
  getStatus(userId: string): Promise<IntegrationStatusInfo>;

  /** Build the user-facing OAuth consent URL (validates config + state). */
  getConnectUrl(userId: string): Promise<{ url: string }>;

  /** Exchange code+state for tokens and persist the connection. */
  handleCallback(userId: string, code: string, state: string): Promise<IntegrationStatusInfo>;

  /** Bounded sync: fetch → normalize → classify → match → events. */
  syncMessages(userId: string, maxMessages: number): Promise<GmailSyncResult>;

  /** Revoke (best effort) and delete stored credentials. */
  disconnect(userId: string): Promise<IntegrationStatusInfo>;

  /** Fetch one normalized message (user-scoped). Null when not found. */
  getMessage?(userId: string, providerMessageId: string): Promise<NormalizedEmail | null>;
}

export type { GmailSyncResult, IntegrationStatusInfo, NormalizedEmail };
