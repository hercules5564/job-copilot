"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { personalizationApi, ApiError, type PersonalizationDraft } from "../../../lib/api";
import { Card, Badge } from "../../../components/ui";

/**
 * Phase 16 — Approved Application Content section.
 * Shows ONLY the latest APPROVED draft (assistant-usable content), visually
 * distinct from unreviewed drafts. REVIEW_REQUIRED content never appears here.
 */
export default function ApprovedContentSection({ applicationId }: { applicationId: string }) {
  const [draft, setDraft] = useState<PersonalizationDraft | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    personalizationApi
      .approved(applicationId)
      .then((r) => {
        setDraft(r.draft);
        setLoaded(true);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          window.location.href = "/login?expired=1";
          return;
        }
        setLoaded(true);
      });
  }, [applicationId]);

  if (!loaded) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Approved Application Content</h2>
        {draft ? <Badge>APPROVED</Badge> : <Badge>None yet</Badge>}
      </div>
      {!draft ? (
        <div className="mt-2 text-sm">
          <p style={{ color: "var(--muted)" }} data-testid="approved-empty">
            No approved personalization yet. Only approved drafts can feed the application assistant.
          </p>
          <p className="mt-2" style={{ color: "var(--muted)" }}>
            Generate and review a draft below, then approve it to use it here.
          </p>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 text-sm" data-testid="approved-content">
          <p style={{ color: "var(--muted)" }}>
            Approved {new Date(draft.updatedAt).toLocaleString()} · provider: {draft.provider}
            {draft.userEdited ? " · includes your edits" : ""}
          </p>
          {draft.content.selectedProjects.length > 0 ? (
            <div>
              <h3 className="font-semibold">Selected Projects</h3>
              <ul className="mt-1">
                {draft.content.selectedProjects.map((p) => (
                  <li key={p.projectId}>✓ {p.name}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {draft.content.summary ? (
            <div>
              <h3 className="font-semibold">Professional Summary</h3>
              <p className="mt-1 whitespace-pre-wrap break-words">{draft.content.summary.text}</p>
            </div>
          ) : null}
          {draft.content.coverLetter ? (
            <div>
              <h3 className="font-semibold">Cover Letter</h3>
              <p className="mt-1 whitespace-pre-wrap break-words">{draft.content.coverLetter.text}</p>
            </div>
          ) : null}
          {draft.content.answers.filter((a) => a.status === "ANSWERED").length > 0 ? (
            <div>
              <h3 className="font-semibold">Approved Answers</h3>
              <div className="mt-1 grid gap-2">
                {draft.content.answers
                  .filter((a) => a.status === "ANSWERED")
                  .map((a) => (
                    <div key={a.question} className="rounded-lg border p-2">
                      <div className="font-medium">{a.question}</div>
                      <p className="mt-1 whitespace-pre-wrap break-words">{a.answer}</p>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
          {draft.content.warnings.length > 0 ? (
            <div>
              <h3 className="font-semibold">Warnings</h3>
              <ul className="mt-1">
                {draft.content.warnings.map((w) => (
                  <li key={w} className="text-xs" style={{ color: "var(--muted)" }}>⚠ {w}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Approval records your review only — the assistant still requires your explicit
            approve &amp; fill before anything is entered anywhere.{" "}
            <Link href="#personalization" className="underline">Review personalization</Link>
          </p>
        </div>
      )}
    </Card>
  );
}
