/**
 * Phase 8 — navigation policy enforcement (defense in depth).
 * Adapters decide the allowlist; providers re-verify every navigation:
 * http(s) only, origin must be explicitly allowed, no private-IP literals
 * (except loopback), no file/data/javascript schemes. Used by all
 * browser providers so a compromised caller cannot escape the allowlist.
 */

const PRIVATE_IPV4 = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
];

function isLoopback(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") return true;
  if (/^127\./.test(hostname)) return true;
  return false;
}

function isPrivateIpLiteral(hostname: string): boolean {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  if (ipv4 && !isLoopback(hostname) && PRIVATE_IPV4.some((p) => p.test(hostname))) return true;
  // Non-loopback IPv6 literals (excluding ::1 handled above).
  if (hostname.includes(":") && !isLoopback(hostname)) return true;
  return false;
}

/**
 * Throws a safe ORIGIN_NOT_ALLOWED error when the URL violates policy.
 * Returns the parsed origin for allowlist comparison.
 */
export function assertNavigationAllowed(rawUrl: string, allowedOrigins: string[]): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("ORIGIN_NOT_ALLOWED: invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("ORIGIN_NOT_ALLOWED: only http(s) navigation is permitted");
  }
  if (!allowedOrigins.includes(parsed.origin)) {
    throw new Error("ORIGIN_NOT_ALLOWED: navigation outside the approved application origin is blocked");
  }
  if (isPrivateIpLiteral(parsed.hostname)) {
    throw new Error("ORIGIN_NOT_ALLOWED: private network destinations are blocked");
  }
  return parsed.origin;
}
