import { prisma } from "@jobcopilot/db";

/**
 * Phase 12C — descriptive analytics over persisted records.
 * Every query is owner-scoped (WHERE userId) and aggregated in
 * PostgreSQL (groupBy/count) — no full-table loads, no N+1.
 * Rates use UNIQUE applications as denominator (one app counts once
 * even with repeated events). Integers only: no NaN/Infinity ever.
 */

const FUNNEL_NEW_STATUSES = ["RECRUITER_RESPONSE", "ASSESSMENT", "INTERVIEW", "OFFER"] as const;

export interface ApplicationOverview {
  total: number;
  byStatus: Record<string, number>;
  applied: number;
  recruiterResponse: number;
  assessment: number;
  interview: number;
  offer: number;
  rejected: number;
}

export interface EventOverview {
  total: number;
  /** Unique applications that ever reached each stage (via events). */
  funnel: {
    recruiterResponse: number;
    assessment: number;
    interview: number;
    offer: number;
  };
}

export interface RateOverview {
  /** Unique apps with a recruiter-response event / total apps (percent). */
  responseRate: number;
  /** Unique apps with an interview event / total apps (percent). */
  interviewRate: number;
  /** Unique apps with an offer event / total apps (percent). */
  offerRate: number;
}

export interface MatchOverview {
  total: number;
  byDecision: Record<string, number>;
  /** Mean of stored overallScore, rounded; null when no matches. */
  averageScore: number | null;
  byMode: Record<string, number>;
}

export interface JobOverview {
  total: number;
  bySource: Record<string, number>;
}

export interface ActivityOverview {
  applicationsLast7Days: number;
  applicationsLast30Days: number;
  matchesLast30Days: number;
}

export interface DiscoveryOverview {
  configured: boolean;
  enabled: boolean;
  sources: string[];
  scheduled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastSummary: unknown;
}

export interface AnalyticsOverview {
  applications: ApplicationOverview;
  events: EventOverview;
  rates: RateOverview;
  matches: MatchOverview;
  jobs: JobOverview;
  activity: ActivityOverview;
  discovery: DiscoveryOverview;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function toCountMap(rows: { key: string; count: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.key] = row.count;
  return out;
}

export async function getAnalyticsOverview(userId: string): Promise<AnalyticsOverview> {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [
    applicationTotal,
    statusGroups,
    funnelPairs,
    eventTotal,
    matchTotal,
    decisionGroups,
    modeGroups,
    scoreAvg,
    jobTotal,
    sourceGroups,
    apps7,
    apps30,
    matches30,
    discovery,
  ] = await Promise.all([
    prisma.application.count({ where: { userId } }),
    prisma.application.groupBy({ by: ["status"], where: { userId }, _count: true }),
    prisma.applicationEvent.groupBy({
      by: ["applicationId", "newStatus"],
      where: { application: { userId }, newStatus: { in: [...FUNNEL_NEW_STATUSES] } },
      _count: true,
    }),
    prisma.applicationEvent.count({ where: { application: { userId } } }),
    prisma.jobMatch.count({ where: { userId } }),
    prisma.jobMatch.groupBy({ by: ["decision"], where: { userId }, _count: true }),
    prisma.jobMatch.groupBy({ by: ["matchMode"], where: { userId }, _count: true }),
    prisma.jobMatch.aggregate({ where: { userId }, _avg: { overallScore: true } }),
    prisma.job.count({ where: { userId } }),
    prisma.job.groupBy({ by: ["sourceKey"], where: { userId }, _count: true }),
    prisma.application.count({ where: { userId, createdAt: { gte: sevenDaysAgo } } }),
    prisma.application.count({ where: { userId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.jobMatch.count({ where: { userId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.discoveryConfig.findUnique({ where: { userId } }),
  ]);

  const byStatus = toCountMap(statusGroups.map((g) => ({ key: g.status, count: g._count })));

  const funnelSets: Record<string, Set<string>> = {
    RECRUITER_RESPONSE: new Set(),
    ASSESSMENT: new Set(),
    INTERVIEW: new Set(),
    OFFER: new Set(),
  };
  for (const row of funnelPairs) funnelSets[row.newStatus]?.add(row.applicationId);
  const funnel = {
    recruiterResponse: funnelSets.RECRUITER_RESPONSE.size,
    assessment: funnelSets.ASSESSMENT.size,
    interview: funnelSets.INTERVIEW.size,
    offer: funnelSets.OFFER.size,
  };

  return {
    applications: {
      total: applicationTotal,
      byStatus,
      applied: byStatus.APPLIED ?? 0,
      recruiterResponse: byStatus.RECRUITER_RESPONSE ?? 0,
      assessment: byStatus.ASSESSMENT ?? 0,
      interview: byStatus.INTERVIEW ?? 0,
      offer: byStatus.OFFER ?? 0,
      rejected: byStatus.REJECTED ?? 0,
    },
    events: { total: eventTotal, funnel },
    rates: {
      responseRate: pct(funnel.recruiterResponse, applicationTotal),
      interviewRate: pct(funnel.interview, applicationTotal),
      offerRate: pct(funnel.offer, applicationTotal),
    },
    matches: {
      total: matchTotal,
      byDecision: toCountMap(decisionGroups.map((g) => ({ key: g.decision, count: g._count }))),
      averageScore: scoreAvg._avg.overallScore === null ? null : Math.round(scoreAvg._avg.overallScore),
      byMode: toCountMap(modeGroups.map((g) => ({ key: g.matchMode, count: g._count }))),
    },
    jobs: {
      total: jobTotal,
      bySource: toCountMap(sourceGroups.map((g) => ({ key: g.sourceKey, count: g._count }))),
    },
    activity: {
      applicationsLast7Days: apps7,
      applicationsLast30Days: apps30,
      matchesLast30Days: matches30,
    },
    discovery: discovery
      ? {
          configured: true,
          enabled: discovery.enabled,
          sources: discovery.sourceKeys,
          scheduled: discovery.scheduleEnabled,
          lastRunAt: discovery.lastRunAt?.toISOString() ?? null,
          lastStatus: discovery.lastStatus,
          lastSummary: (discovery.lastSummary as unknown) ?? null,
        }
      : {
          configured: false,
          enabled: false,
          sources: [],
          scheduled: false,
          lastRunAt: null,
          lastStatus: null,
          lastSummary: null,
        },
  };
}
