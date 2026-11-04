import { prisma } from "@jobcopilot/db";
import type { ProviderIdentity } from "@jobcopilot/shared";
import { conflict } from "../services/errors.js";

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
    // Never link a Google identity onto an unverified password account:
    // anyone could have registered that email first. The owner must sign in
    // with the password (or verify the email in a future flow) before linking.
    if (existing.passwordHash && !existing.emailVerifiedAt) {
      throw conflict("An account with this email already exists. Sign in with your password.");
    }
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
