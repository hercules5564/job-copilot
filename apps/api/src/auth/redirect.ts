/**
 * Safe post-login destination handling.
 *
 * Only same-origin relative paths are accepted. This blocks open redirects
 * (`https://evil.example`, `//evil.example`, `/\evil.example`) while allowing
 * normal app paths with query strings and hashes.
 */
const MAX_NEXT_LENGTH = 2000;

export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
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
  // Never send an authenticated user back into the auth flow.
  if (path === "/login" || path.startsWith("/login?") || path.startsWith("/login#")) {
    return null;
  }
  return path;
}
