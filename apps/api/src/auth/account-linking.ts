import { prisma } from "@jobcopilot/db";
import type { ProviderIdentity } from "@jobcopilot/shared";

/**
 * Phase 9 — safe account linking.
 * Lookup order: linked (provider, sub) → existing user by verified email
 * → create. Browser-supplied email is never trusted: callers must pass
 * the provider-validated identity only.
 */
export async function findOrCreateUserForIdentity(identity: ProviderIdentity): Promise<string> {
  const linked = await prisma.authAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
      },
    },
  });
  if (linked) {
    await prisma.authAccount.update({
      where: { id: linked.id },
      data: { email: identity.email },
    });
    await prisma.user.updateMany({
      where: { id: linked.userId, avatarUrl: null },
      data: { avatarUrl: identity.avatarUrl ?? null },
    });
    return linked.userId;
  }

  const existing = await prisma.user.findUnique({ where: { email: identity.email } });
  if (existing) {
    await prisma.$transaction([
      prisma.authAccount.create({
        data: {
          userId: existing.id,
          provider: identity.provider,
          providerAccountId: identity.providerAccountId,
          email: identity.email,
        },
      }),
      prisma.user.update({
        where: { id: existing.id },
        data: {
          avatarUrl: existing.avatarUrl ?? identity.avatarUrl ?? null,
          name: existing.name ?? identity.name ?? null,
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        },
      }),
    ]);
    return existing.id;
  }

  const created = await prisma.user.create({
    data: {
      email: identity.email,
      name: identity.name ?? null,
      avatarUrl: identity.avatarUrl ?? null,
      emailVerifiedAt: new Date(),
      authAccounts: {
        create: {
          provider: identity.provider,
          providerAccountId: identity.providerAccountId,
          email: identity.email,
        },
      },
    },
  });
  return created.id;
}
