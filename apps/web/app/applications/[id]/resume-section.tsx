"use client";

import { useEffect, useState } from "react";
import { api, resumesApi, ApiError, type Resume } from "../../../lib/api";
import { Card, Badge } from "../../../components/ui";

/**
 * Phase 18 — resume ↔ application association UI.
 * Reads the associated resume from GET /api/applications/:id (Phase 18
 * backend exposure) and changes it through PATCH /api/applications/:id,
 * which validates ownership server-side (unknown/foreign ids → 404, never
 * stored). Explicit user action only; clearing is non-destructive.
 */
export default function ResumeSection({
  applicationId,
  current,
  onChanged,
}: {
  applicationId: string;
  current: { id: string; name: string; isActive: boolean } | null;
  onChanged: (resume: { id: string; name: string; isActive: boolean } | null) => void;
}) {
  const [resumes, setResumes] = useState<Resume[] | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resumesApi
      .list()
      .then((r) => {
        if (!cancelled) setResumes(r.resumes);
      })
      .catch(() => {
        if (!cancelled) setResumes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function associate(resumeId: string | null) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const r = await api.updateApplication(applicationId, { resumeId });
      onChanged(r.application.resume ?? null);
      setNotice(resumeId ? "Resume associated." : "Resume association removed.");
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? "That resume is not available for this application."
          : "Could not update the resume association.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Resume</h2>
        {current ? <Badge>{current.isActive ? "Active resume" : current.name}</Badge> : <Badge>None associated</Badge>}
      </div>
      {error ? <p className="mt-2 text-sm">{error}</p> : null}
      {notice ? <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{notice}</p> : null}
      {current ? (
        <p className="mt-2 text-sm">
          Using <span className="font-medium">{current.name}</span>
          {current.isActive ? "" : " (not marked active)"}. Personalization uses this
          resume when generating drafts.
        </p>
      ) : (
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          No resume is associated with this application yet. Personalization will fall
          back to your profile and active resume.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className="min-w-0 flex-1 rounded-lg border p-2 text-sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          aria-label="Choose a resume to associate"
        >
          <option value="">Choose a resume…</option>
          {(resumes ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}{r.isActive ? " (active)" : ""}
            </option>
          ))}
        </select>
        <button
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
          disabled={busy || !selected}
          onClick={() => void associate(selected)}
        >
          Associate
        </button>
        {current ? (
          <button
            className="rounded-lg border px-4 py-2 text-sm"
            disabled={busy}
            onClick={() => void associate(null)}
          >
            Remove
          </button>
        ) : null}
      </div>
      {resumes !== null && resumes.length === 0 ? (
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          No resumes yet. Create one on the <a href="/resume" className="font-medium hover:underline">Resume</a> page first.
        </p>
      ) : null}
    </Card>
  );
}
