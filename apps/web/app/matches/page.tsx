"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  recommendationsApi,
  savedJobsApi,
  ApiError,
  type ExperienceLevel,
  type RecommendationItem,
} from "../../lib/api";
import { redirectToLogin } from "../../lib/auth-redirect";
import { PageHeader, Card, Badge } from "../../components/ui";

/**
 * Phase 22 — "Jobs Matched to Your Profile".
 * Every score comes from the persisted JobMatch rows produced by the
 * existing matcher; filters and sorting are presentation only.
 */

type Filters = {
  minScore: string;
  role: string;
  location: string;
  workMode: string;
  employmentType: string;
  experienceLevel: string;
  postedWithinDays: string;
  sort: "score" | "recent" | "salary";
};

const EMPTY_FILTERS: Filters = {
  minScore: "",
  role: "",
  location: "",
  workMode: "",
  employmentType: "",
  experienceLevel: "",
  postedWithinDays: "",
  sort: "score",
};

const DECISION_COPY: Record<string, string> = {
  STRONG_MATCH: "Strong match",
  GOOD_MATCH: "Good match",
  PARTIAL_MATCH: "Partial match",
  LOW_MATCH: "Low match",
};

function salaryLabel(item: RecommendationItem): string | null {
  if (item.salaryMin == null && item.salaryMax == null) return null;
  const fmt = (n: number) => n.toLocaleString();
  if (item.salaryMin != null && item.salaryMax != null) {
    return `${fmt(item.salaryMin)}–${fmt(item.salaryMax)} ${item.salaryCurrency}`;
  }
  if (item.salaryMin != null) return `from ${fmt(item.salaryMin)} ${item.salaryCurrency}`;
  return `up to ${fmt(item.salaryMax as number)} ${item.salaryCurrency}`;
}

