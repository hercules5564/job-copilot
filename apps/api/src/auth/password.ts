import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

/**
 * Phase 21 — email/password credentials.
 * scrypt with a per-user random salt; parameters are stored in the hash
 * string so they can be raised later without breaking existing rows.
 * Format: scrypt$N$r$p$salt$hash (base64url). Never logged or returned.
 */

const N = 16_384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return [
    "scrypt",
    String(N),
    String(R),
    String(P),
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 1_048_576) return false;
  if (!Number.isSafeInteger(r) || r <= 0 || r > 32) return false;
  if (!Number.isSafeInteger(p) || p <= 0 || p > 16) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64url");
    expected = Buffer.from(parts[5], "base64url");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  try {
    const derived = await scrypt(password, salt, expected.length, { N: n, r, p });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
