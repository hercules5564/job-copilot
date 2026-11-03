import { isDbConfigured, prisma } from "@jobcopilot/db";
import { store } from "./store.js";

/** Dashboard aggregates. Prisma-backed when configured, stub store otherwise. */
export async function getStats(userId: string) {
  if (!isDbConfigured()) {
    const jobs = store.listJobs();
    const apps = store.listApplications();
    const byStatus: Record<string, number> = {};
    for (const a of apps) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    return {
      jobsDiscovered: jobs.length,
      applications: apps.length,
      byStatus,
      responses: 0,
      interviews: 0,
      offers: 0,
      responseRate: 0,
    };
  }
  const [jobsDiscovered, applications, groups] = await Promise.all([
    prisma.job.count({ where: { userId } }),
    prisma.application.count({ where: { userId } }),
    prisma.application.groupBy({ by: ["status"], where: { userId }, _count: true }),
  ]);
  const byStatus: Record<string, number> = {};
  for (const g of groups) byStatus[g.status] = g._count;
  const responses =
    (byStatus.RECRUITER_RESPONSE ?? 0) + (byStatus.INTERVIEW ?? 0) + (byStatus.OFFER ?? 0);
  const interviews = byStatus.INTERVIEW ?? 0;
  const offers = byStatus.OFFER ?? 0;
  return {
    jobsDiscovered,
    applications,
    byStatus,
    responses,
    interviews,
    offers,
    responseRate: applications === 0 ? 0 : Math.round((responses / applications) * 100),
  };
}
