import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Phase 6 — server-side token encryption (AES-256-GCM, authenticated).
 * Key material comes ONLY from INTEGRATION_ENCRYPTION_KEY (SHA-256 hashed
 * to 32 bytes — any long random string works). Nothing here is logged;
 * decrypted tokens never leave the service layer.
 */

export interface EncryptedEnvelope {
  iv: string;
  data: string;
  tag: string;
}

function keyBytes(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY ?? "";
  if (raw.length < 32) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY must be set to a random string of at least 32 characters",
    );
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptToken(plaintext: string): EncryptedEnvelope {
  const key = keyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    data: data.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptToken(envelope: EncryptedEnvelope): string {
  if (!envelope || typeof envelope.iv !== "string" || typeof envelope.data !== "string" || typeof envelope.tag !== "string") {
    throw new Error("Invalid encrypted token envelope");
  }
  const key = keyBytes();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
