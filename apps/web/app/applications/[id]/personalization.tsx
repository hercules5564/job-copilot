"use client";

import { useEffect, useState } from "react";
import { personalizationApi, ApiError, type PersonalizationDraft, type DraftFact } from "../../../lib/api";
import { Card, Badge } from "../../../components/ui";

/**
 * Phase 15 — AI Application Personalization section.
 * Review-gated drafts: generate → inspect → edit → approve/reject.
 * Approval only records human review; it never submits or automates.
 */

function factsById(inventory: DraftFact[]): Map<string, DraftFact> {
  return new Map(inventory.map((f) => [f.id, f]));
}

function UsedFacts({ ids, inventory }: { ids: string[]; inventory: Map<string, DraftFact> }) {
  if (ids.length === 0) return null;
  return (
    <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
      <span className="font-medium">Grounded in: </span>
      {ids.map((id) => {
        const f = inventory.get(id);
        return (
          <span key={id} className="mr-1 inline-block rounded border px-1" title={f ? `${f.sourceType} · ${f.field}: ${f.value}` : id}>
            {f ? `${f.sourceType}:${f.field}` : id}
          </span>
        );
      })}
    </div>
  );
}

export default function PersonalizationSection({ applicationId }: { applicationId: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<PersonalizationDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeCover, setIncludeCover] = useState(true);
  const [questions, setQuestions] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editSummary, setEditSummary] = useState("");
  const [editCover, setEditCover] = useState("");
  const [editAnswers, setEditAnswers] = useState<Record<string, string>>({});

  async function refresh(selectId?: string) {
    try {
      const [s, d] = await Promise.all([
        personalizationApi.status(applicationId),
        personalizationApi.drafts(applicationId).catch(() => ({ drafts: [] as PersonalizationDraft[] })),
      ]);
      setConfigured(s.status.configured);
      setProvider(s.status.provider);
      setDrafts(d.drafts);
      if (d.drafts.length > 0) {
        const id = selectId ?? selectedId ?? d.drafts[0].id;
        setSelectedId(d.drafts.some((x) => x.id === id) ? id : d.drafts[0].id);
      } else {
        setSelectedId(null);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        window.location.href = "/login?expired=1";
        return;
      }
      setError("Could not load personalization. Start the API with npm run dev:api.");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const selected = drafts.find((d) => d.id === selectedId) ?? null;
  const inventory = factsById(selected?.factInventory ?? []);

  async function run(label: string, fn: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
      setNotice(`${label} done.`);
    } catch (e) {
      setError(e instanceof ApiError ? `Request failed (${e.status}). ${e.message}` : `${label} failed.`);
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    const qs = questions.split("\n").map((q) => q.trim()).filter(Boolean).slice(0, 10);
    await run("Draft generated", async () => {
      const r = await personalizationApi.generate(applicationId, {
        includeSummary,
        includeCoverLetter: includeCover,
        questions: qs,
      });
      setEditing(false);
      await refresh(r.draft.id);
    });
  }

  function beginEdit() {
    if (!selected?.content) return;
    setEditSummary(selected.content.summary?.text ?? "");
    setEditCover(selected.content.coverLetter?.text ?? "");
    const map: Record<string, string> = {};
    for (const a of selected.content.answers) map[a.question] = a.answer;
    setEditAnswers(map);
    setEditing(true);
  }

  async function saveEdit() {
    if (!selected) return;
    const answers = selected.content.answers.map((a) => ({
      question: a.question,
      answer: editAnswers[a.question] ?? a.answer,
    }));
    await run("Edits saved", async () => {
      const r = await personalizationApi.edit(applicationId, selected.id, {
        summaryText: selected.content.summary ? editSummary : undefined,
        coverLetterText: selected.content.coverLetter ? editCover : undefined,
        answers,
      });
      setEditing(false);
      await refresh(r.draft.id);
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">AI Application Personalization</h2>
        {selected ? <Badge>{selected.status.replace(/_/g, " ")}{selected.userEdited ? " · EDITED" : ""}</Badge> : null}
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Fact-grounded drafts from your profile, resume, and projects. AI output is never auto-approved
        and never submitted — approval only records your review.
      </p>
      {error ? <p className="mt-2 text-sm" data-testid="personalization-error">{error}</p> : null}
      {notice ? <p className="mt-2 text-sm" data-testid="personalization-notice">{notice}</p> : null}

      {configured === false ? (
        <p className="mt-3 text-sm" data-testid="personalization-unconfigured" style={{ color: "var(--muted)" }}>
          AI generation is not configured. Set AI_GENERATION_PROVIDER and provider credentials on the API server to enable drafts.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={includeSummary} onChange={(e) => setIncludeSummary(e.target.checked)} /> Summary
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={includeCover} onChange={(e) => setIncludeCover(e.target.checked)} /> Cover letter
            </label>
            {provider ? <Badge>{provider}</Badge> : null}
          </div>
          <label className="grid gap-1">
            <span style={{ color: "var(--muted)" }}>Application questions (one per line, max 10 — answered only from your facts)</span>
            <textarea
              className="w-full rounded-lg border p-2"
              rows={2}
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              placeholder="How many years of React experience do you have?"
              data-testid="personalization-questions"
            />
          </label>
          <div>
            <button
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
              disabled={busy || configured !== true}
              onClick={() => void generate()}
              data-testid="personalization-generate"
            >
              {busy ? "Generating…" : drafts.length > 0 ? "Regenerate Draft" : "Generate Draft"}
            </button>
          </div>
        </div>
      )}

      {drafts.length > 1 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span style={{ color: "var(--muted)" }}>Versions:</span>
          {drafts.map((d, i) => (
            <button
              key={d.id}
              className={`rounded-lg border px-2 py-1 text-xs ${d.id === selectedId ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
              onClick={() => { setSelectedId(d.id); setEditing(false); }}
            >
              v{drafts.length - i} · {d.status.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      ) : null}

      {selected ? (
        <div className="mt-4 grid gap-3 text-sm" data-testid="personalization-draft">
          <div className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
            <p className="font-medium">
              {selected.status === "APPROVED"
                ? "APPROVED BY YOU — READY TO USE"
                : selected.status === "REJECTED"
                  ? "REJECTED — KEPT FOR HISTORY"
                  : "AI GENERATED — REVIEW REQUIRED"}
            </p>
            <p style={{ color: "var(--muted)" }}>
              Job: {selected.jobTitle} · {selected.jobCompany} · provider: {selected.provider}
              {selected.userEdited ? " · you edited this draft" : ""}
            </p>
          </div>

          {selected.content.selectedProjects.length > 0 ? (
            <div>
              <h3 className="font-semibold">Selected Projects</h3>
              <ul className="mt-1 grid gap-1">
                {selected.content.selectedProjects.map((p) => (
                  <li key={p.projectId}>
                    ✓ {p.name}
                    {p.matchedSkills.length > 0 ? <span style={{ color: "var(--muted)" }}> · {p.matchedSkills.join(", ")}</span> : null}
                    {p.rationale ? <div style={{ color: "var(--muted)" }}>{p.rationale}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {selected.content.summary ? (
            <div>
              <h3 className="font-semibold">Professional Summary</h3>
              {editing ? (
                <textarea
                  className="mt-1 w-full rounded-lg border p-2"
                  rows={4}
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  data-testid="personalization-edit-summary"
                />
              ) : (
                <p className="mt-1 whitespace-pre-wrap break-words">{selected.content.summary.text}</p>
              )}
              <UsedFacts ids={selected.content.summary.usedFactIds} inventory={inventory} />
            </div>
          ) : null}

          {selected.content.coverLetter ? (
            <div>
              <h3 className="font-semibold">Cover Letter</h3>
              {editing ? (
                <textarea
                  className="mt-1 w-full rounded-lg border p-2"
                  rows={6}
                  value={editCover}
                  onChange={(e) => setEditCover(e.target.value)}
                  data-testid="personalization-edit-cover"
                />
              ) : (
                <p className="mt-1 whitespace-pre-wrap break-words">{selected.content.coverLetter.text}</p>
              )}
              <UsedFacts ids={selected.content.coverLetter.usedFactIds} inventory={inventory} />
            </div>
          ) : null}

          {selected.content.answers.length > 0 ? (
            <div>
              <h3 className="font-semibold">Application Answers</h3>
              <div className="mt-1 grid gap-2">
                {selected.content.answers.map((a) => (
                  <div key={a.question} className="rounded-lg border p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{a.question}</span>
                      <Badge>{a.status.replace(/_/g, " ")}</Badge>
                    </div>
                    {a.status === "NEEDS_USER_INPUT" && !editing ? (
                      <p className="mt-1" style={{ color: "var(--muted)" }}>
                        Needs your input — the model did not invent an answer.
                      </p>
                    ) : editing ? (
                      <textarea
                        className="mt-1 w-full rounded-lg border p-2"
                        rows={2}
                        value={editAnswers[a.question] ?? ""}
                        onChange={(e) => setEditAnswers((prev) => ({ ...prev, [a.question]: e.target.value }))}
                      />
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap break-words">{a.answer}</p>
                    )}
                    <UsedFacts ids={a.usedFactIds} inventory={inventory} />
                    {a.warnings.map((w) => (
                      <p key={w} className="mt-1 text-xs" style={{ color: "var(--muted)" }}>⚠ {w}</p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {selected.content.warnings.length > 0 ? (
            <div>
              <h3 className="font-semibold">Warnings</h3>
              <ul className="mt-1">
                {selected.content.warnings.map((w) => (
                  <li key={w} className="text-xs" style={{ color: "var(--muted)" }}>⚠ {w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {selected.status === "REVIEW_REQUIRED" && !editing ? (
              <button
                className="rounded-lg border px-4 py-2 text-sm"
                disabled={busy}
                onClick={beginEdit}
                data-testid="personalization-edit"
              >
                Edit
              </button>
            ) : null}
            {editing ? (
              <>
                <button
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
                  disabled={busy}
                  onClick={() => void saveEdit()}
                  data-testid="personalization-save-edit"
                >
                  Save edits
                </button>
                <button className="rounded-lg border px-4 py-2 text-sm" disabled={busy} onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </>
            ) : null}
            {selected.status === "REVIEW_REQUIRED" && !editing ? (
              <>
                <button
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
                  disabled={busy}
                  onClick={() => void run("Draft approved", async () => {
                    await personalizationApi.approve(applicationId, selected.id);
                    await refresh(selected.id);
                  })}
                  data-testid="personalization-approve"
                >
                  Approve
                </button>
                <button
                  className="rounded-lg border px-4 py-2 text-sm"
                  disabled={busy}
                  onClick={() => void run("Draft rejected", async () => {
                    await personalizationApi.reject(applicationId, selected.id);
                    await refresh(selected.id);
                  })}
                  data-testid="personalization-reject"
                >
                  Reject
                </button>
              </>
            ) : null}
          </div>
          {selected.status === "APPROVED" ? (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Approved by you. Approval records review only — nothing was submitted or sent.
            </p>
          ) : null}
        </div>
      ) : configured ? (
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }} data-testid="personalization-empty">
          No drafts yet. Generate your first fact-grounded draft above.
        </p>
      ) : null}
    </Card>
  );
}
