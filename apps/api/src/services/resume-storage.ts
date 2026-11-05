import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { badRequest, unprocessable } from "./errors.js";

/**
 * Phase 22 — private document storage for resumes and portfolios.
 *
 * Files are written to a server-side directory that is never exposed
 * statically. Access is always mediated by an authenticated, ownership-
 * checked API route. `storageKey` is an opaque generated value (never a
 * user-supplied path), so traversal is structurally impossible.
 *
 * Production note: this local adapter is intentionally small so it can be
 * swapped for S3/GCS by replacing the four functions below. No URLs are
 * ever stored in the database.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ResumeFileKind = "RESUME" | "PORTFOLIO";

export interface StoredFile {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
}

function uploadRoot(): string {
  return process.env.RESUME_UPLOAD_DIR
    ? path.resolve(process.env.RESUME_UPLOAD_DIR)
    : path.join(process.cwd(), ".uploads");
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 120) || "user";
}

function hasPrefix(buffer: Buffer, prefix: string): boolean {
  if (buffer.length < prefix.length) return false;
  return buffer.subarray(0, prefix.length).equals(Buffer.from(prefix, "latin1"));
}

/** Validate the actual bytes, not the client-supplied extension/MIME. */
export function detectDocumentType(buffer: Buffer): { mimeType: string; ext: "pdf" | "docx" } {
  if (hasPrefix(buffer, "%PDF-")) {
    return { mimeType: PDF_MIME, ext: "pdf" };
  }
  // DOCX is a ZIP container. Require the ZIP signature plus the two entries
  // every Word document must contain.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04 &&
    buffer.includes(Buffer.from("[Content_Types].xml", "latin1")) &&
    buffer.includes(Buffer.from("word/", "latin1"))
  ) {
    return { mimeType: DOCX_MIME, ext: "docx" };
  }
  throw unprocessable("Only PDF and DOCX documents are supported.");
}

export function validateUpload(buffer: Buffer): { mimeType: string; ext: "pdf" | "docx" } {
  if (buffer.length === 0) throw badRequest("The uploaded file is empty.");
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw unprocessable(`File is too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);
  }
  return detectDocumentType(buffer);
}

function assertStorageKey(storageKey: string): void {
  if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(storageKey) || storageKey.includes("..")) {
    throw badRequest("Invalid document reference.");
  }
}

function resolveStorageKey(storageKey: string): string {
  assertStorageKey(storageKey);
  const root = uploadRoot();
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(root + path.sep)) {
    throw badRequest("Invalid document reference.");
  }
  return resolved;
}

export async function saveDocument(input: {
  userId: string;
  kind: ResumeFileKind;
  originalName: string;
  buffer: Buffer;
}): Promise<StoredFile> {
  const { mimeType, ext } = validateUpload(input.buffer);
  const folder = safeSegment(input.userId);
  const storageKey = `${folder}/${randomUUID()}.${ext}`;
  const absolute = resolveStorageKey(storageKey);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, input.buffer, { mode: 0o600 });
  return {
    storageKey,
    mimeType,
    sizeBytes: input.buffer.length,
    originalName: sanitizeFileName(input.originalName, input.kind, ext),
  };
}

export async function readDocument(storageKey: string): Promise<Buffer> {
  return readFile(resolveStorageKey(storageKey));
}

export async function deleteDocument(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) return;
  try {
    await rm(resolveStorageKey(storageKey), { force: true });
  } catch {
    // Best-effort cleanup: the DB row is the source of truth.
  }
}

function sanitizeFileName(
  raw: string,
  kind: ResumeFileKind,
  ext: "pdf" | "docx",
): string {
  const base = path.basename(raw || "").replace(/[^A-Za-z0-9 ._-]/g, "").trim();
  if (base.length > 0) return base.slice(0, 200);
  return kind === "PORTFOLIO" ? `portfolio.${ext}` : `resume.${ext}`;
}
