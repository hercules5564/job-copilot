"use client";

import { useEffect, useState } from "react";
import { analyticsApi, ApiError, type AnalyticsOverview } from "../../lib/api";
import { redirectToLogin } from "../../lib/auth-redirect";
import { PageHeader, Card, Badge, Stat } from "../../components/ui";

/**
 * Phase 12C — descriptive analytics over persisted records.
 * Every number is a historical count or average of stored data.
 * No predictions, no recommendations, no success scores.
 */

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div
        className="mt-1 h-2 overflow-hidden rounded-full"
        style={{ background: "var(--border)" }}
        role="img"
        aria-label={`${label}: ${value} of ${max}`}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--blue)" }} />
      </div>
    </div>
  );
}

function Distribution({
  title,
  entries,
  emptyHint,
}: {
  title: string;
  entries: [string, number][];
  emptyHint: string;
}) {
  const max = entries.reduce((m, [, v]) => Math.max(m, v), 0);
  return (
    <Card>
      <h2 className="font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{emptyHint}</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {entries.map(([label, value]) => (
            <Bar key={label} label={label.replace(/_/g, " ")} value={value} max={Math.max(max, 1)} />
          ))}
        </div>
      )}
    </Card>
  );
}

const STATUS_ORDER = [
  "DISCOVERED",
  "MATCHED",
  "REVIEW",
  "READY",
  "APPROVED",
  "APPLIED",
  "ASSESSMENT",
  "RECRUITER_RESPONSE",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
  "ARCHIVED",
];

const DECISION_ORDER = ["STRONG_MATCH", "GOOD_MATCH", "PARTIAL_MATCH", "LOW_MATCH"];

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    analyticsApi
      .get()
      .then((r) => setData(r.analytics))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          redirectToLogin({ expired: true });
          return;
        }
        setError("Could not load analytics. Start the API with npm run dev:api.");
      });
  }, []);

  return (
    <div>
      <PageHeader title="Analytics" sub="Track your job-search activity and application funnel. Historical counts only." />
      {error ? (
        <Card><p className="text-sm" data-testid="analytics-error">{error}</p></Card>
      ) : data === null ? (
        <Card><p className="text-sm" data-testid="analytics-loading">Loading analytics…</p></Card>
      ) : data.applications.total === 0 && data.matches.total === 0 && data.jobs.total === 0 ? (
        <Card>
          <p className="text-sm" data-testid="analytics-empty">
            No application data yet. Start by discovering jobs and creating your first application.
          </p>
        </Card>
      ) : (
        <div data-testid="analytics-content">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total applications" value={<span data-testid="stat-applications">{data.applications.total}</span>} />
            <Stat label="Recruiter responses" value={<span data-testid="stat-responses">{data.events.funnel.recruiterResponse}</span>} />
            <Stat label="Interviews" value={<span data-testid="stat-interviews">{data.events.funnel.interview}</span>} />
            <Stat label="Offers" value={<span data-testid="stat-offers">{data.events.funnel.offer}</span>} />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <Distribution
              title="Application status"
              entries={STATUS_ORDER.filter((s) => (data.applications.byStatus[s] ?? 0) > 0).map(
                (s) => [s, data.applications.byStatus[s]],
              )}
              emptyHint="No applications yet."
            />
            <Card>
              <h2 className="font-semibold">Application funnel</h2>
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                Unique applications that ever reached each stage. Rates use total applications as the denominator.
              </p>
              <div className="mt-3 grid gap-2">
                <Bar label="Applications" value={data.applications.total} max={Math.max(data.applications.total, 1)} />
                <Bar label={`Responses (${data.rates.responseRate}%)`} value={data.events.funnel.recruiterResponse} max={Math.max(data.applications.total, 1)} />
                <Bar label={`Interviews (${data.rates.interviewRate}%)`} value={data.events.funnel.interview} max={Math.max(data.applications.total, 1)} />
                <Bar label={`Offers (${data.rates.offerRate}%)`} value={data.events.funnel.offer} max={Math.max(data.applications.total, 1)} />
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <Distribution
              title="Match quality"
              entries={DECISION_ORDER.filter((d) => (data.matches.byDecision[d] ?? 0) > 0).map(
                (d) => [d.replace("_MATCH", ""), data.matches.byDecision[d]],
              )}
              emptyHint="No matches yet."
            />
            <Card>
              <h2 className="font-semibold">Matching</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span style={{ color: "var(--muted)" }}>Total matches:</span>
                <span className="font-medium tabular-nums" data-testid="matches-total">{data.matches.total}</span>
                {data.matches.averageScore !== null ? (
                  <Badge>
                    <span data-testid="matches-average">Average score {data.matches.averageScore}</span>
                  </Badge>
                ) : null}
              </div>
              <div className="mt-3">
                <div className="text-sm font-medium">By matching mode</div>
                {Object.keys(data.matches.byMode).length === 0 ? (
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>No mode data yet.</p>
                ) : (
                  <ul className="mt-1 grid gap-1 text-sm">
                    {Object.entries(data.matches.byMode).map(([mode, count]) => (
                      <li key={mode} className="flex justify-between gap-2">
                        <span>{mode}</span>
                        <span className="font-medium tabular-nums">{count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <Card>
              <h2 className="font-semibold">Discovery</h2>
              {!data.discovery.configured ? (
                <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>Discovery is not configured.</p>
              ) : (
                <div className="mt-2 grid gap-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <span style={{ color: "var(--muted)" }}>Status</span>
                    <span>{data.discovery.enabled ? "Enabled" : "Disabled"}{data.discovery.scheduled ? " · scheduled" : ""}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span style={{ color: "var(--muted)" }}>Sources</span>
                    <span>{data.discovery.sources.length > 0 ? data.discovery.sources.join(", ") : "—"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span style={{ color: "var(--muted)" }}>Last run</span>
                    <span>{data.discovery.lastRunAt ? `${data.discovery.lastRunAt.slice(0, 10)} · ${data.discovery.lastStatus ?? ""}` : "never"}</span>
                  </div>
                </div>
              )}
              <div className="mt-2 grid gap-1 text-sm">
                <div className="flex justify-between gap-2">
                  <span style={{ color: "var(--muted)" }}>Jobs tracked</span>
                  <span className="font-medium tabular-nums" data-testid="jobs-total">{data.jobs.total}</span>
                </div>
              </div>
              {Object.keys(data.jobs.bySource).length > 0 ? (
                <ul className="mt-2 grid gap-1 text-sm">
                  {Object.entries(data.jobs.bySource).map(([source, count]) => (
                    <li key={source} className="flex justify-between gap-2">
                      <span>{source}</span>
                      <span className="font-medium tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
            <Card>
              <h2 className="font-semibold">Recent activity</h2>
              <div className="mt-2 grid gap-1 text-sm">
                <div className="flex justify-between gap-2">
                  <span style={{ color: "var(--muted)" }}>Applications, last 7 days</span>
                  <span className="font-medium tabular-nums" data-testid="activity-7d">{data.activity.applicationsLast7Days}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span style={{ color: "var(--muted)" }}>Applications, last 30 days</span>
                  <span className="font-medium tabular-nums" data-testid="activity-30d">{data.activity.applicationsLast30Days}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span style={{ color: "var(--muted)" }}>Matches, last 30 days</span>
                  <span className="font-medium tabular-nums">{data.activity.matchesLast30Days}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span style={{ color: "var(--muted)" }}>Application events recorded</span>
                  <span className="font-medium tabular-nums">{data.events.total}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
