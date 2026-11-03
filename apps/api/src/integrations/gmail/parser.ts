import type { NormalizedEmail } from "@jobcopilot/shared";
import type { GmailMessageFull, GmailPayload } from "./client.js";

/**
 * Phase 6 — Gmail payload parser.
 * Extracts sender/subject/plain-text body from recursive MIME parts.
 * Attachment parts are skipped (never downloaded). HTML falls back to
 * tag-stripped text. Body text is whitespace-collapsed and capped.
 * Email content is untrusted DATA — never interpreted as instructions.
 */

const MAX_BODY_CHARS = 4000;

function base64UrlToText(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function collectParts(part: GmailPayload | undefined, out: { mime: string; text: string }[]): void {
  if (!part) return;
  if (part.body?.data && !part.body.attachmentId) {
    try {
      out.push({ mime: part.mimeType ?? "", text: base64UrlToText(part.body.data) });
    } catch {
      // Skip undecodable parts; other parts may still parse.
    }
  }
  for (const child of part.parts ?? []) collectParts(child, out);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function header(payload: GmailPayload | undefined, name: string): string {
  const found = payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? "";
}

function parseAddressList(value: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => {
      const angle = entry.match(/<([^>]+)>/);
      return (angle ? angle[1] : entry).trim().toLowerCase();
    })
    .filter((e) => e.includes("@"))
    .slice(0, 20);
}

function parseAddress(value: string): { email: string; name: string | null } {
  const angle = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (angle) {
    return { email: angle[2].trim().toLowerCase(), name: angle[1].trim() || null };
  }
  return { email: value.trim().toLowerCase(), name: null };
}

export function normalizeGmailMessage(message: GmailMessageFull): NormalizedEmail {
  const parts: { mime: string; text: string }[] = [];
  collectParts(message.payload, parts);
  const plain = parts.find((p) => p.mime.startsWith("text/plain"))?.text;
  const html = parts.find((p) => p.mime.includes("html"))?.text;
  const bodyRaw = plain ?? (html ? stripHtml(html) : "");
  const bodyText = bodyRaw.replace(/\s+/g, " ").trim().slice(0, MAX_BODY_CHARS);

  const from = parseAddress(header(message.payload, "from"));
  const receivedMs = Number(message.internalDate ?? 0);
  return {
    providerMessageId: message.id,
    threadId: message.threadId ?? null,
    fromEmail: from.email,
    fromName: from.name,
    toEmails: parseAddressList(header(message.payload, "to")),
    subject: header(message.payload, "subject").slice(0, 1000),
    snippet: (message.snippet ?? "").slice(0, 2000),
    bodyText,
    receivedAt: new Date(Number.isFinite(receivedMs) && receivedMs > 0 ? receivedMs : Date.now()).toISOString(),
  };
}
