"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Job, type JobSource, type IngestionResult, type JobMatch } from "../../lib/api";
import { plainText } from "../../lib/text";
import { PageHeader, Card, Badge } from "../../components/ui";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", company: "", location: "", description: "" });
  const [sources, setSources] = useState<JobSource[]>([]);
  const [ingest, setIngest] = useState({ source: "arbeitnow", query: "", location: "", remote: false, limit: 10 });
  const [result, setResult] = useState<IngestionResult | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [matches, setMatches] = useState<Record<string, JobMatch>>({});
  const [matching, setMatching] = useState(false);
  const [sort, setSort] = useState<"newest" | "score">("newest");

  async function load() {
    try {
      const r = await api.jobs();
      setJobs(r.jobs);
    } catch {
      setError("API unreachable. Start it with npm run dev:api.");
    }
    try {
      const s = await api.jobSources();
      setSources(s.sources);
      if (s.sources.length > 0) {
        setIngest((prev) => ({ ...prev, source: prev.source || s.sources[0].id }));
      }
    } catch {
      // Sources list is optional; manual entry still works.
    }
    try {
      const m = await api.matches();
      const byJob: Record<string, JobMatch> = {};
      for (const match of m.matches) byJob[match.jobId] = match;
      setMatches(byJob);
    } catch {
      // Matches are optional; jobs still list without scores.
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.createJob(form);
      setForm({ title: "", company: "", location: "", description: "" });
      await load();
    } catch {
      setError("Failed to create job.");
    }
  }

  async function runMatching() {
    setError("");
    setMatching(true);
    try {
      await api.runMatches(20);
      await load();
    } catch {
      setError("Matching failed. Create your profile first, then retry.");
    } finally {
      setMatching(false);
    }
  }

  const visibleJobs = [...jobs].sort((a, b) => {
    if (sort === "score") {
      return (matches[b.id]?.overallScore ?? -1) - (matches[a.id]?.overallScore ?? -1);
    }
    return 0; // API already returns newest first
  });

  function decisionLabel(d: JobMatch["decision"]) {
    return d.replace("_", " ");
  }

  function modeLabel(m: JobMatch) {
    if (m.matchMode === "hybrid") return "HYBRID";
    if (m.matchMode === "semantic") return "SEMANTIC";
    if (m.matchMode === "deterministic_fallback") return "DETERMINISTIC (fallback)";
    return "DETERMINISTIC";
  }

  async function runIngest(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setIngesting(true);
    try {
      const r = await api.ingestJobs({
        source: ingest.source,
        query: ingest.query || undefined,
        location: ingest.location || undefined,
        remote: ingest.remote || undefined,
        limit: ingest.limit,
      });
      setResult(r.ingestion);
      await load();
    } catch {
      setError("Ingestion failed. Is the API running?");
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Jobs" sub="Ingest from a registered source or add a job manually (Phase 3)." />
      {error ? <Card className="mb-4"><p className="text-sm">{error}</p></Card> : null}
      <Card>
        <h2 className="font-semibold">Ingest jobs</h2>
        <form onSubmit={runIngest} className="mt-3 grid gap-3">
          <select className="rounded-lg border p-2" value={ingest.source}
            onChange={(e) => setIngest({ ...ingest, source: e.target.value })}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.mock ? " (mock)" : ""}</option>
            ))}
          </select>
          <input className="rounded-lg border p-2" placeholder="Query (e.g. backend)" value={ingest.query}
            onChange={(e) => setIngest({ ...ingest, query: e.target.value })} />
          <input className="rounded-lg border p-2" placeholder="Location (optional)" value={ingest.location}
            onChange={(e) => setIngest({ ...ingest, location: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ingest.remote}
              onChange={(e) => setIngest({ ...ingest, remote: e.target.checked })} />
            Remote only
          </label>
          <input className="rounded-lg border p-2" type="number" min={1} max={50} value={ingest.limit}
            onChange={(e) => setIngest({ ...ingest, limit: Number(e.target.value) })} />
          <button className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black" type="submit" disabled={ingesting}>
            {ingesting ? "Ingesting…" : "Run ingestion"}
          </button>
        </form>
        {result ? (
          <p className="mt-3 text-sm">
            Fetched {result.fetched} · inserted {result.inserted} · updated {result.updated} ·{" "}
            duplicates {result.duplicates} · rejected {result.rejected}
            {result.errors.length > 0 ? ` · errors: ${result.errors[0].reason}` : ""}
          </p>
        ) : null}
      </Card>
      <Card>
        <h2 className="font-semibold">Add a job</h2>
        <form onSubmit={submit} className="mt-3 grid gap-3">
          <input className="rounded-lg border p-2" placeholder="Title *" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <input className="rounded-lg border p-2" placeholder="Company *" value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })} required />
          <input className="rounded-lg border p-2" placeholder="Location" value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <textarea className="rounded-lg border p-2" placeholder="Description *" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} required rows={3} />
          <button className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black" type="submit">
            Add job
          </button>
        </form>
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Jobs</h2>
          <div className="flex items-center gap-2">
            <select className="rounded-lg border p-1 text-sm" value={sort}
              onChange={(e) => setSort(e.target.value as "newest" | "score")}>
              <option value="newest">Newest</option>
              <option value="score">Match score</option>
            </select>
            <button
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
              onClick={runMatching} disabled={matching}>
              {matching ? "Matching…" : "Match Jobs"}
            </button>
          </div>
        </div>
      </Card>
      <div className="mt-4 grid gap-3">
        {visibleJobs.map((j) => {
          const m = matches[j.id];
          return (
            <Card key={j.id}>
              <div className="flex items-center justify-between gap-2">
                <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                  {j.title} · {j.company}
                </Link>
                <Badge>{j.remote ? "Remote" : j.location ?? "—"}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 break-words text-sm" style={{ color: "var(--muted)" }}>
                {plainText(j.description, 400)}
              </p>
              <div className="mt-2 text-sm">
                {m ? (
                  <details>
                    <summary className="cursor-pointer font-medium">
                      {m.overallScore}% Match · {decisionLabel(m.decision)} · {modeLabel(m)}
                    </summary>
                    <div className="mt-2">
                      <p className="font-medium">Skills</p>
                      <ul className="mt-1">
                        {m.matchedSkills.map((s) => <li key={`m-${s}`}>✓ {s}</li>)}
                        {m.missingSkills.map((s) => <li key={`x-${s}`}>✕ {s}</li>)}
                        {m.matchedSkills.length === 0 && m.missingSkills.length === 0
                          ? <li>No explicit skills detected.</li> : null}
                      </ul>
                      {m.reasons.length > 0 ? (
                        <>
                          <p className="mt-2 font-medium">Why</p>
                          <ul className="mt-1">
                            {m.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                          </ul>
                        </>
                      ) : null}
                      {m.warnings.length > 0 ? (
                        <>
                          <p className="mt-2 font-medium">Warnings</p>
                          <ul className="mt-1">
                            {m.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                          </ul>
                        </>
                      ) : null}
                      {(m.matchMode === "hybrid" || m.matchMode === "semantic") &&
                      m.semanticScore !== undefined ? (
                        <p className="mt-2" style={{ color: "var(--muted)" }}>
                          Semantic score {m.semanticScore}% — considers related roles and
                          technologies beyond exact skill names.
                        </p>
                      ) : (
                        <p className="mt-2" style={{ color: "var(--muted)" }}>
                          Deterministic matching.
                        </p>
                      )}
                    </div>
                  </details>
                ) : (
                  <span style={{ color: "var(--muted)" }}>Not matched yet</span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  href={`/jobs/${j.id}`}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                  style={{ borderColor: "var(--border)" }}
                >
                  Prepare application →
                </Link>
                {j.sourceUrl ? (
                  <a
                    href={j.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium hover:underline"
                    style={{ color: "var(--muted)" }}
                  >
                    Original posting ↗
                  </a>
                ) : null}
              </div>
            </Card>
          );
        })}
        {jobs.length === 0 ? <p className="text-sm" style={{ color: "var(--muted)" }}>No jobs yet.</p> : null}
      </div>
    </div>
  );
}
