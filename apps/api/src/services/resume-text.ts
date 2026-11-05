import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { unprocessable } from "./errors.js";
import { DOCX_MIME, PDF_MIME } from "./resume-storage.js";

/**
 * Phase 22 — extract plain text from a validated PDF/DOCX buffer.
 * Text is capped and normalized; no OCR is attempted (scanned PDFs fail
 * with a clear message rather than silently returning garbage).
 */

const MAX_TEXT_LENGTH = 100_000;

function normalize(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractDocumentText(buffer: Buffer, mimeType: string): Promise<string> {
  let raw = "";
  if (mimeType === PDF_MIME) {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractText(pdf, { mergePages: true });
      raw = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    } catch {
      throw unprocessable(
        "Could not read this PDF. Try a text-based export (not a scan) and upload again.",
      );
    }
  } else if (mimeType === DOCX_MIME) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      raw = result.value;
    } catch {
      throw unprocessable("Could not read this DOCX file. Try re-saving it from Word/Google Docs.");
    }
  } else {
    throw unprocessable("Unsupported document type.");
  }

  const cleaned = normalize(raw);
  if (!cleaned) {
    throw unprocessable(
      "No readable text was found in this document. Scanned PDFs are not supported.",
    );
  }
  return cleaned.slice(0, MAX_TEXT_LENGTH);
}
