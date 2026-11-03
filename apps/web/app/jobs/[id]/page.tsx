"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, type Job, type JobMatch } from "../../../lib/api";
import { PageHeader, Card, Badge } from "../../../components/ui";

/**
 * Phase 18 — real job-detail workflow over existing APIs:
 * GET /api/jobs/:id → GET /api/jobs/:id/match (saved match, or run one) →
 * find-or-create application → personalize → assist → track.
 * The matching algorithm is untouched; missing fields get honest fallbacks.
 */

function salary(job: Job): string | null {
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const cur = job.salaryCurrency ?? "USD";
  const fmt = (n: number) => n.toLocaleString();
  if (job.salaryMin != null && job.salaryMax != null) return `${fmt(job.salaryMin)}–${fmt(job.salaryMax)} ${cur}`;
  if (job.salaryMin != null) return `from ${fmt(job.salaryMin)} ${cur}`;
  return `up to ${fmt(job.salaryMax as number)} ${cur}`;
}

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [match, setMatch] = useState<JobMatch | null>(null);
  const [matchMissing, setMatchMissing] = useState(false);
  const [existingAppId, setExistingAppId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [j, m, apps] = await Promise.all([
          api.job(params.id),
          api.matchForJob(params.id).catch(() => ({ match: null as JobMatch | null })),
          api.applications().catch(() => ({ applications: [] as { id: string; jobId: string }[] })),
        ]);
        if (cancelled) return;
        setJob(j.job);
        setMatch(m.match);
        setMatchMissing(!m.match);
        setExistingAppId(apps.applications.find((a) => a.jobId === params.id)?.id ?? null);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          window.location.href = "/login?expired=1";
          return;
        }
        if (e instanceof ApiError && e.status === 404) {
          setError("Job not found.");
        } else {
          setError("Could not load this job. Start the API with npm run dev:api.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function runMatch() {
    setBusy(true);
    setError("");
    try {
      const r = await api.matchJob(params.id);
      setMatch(r.match);
      setMatchMissing(false);
    } catch {
      setError("Matching failed. Complete your profile first, then retry.");
    } finally {
      setBusy(false);
    }
  }

  async function openApplication() {
    if (existingAppId) {
      router.push(`/applications/${existingAppId}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await api.createApplication({ jobId: params.id });
      router.push(`/applications/${r.application.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Already tracked — resolve the existing one instead of duplicating.
        try {
          const apps = await api.applications();
          const found = apps.applications.find((a) => a.jobId === params.id);
          if (found) {
            router.push(`/applications/${found.id}`);
            return;
          }
        } catch {
          // Fall through to the generic error below.
        }
      }
      setError(e instanceof ApiError && e.status === 401 ? "Please sign in again." : "Could not create the application.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Job detail" sub={`ID: ${params.id}`} />
        <Card><p className="text-sm">Loading job…</p></Card>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div>
        <PageHeader title="Job detail" sub={`ID: ${params.id}`} />
        <Card><p className="text-sm">{error}</p></Card>
      </div>
    );
  }

  const company = job?.companyName ?? job?.company ?? "Unknown company";
  const pay = job ? salary(job) : null;

  return (
    <div>
      <PageHeader title={job?.title ?? "Job detail"} sub={company} />
      {error ? <Card className="mb-4"><p className="text-sm">{error}</p></Card> : null}

      <Card>
        <div className="flex flex-wrap gap-2">
          <Badge>{job?.remote ? "Remote" : (job?.location ?? "Location not specified")}</Badge>
          {job?.employmentType ? <Badge>{job.employmentType}</Badge> : null}
          {pay ? <Badge>{pay}</Badge> : null}
          {job?.sourceKey ? <Badge>via {job.sourceKey}</Badge> : null}
          {job?.postedAt ? <Badge>Posted {new Date(job.postedAt).toLocaleDateString()}</Badge> : null}
        </div>
        {job?.description ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-sm">{job.description}</p>
        ) : (
          <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>No description provided for this job.</p>
        )}
        {job?.sourceUrl ? (
          <p className="mt-3 text-sm">
            <a href={job.sourceUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">
              View original posting →
            </a>
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
            disabled={busy}
            onClick={() => void openApplication()}
          >
            {existingAppId ? "Open application →" : "Track as application →"}
          </button>
          <Link href="/jobs" className="rounded-lg border px-4 py-2 text-sm">
            Back to jobs
          </Link>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Match</h2>
          {matchMissing && !match ? (
            <button
              className="rounded-lg border px-3 py-1.5 text-sm"
              disabled={busy}
              onClick={() => void runMatch()}
            >
              {busy ? "Matching…" : "Run match"}
            </button>
          ) : null}
        </div>
        {!match ? (
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            Not matched yet. Run matching to score this job against your profile.
          </p>
        ) : (
          <div className="mt-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge>{match.overallScore}/100</Badge>
              <Badge>{match.decision.replace(/_/g, " ")}</Badge>
              {match.matchMode ? <Badge>{match.matchMode}</Badge> : null}
            </div>
            {match.reasons.length > 0 ? (
              <>
                <h3 className="mt-3 font-semibold">Why</h3>
                <ul className="mt-1 list-disc pl-5">
                  {match.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </>
            ) : null}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <h3 className="font-semibold">Matched skills</h3>
                {match.matchedSkills.length > 0 ? (
                  <ul className="mt-1">{match.matchedSkills.map((s) => <li key={s}>✓ {s}</li>)}</ul>
                ) : (
                  <p style={{ color: "var(--muted)" }}>None detected.</p>
                )}
              </div>
              <div>
                <h3 className="font-semibold">Missing skills</h3>
                {match.missingSkills.length > 0 ? (
                  <ul className="mt-1">{match.missingSkills.map((s) => <li key={s}>✕ {s}</li>)}</ul>
                ) : (
                  <p style={{ color: "var(--muted)" }}>None detected.</p>
                )}
              </div>
            </div>
            {match.missingRequirements.length > 0 ? (
              <>
                <h3 className="mt-3 font-semibold">Missing requirements</h3>
                <ul className="mt-1 list-disc pl-5">
                  {match.missingRequirements.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </>
            ) : null}
            {match.warnings.length > 0 ? (
              <>
                <h3 className="mt-3 font-semibold">Warnings</h3>
                <ul className="mt-1 list-disc pl-5">
                  {match.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </>
            ) : null}
            <p className="mt-3">
              <Link href="/matches" className="font-medium hover:underline">Compare all matches →</Link>
            </p>
          </div>
        )}
      </Card>

      {existingAppId ? (
        <Card>
          <h2 className="font-semibold">Application</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            You are already tracking this job.
          </p>
          <Link href={`/applications/${existingAppId}`} className="mt-2 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
            Continue: personalize → prepare → track →
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
