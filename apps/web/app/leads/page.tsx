"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { signalsApi, ApiError, type HiringSignal } from "../../lib/api";
import { PageHeader, Card, Badge } from "../../components/ui";

/**
 * Phase 13 (C3) — Leads / Hiring Signal inbox.
 * Read-only view over the P10B hiring-signal foundation (GET /api/signals).
 * Signal text is untrusted data: rendered as plain text only, never
 * interpreted. No outreach, no automation, no AI — display/filter only.
 */

const PAGE_SIZE = 20;

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "JOB_POSTING", label: "Job posting" },
  { value: "OFFICIAL_HIRING_ANNOUNCEMENT", label: "Hiring announcement" },
  { value: "CAREERS_PAGE_UPDATE", label: "Careers page update" },
  { value: "PUBLIC_HIRING_FEED", label: "Public hiring feed" },
];

function typeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso.slice(0, 10);
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function LeadsPage() {
  const [signals, setSignals] = useState<HiringSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState("");
  const [company, setCompany] = useState("");
  const [debouncedCompany, setDebouncedCompany] = useState("");
  const [source, setSource] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<HiringSignal | null>(null);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCompany(company.trim()), 300);
    return () => clearTimeout(t);
  }, [company]);

  function buildQuery(offset: number): string {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (debouncedCompany) params.set("company", debouncedCompany);
    if (source) params.set("source", source);
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    return `?${params.toString()}`;
  }

  const sourceOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const s of signals) seen.add(s.source);
    if (source) seen.add(source);
    return ["", ...[...seen].sort()];
  }, [signals, source]);

  async function load(offset: number, append: boolean) {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError("");
    }
    try {
      const r = await signalsApi.list(buildQuery(offset));
      setSignals((prev) => (append ? [...prev, ...r.signals] : r.signals));
      setHasMore(r.signals.length === PAGE_SIZE);
      setExpandedId(null);
      setDetail(null);
      setDetailError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        window.location.href = "/login?expired=1";
        return;
      }
      setError("Could not load hiring signals. Start the API with npm run dev:api.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  // Reload from the first page whenever a filter changes.
  useEffect(() => {
    void load(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, debouncedCompany, source, debouncedSearch]);

  async function open(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setDetailError("");
    const cached = signals.find((s) => s.id === id);
    if (cached) setDetail(cached);
    try {
      const r = await signalsApi.get(id);
      setDetail(r.signal);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        window.location.href = "/login?expired=1";
        return;
      }
      // The list row already shows the essentials; detail refresh is best-effort.
      if (!cached) setDetailError("Could not load signal details.");
    }
  }

  const shown = detail && detail.id === expandedId ? detail : null;

  return (
    <div>
      <PageHeader
        title="Leads"
        sub="Hiring signals and opportunities detected from your job discovery activity."
      />
      {error ? (
        <Card className="mb-4">
          <p className="text-sm" data-testid="leads-error">{error}</p>
        </Card>
      ) : null}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm">
            <span style={{ color: "var(--muted)" }}>Search signals</span>
            <input
              className="w-full rounded-lg border p-2"
              placeholder="Search signals…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="leads-search"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span style={{ color: "var(--muted)" }}>Signal type</span>
            <select
              className="w-full rounded-lg border p-2"
              value={type}
              onChange={(e) => setType(e.target.value)}
              data-testid="leads-type-filter"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.label} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span style={{ color: "var(--muted)" }}>Company</span>
            <input
              className="w-full rounded-lg border p-2"
              placeholder="Filter by company…"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              data-testid="leads-company-filter"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span style={{ color: "var(--muted)" }}>Source</span>
            <select
              className="w-full rounded-lg border p-2"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              data-testid="leads-source-filter"
            >
              {sourceOptions.map((s) => (
                <option key={s || "all"} value={s}>{s || "All sources"}</option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {loading ? (
        <Card>
          <p className="text-sm" data-testid="leads-loading">Loading hiring signals…</p>
        </Card>
      ) : signals.length === 0 && !error ? (
        <Card>
          <p className="text-sm font-medium" data-testid="leads-empty">No hiring signals yet</p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            JobPilot will show relevant hiring signals here as your discovery system finds them.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href="/jobs" className="rounded-lg border px-3 py-1" data-testid="leads-browse-jobs">
              Browse Jobs
            </Link>
            <Link href="/discovery" className="rounded-lg border px-3 py-1">
              Open Discovery
            </Link>
          </div>
        </Card>
      ) : (
        <div className="mt-4 grid gap-3" data-testid="leads-list">
          {signals.map((s) => (
            <Card key={s.id} className="min-w-0">
              <button
                className="w-full min-w-0 text-left"
                onClick={() => void open(s.id)}
                data-testid={`leads-card-${s.id}`}
                aria-expanded={expandedId === s.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="break-words font-medium">{s.title}</div>
                    <p className="mt-0.5 break-words text-sm" style={{ color: "var(--muted)" }}>
                      {s.companyName} · {s.source} · {timeAgo(s.detectedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge>{typeLabel(s.type)}</Badge>
                    <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                      {s.confidence}%
                    </span>
                  </div>
                </div>
                {s.evidenceSummary ? (
                  <p className="mt-1 line-clamp-2 break-words text-sm" style={{ color: "var(--muted)" }}>
                    {s.evidenceSummary}
                  </p>
                ) : null}
              </button>
              {expandedId === s.id ? (
                <div className="mt-3 border-t pt-3 text-sm" data-testid="leads-detail">
                  {detailError ? (
                    <p className="text-sm">{detailError}</p>
                  ) : shown ? (
                    <dl className="grid gap-1">
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt style={{ color: "var(--muted)" }}>Signal type</dt>
                        <dd className="break-words font-medium">{typeLabel(shown.type)}</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt style={{ color: "var(--muted)" }}>Detected</dt>
                        <dd className="break-words">{new Date(shown.detectedAt).toLocaleString()}</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt style={{ color: "var(--muted)" }}>Company</dt>
                        <dd className="break-words font-medium">{shown.companyName}</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt style={{ color: "var(--muted)" }}>Source</dt>
                        <dd className="break-words">{shown.source}</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt style={{ color: "var(--muted)" }}>Confidence</dt>
                        <dd className="tabular-nums">{shown.confidence}%</dd>
                      </div>
                      {shown.evidenceSummary ? (
                        <div className="mt-1">
                          <dt className="font-medium">Why this appeared</dt>
                          <dd className="mt-0.5 break-words" style={{ color: "var(--muted)" }}>
                            {shown.evidenceSummary}
                          </dd>
                        </div>
                      ) : null}
                      {shown.url ? (
                        <div className="flex flex-wrap justify-between gap-2">
                          <dt style={{ color: "var(--muted)" }}>Source link</dt>
                          <dd className="min-w-0 max-w-full break-all">
                            <a href={shown.url} target="_blank" rel="noopener noreferrer" className="underline">
                              Open source posting
                            </a>
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt style={{ color: "var(--muted)" }}>Related job</dt>
                        <dd>
                          {shown.relatedJob ? (
                            <Link href={`/jobs/${shown.relatedJob.id}`} className="underline" data-testid="leads-view-job">
                              View Job: {shown.relatedJob.title}
                            </Link>
                          ) : shown.relatedJobId ? (
                            <span style={{ color: "var(--muted)" }}>Related job is unavailable</span>
                          ) : (
                            <span style={{ color: "var(--muted)" }}>No linked job</span>
                          )}
                        </dd>
                      </div>
                      {shown.applicationId ? (
                        <div className="flex flex-wrap justify-between gap-2">
                          <dt style={{ color: "var(--muted)" }}>Application</dt>
                          <dd>
                            <Link href={`/applications/${shown.applicationId}`} className="underline" data-testid="leads-view-application">
                              View Application
                            </Link>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--muted)" }}>Loading details…</p>
                  )}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && hasMore ? (
        <div className="mt-4 flex justify-center">
          <button
            className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
            onClick={() => void load(signals.length, true)}
            disabled={loadingMore}
            data-testid="leads-load-more"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
