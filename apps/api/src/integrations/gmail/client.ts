/**
 * Phase 6 — minimal Gmail API client (read-only, bounded).
 * Fixed Google endpoints only — user input can never become a request
 * target (no arbitrary URLs). Every call has a timeout; HTTP failures map
 * to safe categories. fetchImpl is injectable so tests never touch Gmail.
 */

export const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
export const GMAIL_TIMEOUT_MS = 15000;

export type GmailErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "SERVER"
  | "TIMEOUT"
  | "NETWORK"
  | "MALFORMED";

export class GmailApiError extends Error {
  constructor(
    public code: GmailErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GmailApiError";
  }
}

export interface GmailListResponse {
  messages?: { id: string; threadId?: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface GmailMessageFull {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayload;
}

export interface GmailPayload {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string };
  parts?: GmailPayload[];
}

async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new GmailApiError(
      err instanceof Error && err.name === "TimeoutError" ? "TIMEOUT" : "NETWORK",
      "Gmail request failed",
    );
  }
  if (res.status === 401) throw new GmailApiError("UNAUTHENTICATED", "Gmail authorization expired");
  if (res.status === 403) throw new GmailApiError("FORBIDDEN", "Gmail permission denied");
  if (res.status === 429) throw new GmailApiError("RATE_LIMITED", "Gmail rate limit exceeded");
  if (res.status >= 500) throw new GmailApiError("SERVER", "Gmail service error");
  if (!res.ok) throw new GmailApiError("MALFORMED", "Gmail request failed");
  try {
    return await res.json();
  } catch {
    throw new GmailApiError("MALFORMED", "Gmail returned malformed data");
  }
}

export class GmailClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly accessToken: string,
    opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
  ) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? GMAIL_TIMEOUT_MS;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  /** List message IDs for a bounded query, newest first. No bodies fetched. */
  async listMessages(query: string, maxResults: number): Promise<GmailListResponse> {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(Math.max(maxResults, 1), 100)),
    });
    const payload = (await requestJson(
      this.fetchImpl,
      `${GMAIL_API_BASE}/messages?${params.toString()}`,
      { headers: this.authHeaders() }, this.timeoutMs)) as GmailListResponse;
    return { messages: payload.messages ?? [], nextPageToken: payload.nextPageToken };
  }

  /** Fetch one full message. Attachments are never downloaded (no attachment fetch). */
  async getMessage(id: string): Promise<GmailMessageFull> {
    const params = new URLSearchParams({ format: "full" });
    return (await requestJson(
      this.fetchImpl,
      `${GMAIL_API_BASE}/messages/${encodeURIComponent(id)}?${params.toString()}`,
      { headers: this.authHeaders() }, this.timeoutMs)) as GmailMessageFull;
  }

  /** Authenticated profile (id + email only) for account binding. */
  async getProfile(): Promise<{ emailAddress: string }> {
    const payload = (await requestJson(
      this.fetchImpl,
      `${GMAIL_API_BASE}/profile`,
      { headers: this.authHeaders() }, this.timeoutMs)) as { emailAddress?: unknown };
    if (typeof payload.emailAddress !== "string") {
      throw new GmailApiError("MALFORMED", "Gmail returned malformed data");
    }
    return { emailAddress: payload.emailAddress };
  }
}