function scoreColor(score: number): string {
  if (score >= 80) return "var(--success)";
  if (score >= 65) return "var(--blue)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

export default function MatchesPage() {
  const [items, setItems] = useState<RecommendationItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [runBusy, setRunBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (activeFilters: Filters) => {
    const params = new URLSearchParams();
    if (activeFilters.minScore) params.set("minScore", activeFilters.minScore);
    if (activeFilters.role.trim()) params.set("role", activeFilters.role.trim());
    if (activeFilters.location.trim()) params.set("location", activeFilters.location.trim());
    if (activeFilters.workMode) params.set("workMode", activeFilters.workMode);
    if (activeFilters.employmentType.trim()) params.set("employmentType", activeFilters.employmentType.trim());
    if (activeFilters.experienceLevel) params.set("experienceLevel", activeFilters.experienceLevel);
    if (activeFilters.postedWithinDays) params.set("postedWithinDays", activeFilters.postedWithinDays);
    params.set("sort", activeFilters.sort);
    params.set("limit", "50");
    try {
      const result = await recommendationsApi.list(`?${params.toString()}`);
      setItems(result.items);
      setTotal(result.total);
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        redirectToLogin({ expired: true });
        return;
      }
      setError("Could not load matched jobs. Start the API with npm run dev:api.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(filters), 250);
    return () => window.clearTimeout(timer);
  }, [filters, load]);

  async function runMatching() {
    setRunBusy(true);
    setError("");
    try {
      await recommendationsApi.run({ limit: 30 });
      await load(filters);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setError("Create and confirm your candidate profile first, then run matching.");
      } else {
        setError(e instanceof ApiError ? e.message : "Could not run matching.");
      }
    } finally {
      setRunBusy(false);
    }
  }

  async function toggleSave(item: RecommendationItem) {
    setSavingId(item.jobId);
    setError("");
    try {
      if (item.saved) await savedJobsApi.remove(item.jobId);
      else await savedJobsApi.save(item.jobId);
      setItems((prev) =>
        prev ? prev.map((row) => (row.jobId === item.jobId ? { ...row, saved: !row.saved } : row)) : prev,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update this bookmark.");
    } finally {
      setSavingId(null);
    }
  }

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      <PageHeader
        title="Jobs Matched to Your Profile"
        sub="Explainable scores from your confirmed resume profile. Filters and sorting never change the score."
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Minimum match</span>
              <select className="rounded-lg border p-2 text-sm" value={filters.minScore} onChange={(e) => set("minScore", e.target.value)}>
                <option value="">Any</option>
                <option value="50">50%+</option>
                <option value="65">65%+</option>
                <option value="80">80%+</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Role</span>
              <input className="rounded-lg border p-2 text-sm" value={filters.role} onChange={(e) => set("role", e.target.value)} placeholder="Engineer" />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Location</span>
              <input className="rounded-lg border p-2 text-sm" value={filters.location} onChange={(e) => set("location", e.target.value)} placeholder="Berlin, Remote" />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Work mode</span>
              <select className="rounded-lg border p-2 text-sm" value={filters.workMode} onChange={(e) => set("workMode", e.target.value)}>
                <option value="">Any</option>
                <option value="REMOTE">Remote</option>
                <option value="HYBRID">Hybrid</option>
                <option value="ONSITE">Onsite</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Employment type</span>
              <input className="rounded-lg border p-2 text-sm" value={filters.employmentType} onChange={(e) => set("employmentType", e.target.value)} placeholder="Full-time, Internship" />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Experience level</span>
              <select className="rounded-lg border p-2 text-sm" value={filters.experienceLevel} onChange={(e) => set("experienceLevel", e.target.value)}>
                <option value="">Any</option>
                <option value="INTERN">Internship</option>
                <option value="ENTRY">Entry</option>
                <option value="MID">Mid</option>
                <option value="SENIOR">Senior</option>
                <option value="LEAD">Lead</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Date posted</span>
              <select className="rounded-lg border p-2 text-sm" value={filters.postedWithinDays} onChange={(e) => set("postedWithinDays", e.target.value)}>
                <option value="">Any time</option>
                <option value="1">Last 24 hours</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium">Sort by</span>
              <select className="rounded-lg border p-2 text-sm" value={filters.sort} onChange={(e) => set("sort", e.target.value as Filters["sort"])}>
                <option value="score">Highest match</option>
                <option value="recent">Most recent</option>
                <option value="salary">Salary</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => void runMatching()}
            disabled={runBusy}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {runBusy ? "Matching…" : "Run matching"}
          </button>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          {total} matched job(s). Need a profile?{" "}
          <Link href="/job-profile" className="font-medium hover:underline">Build your job profile →</Link>
        </p>
      </Card>

      {error ? (
        <Card className="mb-4"><p className="text-sm" data-testid="matches-error">{error}</p></Card>
      ) : loading || items === null ? (
        <Card><p className="text-sm" data-testid="matches-loading">Loading matched jobs…</p></Card>
      ) : items.length === 0 ? (
        <Card>
          <p className="text-sm" data-testid="matches-empty">
            No matched jobs yet. Confirm your profile, add or discover jobs, then run matching.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/job-profile" className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
              Build your job profile
            </Link>
            <Link href="/jobs" className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
              Add or ingest jobs
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3" data-testid="matches-list">
          {items.map((item) => {
            const pay = salaryLabel(item);
            return (
              <Card key={item.jobId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/jobs/${item.jobId}`} className="text-base font-semibold hover:underline">
                        {item.title}
                      </Link>
                      {item.saved ? <Badge>Saved</Badge> : null}
                    </div>
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      {item.company}
                      {item.location ? ` · ${item.location}` : item.remote ? " · Remote" : ""}
                      {item.employmentType ? ` · ${item.employmentType}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge>{DECISION_COPY[item.decision] ?? item.decision}</Badge>
                      {item.experienceRequirement != null ? <Badge>{item.experienceRequirement}+ yrs</Badge> : null}
                      {pay ? <Badge>{pay}</Badge> : null}
                      <Badge>via {item.source}</Badge>
                      {item.postedAt ? <Badge>Posted {new Date(item.postedAt).toLocaleDateString()}</Badge> : null}
                    </div>
                  </div>
                  <div className="w-full sm:w-44">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-semibold" style={{ color: scoreColor(item.matchScore) }}>
                        {item.matchScore}%
                      </span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>{item.matchMode}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-sunken)" }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${item.matchScore}%`, background: scoreColor(item.matchScore) }} />
                    </div>
                  </div>
                </div>

                {item.reasons.length > 0 ? (
                  <ul className="mt-3 list-disc pl-5 text-sm">
                    {item.reasons.slice(0, 3).map((reason, i) => <li key={i}>{reason}</li>)}
                  </ul>
                ) : null}

                {item.missingSkills.length > 0 ? (
                  <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                    Weaker / missing skills: {item.missingSkills.slice(0, 6).join(", ")}
                  </p>
                ) : null}

                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer font-medium">Score breakdown</summary>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {[
                      ["Technical skills", item.breakdown.skillScore],
                      ["Role / title", item.breakdown.roleScore],
                      ["Experience", item.breakdown.experienceScore],
                      ["Projects", item.breakdown.projectScore],
                      ["Education", item.breakdown.educationScore],
                      ["Location", item.breakdown.locationScore],
                      ["Salary", item.breakdown.salaryScore],
                    ].map(([label, score]) => (
                      <div key={String(label)} className="flex items-center gap-2">
                        <span className="w-28 shrink-0" style={{ color: "var(--muted)" }}>{label}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-sunken)" }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${Number(score)}%`, background: scoreColor(Number(score)) }} />
                        </div>
                        <span className="w-8 text-right">{Number(score)}%</span>
                      </div>
                    ))}
                  </div>
                </details>

                <div className="mt-3 flex flex-wrap gap-2">
                  {item.applyUrl ? (
                    <a
                      href={item.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black"
                    >
                      Apply →
                    </a>
                  ) : (
                    <span className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                      No application URL provided
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void toggleSave(item)}
                    disabled={savingId === item.jobId}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {savingId === item.jobId ? "Saving…" : item.saved ? "Unsave" : "Save job"}
                  </button>
                  <Link
                    href={`/jobs/${item.jobId}`}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                    style={{ borderColor: "var(--border)" }}
                  >
                    Why this match →
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
