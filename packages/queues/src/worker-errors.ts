import { UnrecoverableError } from "bullmq";

/**
 * Phase 10A — worker error classification.
 * Bounded retries: attempts=3 with 1s/5s/25s backoff (see queue-service).
 * Permanent failures throw UnrecoverableError (no useless retries).
 * Messages are sanitized (sliced, no payloads/secrets) for logs and DLQ.
 */

export interface ClassifiedError {
  retryable: boolean;
  code: string;
  message: string;
}

/** Never retried, even if seen inside a third-party error message. */
const NEVER_RETRY_PATTERNS = [
  /captcha/i,
  /login_required/i,
  /access_denied/i,
  /unsupported_sensitive_field/i,
  /sensitive field/i,
  /validation failed/i,
  /unauthorized/i,
  /forbidden/i,
];

/** Prisma codes for transient connection/timeout failures. */
const TRANSIENT_PRISMA_CODES = new Set(["P1001", "P1002", "P1017", "P2024"]);

/** Prisma codes for permanent data errors. */
const PERMANENT_PRISMA_CODES = new Set(["P2002", "P2003", "P2025"]);

export function sanitizeErrorMessage(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : String(raw ?? "Unknown error");
  return text.slice(0, 300) || "Unknown error";
}

/** Throw to fail a job permanently with a safe code. */
export function permanent(code: string, message: string): UnrecoverableError {
  const err = new UnrecoverableError(message.slice(0, 300));
  (err as { code?: string }).code = code;
  return err;
}

/** Throw to fail a job with a retryable transient error. */
export function transient(message: string): Error {
  return new Error(message.slice(0, 300));
}

function codeOf(err: unknown): string | null {
  const code = (err as { code?: unknown })?.code;
  return typeof code === "string" ? code : null;
}

function statusOf(err: unknown): number | null {
  const status = (err as { status?: unknown })?.status;
  return typeof status === "number" ? status : null;
}

export function classifyWorkerError(err: unknown): ClassifiedError {
  const message = sanitizeErrorMessage(err);
  // Explicit permanent marker from processors.
  if (err instanceof UnrecoverableError) {
    return { retryable: false, code: codeOf(err) ?? "PERMANENT", message };
  }
  // Never-retry signals win over everything else.
  if (NEVER_RETRY_PATTERNS.some((p) => p.test(message))) {
    return { retryable: false, code: "NEVER_RETRY", message };
  }
  // Typed HTTP errors (existing services use HttpError.status).
  const status = statusOf(err);
  if (status !== null) {
    if (status === 429 || status === 502 || status >= 500) {
      return { retryable: true, code: `HTTP_${status}`, message };
    }
    return { retryable: false, code: `HTTP_${status}`, message };
  }
  // Prisma error codes.
  const prismaCode = (err as { code?: unknown })?.code;
  if (typeof prismaCode === "string" && prismaCode.startsWith("P")) {
    if (TRANSIENT_PRISMA_CODES.has(prismaCode)) {
      return { retryable: true, code: prismaCode, message };
    }
    if (PERMANENT_PRISMA_CODES.has(prismaCode)) {
      return { retryable: false, code: prismaCode, message };
    }
    // Unknown Prisma code: retry bounded (attempts cap contains it).
    return { retryable: true, code: prismaCode, message };
  }
  const code = codeOf(err);
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "EAI_AGAIN" || code === "ENOTFOUND") {
    return { retryable: true, code, message };
  }
  // Unknown: bounded retry (attempts=3 caps the blast radius).
  return { retryable: true, code: code ?? "UNKNOWN", message };
}

/**
 * Convert a classification into the error the processor should throw:
 * UnrecoverableError for permanent, plain Error for transient.
 */
export function toProcessorError(classified: ClassifiedError): Error {
  if (classified.retryable) return transient(classified.message);
  return permanent(classified.code, classified.message);
}
