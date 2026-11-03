"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, type ApplicationSummary } from "../../lib/api";
import { PageHeader, Card, Badge } from "../../components/ui";

/**
 * Phase 18 — enriched tracker list. GET /api/applications already includes
 * the job summary; this page now renders it (title/company links) instead
 * of raw ids.
 */
export default function ApplicationsPage() {
  const [apps, setApps] = useState<ApplicationSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .applications()
      .then((r) => {
        if (!cancelled) setApps(r.applications);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          window.location.href = "/login?expired=1";
          return;
        }
        setError("Could not load applications. Start the API with npm run dev:api.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader title="Applications" sub="Lifecycle tracker. Every status change is an ApplicationEvent." />
      {error ? <Card><p className="text-sm">{error}</p></Card> : null}
      {apps === null && !error ? (
        <Card><p className="text-sm">Loading applications…</p></Card>
      ) : (apps ?? []).length === 0 ? (
        <Card><p className="text-sm" style={{ color: "var(--muted)" }}>
          No applications yet. <Link href="/jobs" className="font-medium hover:underline">Find a job</Link> and
          track it as an application.
        </p></Card>
      ) : (
        <div className="grid gap-3">
          {(apps ?? []).map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/applications/${a.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                  {a.job?.title ?? "Application"}
                  {a.job?.companyName ? <span style={{ color: "var(--muted)" }}> · {a.job.companyName}</span> : null}
                </Link>
                <Badge>{a.status.replace(/_/g, " ")}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <Link href={`/applications/${a.id}`} className="font-medium hover:underline">
                  Open workspace →
                </Link>
                <Link href={`/jobs/${a.jobId}`} className="hover:underline" style={{ color: "var(--muted)" }}>
                  View job
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
