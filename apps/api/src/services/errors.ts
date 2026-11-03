/** Typed HTTP errors. The global errorHandler maps these to JSON responses
 *  without leaking stack traces, connection strings, or provider secrets. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function notFound(message = "Not found"): HttpError {
  return new HttpError(404, message);
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message);
}

export function unprocessable(message: string): HttpError {
  return new HttpError(422, message);
}

/** Map Prisma known-request errors to safe HTTP errors. Never throws raw DB errors. */
export function mapPrismaError(err: unknown, notFoundMessage = "Not found"): never {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2002") throw conflict("Resource already exists");
  if (code === "P2025") throw notFound(notFoundMessage);
  // Foreign-key violation: almost always a user-scoped reference to a
  // missing/other-user row. Report as 404 to avoid leaking existence.
  if (code === "P2003") throw notFound(notFoundMessage);
  throw new HttpError(500, "Database error");
}
