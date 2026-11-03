"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  analyticsApi,
  api,
  notificationsApi,
  personalizationApi,
  runsApi,
  signalsApi,
  ApiError,
  type AnalyticsOverview,
  type ApplicationSummary,
  type HiringSignal,
  type JobMatch,
  type Job,
  type Notification,
} from "../../lib/api";
import { PageHeader, Stat, Card, Badge } from "../../components/ui";

/**
 * Phase 18 — dashboard command center over existing APIs only:
 * /api/analytics, /api/applications, /api/matches, /api/notifications,
 * /api/signals, /api/discovery/*, per-application drafts/runs (bounded to
 * the 8 most recent applications). No new analytics system, no hardcoded
 * production data — every number comes from the API.
 */

interface ActionItem {
  key: string;
  label: string;
  detail?: string;
  href: string;
}

type MatchRow = JobMatch & { job?: (Job & { companyName?: string }) | null };

const NEEDS_ATTENTION_RUN = new Set([
  "WAITING_FOR_REVIEW",
  "READY_TO_FILL",
  "WAITING_FOR_SUBMISSION",
  "WAITING_FOR_LOGIN",
  "BLOCKED",
]);

function notificationHref(n: Notification): string {
  if (n.applicationId) return `/applications/${n.applicationId}`;
  return "/inbox";
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [apps, setApps] = useState<ApplicationSummary[] | null>(null);
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [actions, setActions] = useState<ActionItem[] | null>(null);
  const [signals, setSignals] = useState<HiringSignal[] | null>(null);
  const [discovery, setDiscovery] = useState<{ enabled: boolean; sources: string[]; lastRunAt: string | null; lastStatus: string | null } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [a, appList, matchList, unread, sigList] = await Promise.all([
          analyticsApi.get(),
          api.applications(),
          api.matches(),
          notificationsApi.list("?unreadOnly=true&limit=8"),
          signalsApi.list("").catch(() => ({ signals: [] as HiringSignal[] })),
        ]);
        if (cancelled) return;
        setAnalytics(a.analytics);
        setApps(appList.applications);
        const sorted = [...matchList.matches].sort((x, y) => y.overallScore - x.overallScore);
        setMatches(sorted);
        setSignals(sigList.signals.slice(0, 5));
        setDiscovery({
          enabled: Boolean(a.analytics.discovery.enabled),
          sources: a.analytics.discovery.sources,
          lastRunAt: a.analytics.discovery.lastRunAt,
          lastStatus: a.analytics.discovery.lastStatus,
        });

        // Action center: unread notifications first (already resource-linked).
        const items: ActionItem[] = unread.notifications.map((n) => ({
          key: `notif-${n.id}`,
          label: n.title,
          detail: n.body ?? undefined,
          href: notificationHref(n),
        }));

        // Bounded per-application checks (recent 8 only): drafts awaiting
        // review and runs awaiting human action.
        const recent = appList.applications.slice(0, 8);
        const checks = await Promise.all(
          recent.map(async (app) => {
            const [drafts, runs] = await Promise.all([
              personalizationApi.drafts(app.id).catch(() => ({ drafts: [] as { id: string; status: string }[] })),
              runsApi.list(app.id).catch(() => ({ runs: [] as { id: string; status: string; sessionStatus?: string | null }[] })),
            ]);
            return { app, drafts: drafts.drafts, runs: runs.runs };
          }),
        );
        if (cancelled) return;
        const titleOf = (id: string) =>
          appList.applications.find((x) => x.id === id)?.job?.title ?? "Application";
        for (const { app, drafts, runs } of checks) {
          const pending = drafts.filter((d) => d.status === "REVIEW_REQUIRED");
          if (pending.length > 0) {
            items.push({
              key: `draft-${app.id}`,
              label: `${pending.length} personalization draft${pending.length > 1 ? "s" : ""} waiting for review`,
              detail: titleOf(app.id),
              href: `/applications/${app.id}#personalization`,
            });
          }
          for (const r of runs) {
            if (NEEDS_ATTENTION_RUN.has(r.status) || r.sessionStatus === "WAITING_FOR_LOGIN") {
              items.push({
                key: `run-${r.id}`,
                label: `Application run needs you: ${r.status.replace(/_/g, " ")}`,
                detail: titleOf(app.id),
                href: `/applications/${app.id}`,
              });
              break;
            }
          }
        }
        setActions(items);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          window.location.href = "/login?expired=1";
          return;
        }
        setError("Could not load the dashboard. Start the API with npm run dev:api.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" sub="Application statistics, pipeline, and recommended actions." />
        <Card><p className="text-sm" data-testid="dashboard-loading">Loading dashboard…</p></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Dashboard" sub="Application statistics, pipeline, and recommended actions." />
        <Card><p className="text-sm" data-testid="dashboard-error">{error}</p></Card>
      </div>
    );
  }

  const byStatus = analytics?.applications.byStatus ?? {};
  const recentApps = (apps ?? []).slice(0, 5);
  const topMatches = (matches ?? []).slice(0, 5);
  const actionItems = actions ?? [];

  return (
    <div>
      <PageHeader title="Dashboard" sub="Application statistics, pipeline, and recommended actions." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Applications" value={analytics?.applications.total ?? 0} />
        <Stat label="Interviews" value={analytics?.applications.interview ?? 0} />
        <Stat label="Offers" value={analytics?.applications.offer ?? 0} />
        <Stat
          label="Response rate"
          value={`${Math.round((analytics?.rates.responseRate ?? 0) * 100)}%`}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active applications" value={recentApps.length} />
        <Stat label="Interview rate" value={`${Math.round((analytics?.rates.interviewRate ?? 0) * 100)}%`} />
        <Stat label="Matches scored" value={analytics?.matches.total ?? 0} />
        <Stat label="Jobs discovered" value={analytics?.jobs.total ?? 0} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Action center</h2>
          {actionItems.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }} data-testid="actions-empty">
              Nothing needs your attention right now.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 text-sm" data-testid="actions-list">
              {actionItems.slice(0, 12).map((a) => (
                <li key={a.key} className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
                  <Link href={a.href} className="font-medium hover:underline">
                    {a.label}
                  </Link>
                  {a.detail ? (
                    <div className="truncate" style={{ color: "var(--muted)" }}>{a.detail}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold">Application pipeline</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.keys(byStatus).length === 0 ? (
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                No applications yet. Add a job, then track it.
              </span>
            ) : (
              Object.entries(byStatus).map(([s, n]) => (
                <Badge key={s}>{s.replace(/_/g, " ")}: {n}</Badge>
              ))
            )}
          </div>
          <h2 className="mt-5 font-semibold">Discovery</h2>
          {discovery ? (
            <div className="mt-2 text-sm">
              <p style={{ color: "var(--muted)" }}>
                {discovery.enabled ? "Enabled" : "Disabled"}
                {discovery.sources.length > 0 ? ` · ${discovery.sources.join(", ")}` : ""}
                {discovery.lastRunAt ? ` · last run ${new Date(discovery.lastRunAt).toLocaleString()}` : " · never run"}
                {discovery.lastStatus ? ` (${discovery.lastStatus})` : ""}
              </p>
              <Link href="/discovery" className="mt-1 inline-block font-medium hover:underline">
                Open Discovery →
              </Link>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Recent applications</h2>
            <Link href="/applications" className="text-sm font-medium hover:underline">View all →</Link>
          </div>
          {recentApps.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>No applications yet.</p>
          ) : (
            <ul className="mt-3 grid gap-2 text-sm">
              {recentApps.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/applications/${a.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {a.job?.title ?? "Application"} · {a.job?.companyName ?? ""}
                  </Link>
                  <Badge>{a.status.replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Recommended jobs</h2>
            <Link href="/matches" className="text-sm font-medium hover:underline">View all →</Link>
          </div>
          {topMatches.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              No matches yet. Discover jobs, then run matching.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 text-sm">
              {topMatches.map((m) => (
                <li key={m.jobId} className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/jobs/${m.jobId}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {m.job?.title ?? "Job"} · {m.job?.company ?? m.job?.companyName ?? ""}
                  </Link>
                  <Badge>{m.overallScore}/100 · {m.decision.replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Hiring signals</h2>
            <Link href="/leads" className="text-sm font-medium hover:underline">Open Leads →</Link>
          </div>
          {(signals ?? []).length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>No recent hiring signals.</p>
          ) : (
            <ul className="mt-3 grid gap-2 text-sm">
              {(signals ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{s.title}</span>
                    <span style={{ color: "var(--muted)" }}> · {s.companyName}</span>
                  </span>
                  {s.relatedJobId ? (
                    <Link href={`/jobs/${s.relatedJobId}`} className="font-medium hover:underline">View job →</Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
