import { prisma } from "@jobcopilot/db";
import { permanent } from "@jobcopilot/queues";

/**
 * Phase 10A — shared processor guards.
 * Workers never mint users: the account must already exist (producers run
 * behind requireAuth + ensureUserMw). Payloads are re-validated at
 * execution time; invalid payloads fail permanently.
 */

export async function requireQueueUser(userId: string): Promise<void> {
  if (typeof userId !== "string" || !userId) {
    throw permanent("INVALID_PAYLOAD", "Queue payload is missing userId");
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw permanent("USER_NOT_FOUND", "Queue user does not exist");
}

export function parseQueuePayload<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch {
    throw permanent("INVALID_PAYLOAD", "Queue payload failed validation");
  }
}
