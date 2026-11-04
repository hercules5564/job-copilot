const SESSION_HINT = "jobpilot-session-active";
const MAX_NEXT_LENGTH = 2000;

/** Only allow same-origin relative destinations (blocks open redirects). */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || value.length > MAX_NEXT_LENGTH) return null;
  if (!value.startsWith("/")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  let parsed: URL;
  try {
    parsed = new URL(value, "http://jobpilot.local");
  } catch {
    return null;
  }
  if (parsed.origin !== "http://jobpilot.local") return null;

  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (path === "/login" || path.startsWith("/login?") || path.startsWith("/login#")) {
    return null;
  }
  return path;
}

export function currentAppPath(): string | null {
  if (typeof window === "undefined") return null;
  return safeNextPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}

/**
 * A per-tab hint that this tab had a valid session. It contains no identity
 * data and is only used to distinguish "session expired" from "never signed
 * in" when showing the login notice.
 */
export function markSessionActive(): void {
  try {
    window.sessionStorage.setItem(SESSION_HINT, "1");
  } catch {
    // Storage can be unavailable; the notice is non-essential.
  }
}

export function clearSessionHint(): void {
  try {
    window.sessionStorage.removeItem(SESSION_HINT);
  } catch {
    // Ignore.
  }
}

export function hadActiveSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_HINT) === "1";
  } catch {
    return false;
  }
}

export function loginPath(options: { next?: string | null; expired?: boolean } = {}): string {
  const params = new URLSearchParams();
  const next = safeNextPath(options.next);
  if (next) params.set("next", next);
  if (options.expired) params.set("expired", "1");
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

export function redirectToLogin(options: { next?: string | null; expired?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  const next = options.next === undefined ? currentAppPath() : options.next;
  window.location.replace(loginPath({ ...options, next }));
}
