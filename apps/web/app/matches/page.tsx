"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, type JobMatch, type Job } from "../../lib/api";
import { redirectToLogin } from "../../lib/auth-redirect";
import { PageHeader, Card, Badge } from "../../components/ui";

/**
 * Phase 11 — Track & Monitor: match visibility over existing JobMatch data.
 * Scores render exactly as stored; nothing is recomputed here.
 */

type MatchRow = JobMatch & {
  id?: string;
  // listMatches returns raw rows (companyName); the jobs API aliases it as
  // `company`. Read both without touching the API contract.
  job?: (Job & { companyName?: string }) | null;
  createdAt?: string;
};

const DECISION_COPY: Record<string, string> = {
  STRONG_MATCH: "Strong match",
  GOOD_MATCH: "Good match",
  PARTIAL_MATCH: "Partial match",
  LOW_MATCH: "Low match",
};

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .matches()
      .then((r) => setMatches(r.matches))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          redirectToLogin({ expired: true });
          return;
        }
        setError("Could not load matches. Start the API with npm run dev:api.");
      });
  }, []);

  return (
    <div>
      <PageHeader title="Matches" sub="Scored jobs from the deterministic, semantic, and hybrid matcher." />
      {error ? (
        <Card>
          <p className="text-sm" data-testid="matches-error">{error}</p>
        </Card>
      ) : matches === null ? (
        <Card>
          <p className="text-sm" data-testid="matches-loading">Loading matches…</p>
        </Card>
      ) : matches.length === 0 ? (
        <Card>
          <p className="text-sm" data-testid="matches-empty">
            No matches yet. Discover jobs, then run matching to score them.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3" data-testid="matches-list">
          {matches.map((m) => (
            <Card key={m.id ?? m.jobId}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">
                    {m.job ? (
                      <Link href={`/jobs/${m.job.id}`} className="hover:underline">
                        {m.job.title}
                      </Link>
                    ) : (
                      "Job"
                    )}
                  </div>
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    {m.job?.company ?? m.job?.companyName ?? ""}{m.job?.location ? ` · ${m.job.location}` : ""}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge>{DECISION_COPY[m.decision] ?? m.decision}</Badge>
                    <Badge>{m.overallScore}/100</Badge>
                    {m.matchMode ? <Badge>{m.matchMode}</Badge> : null}
                  </div>
                  {m.reasons.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-xs" style={{ color: "var(--muted)" }}>
                      {m.reasons.slice(0, 3).map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                  {m.missingSkills.length > 0 ? (
                    <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                      Missing: {m.missingSkills.slice(0, 5).join(", ")}
                    </p>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
