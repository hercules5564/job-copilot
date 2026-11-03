import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __jobcopilotPrisma: PrismaClient | undefined;
}

/** Shared Prisma client singleton (Next.js HMR + workers safe). */
export const prisma: PrismaClient =
  globalThis.__jobcopilotPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__jobcopilotPrisma = prisma;
}

/** True when Prisma/PostgreSQL should be used. Never logs the URL itself. */
export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export * from "@prisma/client";
