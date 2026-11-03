import { prisma } from "@jobcopilot/db";

/**
 * Ensure a User row exists for the authenticated identity.
 * Required because every user-owned table has a FK to users(id), while
 * auth identities (dev header now, OAuth subject later) arrive first.
 */
export async function ensureUser(userId: string): Promise<void> {
  const safe = userId.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: `${safe}@jobcopilot.local` },
  });
}
