"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, runsApi, personalizationApi, type ApplicationDetail, type ApplicationRun, type AdapterDescriptor, type PersonalizationDraft, type JobMatch } from "../../../lib/api";
import { PageHeader, Card, Badge } from "../../../components/ui";
import PersonalizationSection from "./personalization";
import ApprovedContentSection from "./approved-content";
import ResumeSection from "./resume-section";
import NextActionBanner, { computeNextAction } from "./next-action";

const DEMO_TARGET = typeof window !== "undefined"
  ? `${window.location.origin}/demo-application`
  : "http://localhost:3000/demo-application";

const ATS_TARGET = typeof window !== "undefined"
  ? `${window.location.origin}/ats-demo/apply`
  : "http://localhost:3000/ats-demo/apply";

const PROGRESS = ["Open", "Inspect", "Generate", "Review", "Approve", "Fill", "Confirm", "Submit", "Track"];

function progressIndex(status: string): number {
  switch (status) {
    case "CREATED": return 0;
    case "OPENING":
    case "INSPECTING":
    case "MAPPING": return 1;
    case "WAITING_FOR_REVIEW": return 3;
    case "READY_TO_FILL": return 4;
    case "FILLING": return 5;
    case "WAITING_FOR_SUBMISSION": return 6;
    case "SUBMITTED": return 8;
    default: return 3;
  }
}

function browserLabel(run: ApplicationRun): string {
  if (run.sessionStatus === "WAITING_FOR_LOGIN") return "WAITING FOR LOGIN";
  if (!run.sessionStatus || run.sessionStatus === "CLOSED" || run.sessionStatus === "EXPIRED") return run.sessionStatus ?? "—";
  if (["READY", "RUNNING"].includes(run.sessionStatus)) return "ACTIVE";
  return run.sessionStatus.replace(/_/g, " ");
}

export default function ApplicationDetailPage({ params }: { params: { id: string } }) {
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [runs, setRuns] = useState<ApplicationRun[]>([]);
  const [run, setRun] = useState<ApplicationRun | null>(null);
  const [adapters, setAdapters] = useState<AdapterDescriptor[]>([]);
  const [adapterId, setAdapterId] = useState("demo");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<PersonalizationDraft[]>([]);
  const [match, setMatch] = useState<JobMatch | null>(null);

  async function refresh() {
    const [a, r, d] = await Promise.all([
      api.application(params.id),
      runsApi.list(params.id),
      runsApi.adapters().catch(() => ({ adapters: [] as AdapterDescriptor[] })),
    ]);
    setApp(a.application);
    setRuns(r.runs);
    setAdapters(d.adapters);
    if (run) {
      const updated = await runsApi.get(run.id);
      setRun(updated.run);
    }
    // Phase 18: workspace context (best-effort; the core sections above
    // must render even when these are unavailable).
    personalizationApi
      .drafts(params.id)
      .then((pd) => setDrafts(pd.drafts))
      .catch(() => undefined);
    if (a.application.jobId) {
      api
        .matchForJob(a.application.jobId)
        .then((m) => setMatch(m.match))
        .catch(() => setMatch(null));
    }
  }

  useEffect(() => {
    refresh().catch(() => setError("API unreachable. Start it with npm run dev:api."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function act(label: string, fn: () => Promise<{ run: ApplicationRun }>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const r = await fn();
      setRun(r.run);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${label} failed.`);
    } finally {
      setBusy(false);
    }
  }

  function startTarget(): string | undefined {
    if (adapterId === "demo") return DEMO_TARGET;
    if (adapterId === "fixture-ats") return ATS_TARGET;
    return undefined;
  }

  const canSubmit = run?.status === "WAITING_FOR_SUBMISSION" && confirmSubmit && !busy;
  const activeAdapter = adapters.find((a) => a.adapterId === (run?.adapter ?? adapterId));
  const nextAction = app ? computeNextAction(params.id, app.status, drafts, runs) : null;

  /** Timeline category badge: derived from stored source/note only. */
  function eventCategory(source: string, note?: string | null): string {
    if (source === "GMAIL") return "Email";
    if (source === "BROWSER") return "Assistant";
    if (note?.startsWith("PERSONALIZATION_")) return "Personalization";
    if (source === "WORKER" || source === "SYSTEM") return "System";
    return "Application";
  }

  return (
    <div>
      <PageHeader
        title="Application"
        sub={app ? `${app.job?.title ?? "Job"} · ${app.job?.companyName ?? ""} · ${app.status.replace(/_/g, " ")}` : `ID: ${params.id}`}
      />
      {error ? <Card className="mb-4"><p className="text-sm">{error}</p></Card> : null}
      {notice ? <Card className="mb-4"><p className="text-sm">{notice}</p></Card> : null}

      <NextActionBanner action={nextAction} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Job &amp; match</h2>
          {match ? <Badge>{match.overallScore}/100 · {match.decision.replace(/_/g, " ")}</Badge> : null}
        </div>
        {app?.job ? (
          <p className="mt-2 text-sm">
            <Link href={`/jobs/${app.job.id}`} className="font-medium hover:underline">
              {app.job.title} · {app.job.companyName}
            </Link>
            <span style={{ color: "var(--muted)" }}> · status: {app.status.replace(/_/g, " ")}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>Loading job…</p>
        )}
        {!match && app?.job ? (
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            No match scored yet. <Link href={`/jobs/${app.job.id}`} className="font-medium hover:underline">Open the job</Link> to
            run matching.
          </p>
        ) : null}
      </Card>

      {app ? (
        <ResumeSection
          applicationId={params.id}
          current={app.resume ?? null}
          onChanged={(resume) => setApp({ ...app, resumeId: resume?.id ?? null, resume })}
        />
      ) : null}

      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Application Assistant</h2>
          {run ? <Badge>{run.status.replace(/_/g, " ")}</Badge> : null}
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Inspect → review answers → approve &amp; fill → you submit. Automation never submits without your explicit confirmation.
        </p>
        {activeAdapter ? (
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Adapter: {activeAdapter.displayName} · submission: {activeAdapter.submissionMode.replace(/_/g, " ")} ·
            capabilities: {activeAdapter.capabilities.join(", ")}
          </p>
        ) : null}
        {run ? (
          <>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              Browser: {browserLabel(run)}{run.sessionMode ? ` (${run.sessionMode})` : ""}
              {run.currentTitle ? ` · ${run.currentTitle}` : ""}
            </p>
            <ol className="mt-2 flex flex-wrap gap-1 text-xs">
              {PROGRESS.map((step, i) => (
                <li key={step}>
                  <Badge>{`${i <= progressIndex(run.status) ? "●" : "○"} ${step}`}</Badge>
                </li>
              ))}
            </ol>
          </>
        ) : null}
        {!run ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border p-2 text-sm"
              value={adapterId}
              onChange={(e) => setAdapterId(e.target.value)}>
              {adapters.length > 0
                ? adapters.map((a) => <option key={a.adapterId} value={a.adapterId}>{a.displayName}</option>)
                : ["demo", "fixture-ats", "generic"].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
              disabled={busy}
              onClick={() => act("Start", async () => {
                const created = await runsApi.create(params.id, { adapter: adapterId, targetUrl: startTarget() });
                return runsApi.start(created.run.id);
              })}>
              {busy ? "Starting…" : "Start Application"}
            </button>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 text-sm">
            {run.resumedFromRunId ? (
              <p style={{ color: "var(--muted)" }}>
                Recovered from a previous run · retries used: {run.retryCount}
                {run.recoveryReason ? ` · reason: ${run.recoveryReason}` : ""}
              </p>
            ) : null}
            {run.warnings.map((w) => (
              <p key={w} style={{ color: "var(--muted)" }}>• {w}</p>
            ))}
            {run.errorMessage ? <p>Error [{run.errorCode}]: {run.errorMessage}</p> : null}

            {run.errorCode === "LOGIN_REQUIRED" ? (
              <Card>
                <h3 className="font-semibold">Login required</h3>
                <p className="mt-1" style={{ color: "var(--muted)" }}>
                  This application needs you to sign in. Continue in the headed browser window
                  (JobPilot never asks for your password), then click Resume.
                </p>
                <button
                  className="mt-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
                  disabled={busy}
                  onClick={() => act("Resume", () => runsApi.resume(run.id))}>
                  I have signed in — Resume
                </button>
              </Card>
            ) : null}

            {run.errorCode === "CAPTCHA_DETECTED" ? (
              <Card>
                <h3 className="font-semibold">Verification required</h3>
                <p className="mt-1" style={{ color: "var(--muted)" }}>
                  This site presents a verification challenge. Complete it manually in the browser
                  if you choose — JobPilot will not bypass it.
                </p>
              </Card>
            ) : null}

            {run.errorCode === "SUBMISSION_STATUS_UNKNOWN" ? (
              <Card>
                <h3 className="font-semibold">Submission status could not be confirmed</h3>
                <p className="mt-1" style={{ color: "var(--muted)" }}>
                  Please verify the application manually before retrying. Automatic retry is disabled.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
                    disabled={busy}
                    onClick={() => act("Resolve", () => runsApi.resolve(run.id, "submitted"))}>
                    I verified: it was submitted
                  </button>
                  <button
                    className="rounded-lg border px-4 py-2 text-sm"
                    disabled={busy}
                    onClick={() => act("Resolve", () => runsApi.resolve(run.id, "not-submitted"))}>
                    It was not submitted
                  </button>
                </div>
              </Card>
            ) : null}

            {run.answers.length > 0 ? (
              <div>
                <h3 className="font-semibold">Answers</h3>
                <div className="mt-2 grid gap-2">
                  {run.answers.map((a) => (
                    <div key={a.fieldId} className="rounded-lg border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{a.label || a.fieldId}{a.required ? " *" : ""}</span>
                        <Badge>{a.status}</Badge>
                      </div>
                      <p style={{ color: "var(--muted)" }}>maps to {a.mapping} · source: {a.source}</p>
                      {a.mapping === "UNSUPPORTED_SENSITIVE_FIELD" ? (
                        <p>Left untouched for your safety.</p>
                      ) : (
                        <textarea
                          className="mt-1 w-full rounded-lg border p-2"
                          rows={2}
                          defaultValue={a.proposedValue}
                          disabled={run.status !== "WAITING_FOR_REVIEW" || busy}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [a.fieldId]: e.target.value }))}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {run.status === "WAITING_FOR_REVIEW" ? (
                <button
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
                  disabled={busy}
                  onClick={() => act("Approve", () =>
                    runsApi.approve(run.id, run.answers
                      .filter((a) => a.mapping !== "UNSUPPORTED_SENSITIVE_FIELD")
                      .map((a) => edits[a.fieldId] !== undefined && edits[a.fieldId] !== a.proposedValue
                        ? { fieldId: a.fieldId, value: edits[a.fieldId] }
                        : { fieldId: a.fieldId })))}>
                  Approve &amp; Fill
                </button>
              ) : null}
              {run.status === "READY_TO_FILL" ? (
                <button
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
                  disabled={busy}
                  onClick={() => act("Fill", () => runsApi.fill(run.id))}>
                  Fill approved fields
                </button>
              ) : null}
              {["BLOCKED", "WAITING_FOR_REVIEW", "READY_TO_FILL", "WAITING_FOR_SUBMISSION", "FAILED"].includes(run.status) ? (
                <button
                  className="rounded-lg border px-4 py-2 text-sm"
                  disabled={busy}
                  onClick={() => act("Resume", () => runsApi.resume(run.id))}>
                  Resume run
                </button>
              ) : null}
              {run.status === "WAITING_FOR_SUBMISSION" ? (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={confirmSubmit} onChange={(e) => setConfirmSubmit(e.target.checked)} />
                  I have reviewed the application and want JobPilot to submit it.
                </label>
              ) : null}
              <button
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black disabled:opacity-40"
                disabled={!canSubmit}
                title={run.status === "WAITING_FOR_SUBMISSION" ? "Confirm above to enable" : "Available after filling (WAITING_FOR_SUBMISSION)"}
                onClick={() => act("Submit", () => runsApi.submit(run.id))}>
                Submit Application
              </button>
              {!["SUBMITTED", "CANCELLED", "FAILED"].includes(run.status) ? (
                <button className="rounded-lg border px-4 py-2 text-sm" disabled={busy} onClick={() => act("Cancel", () => runsApi.cancel(run.id))}>
                  Cancel run
                </button>
              ) : null}
            </div>
            {run.status === "WAITING_FOR_SUBMISSION" ? (
              <p style={{ color: "var(--muted)" }}>
                Filled {run.filledFields.length} field(s). Review the form, then confirm and submit.
              </p>
            ) : null}
          </div>
        )}
      </Card>

      <div id="personalization">
        <PersonalizationSection applicationId={params.id} />
      </div>

      <ApprovedContentSection applicationId={params.id} />

      {runs.length > 0 ? (
        <Card>
          <h2 className="font-semibold">Run history</h2>
          <ul className="mt-2 grid gap-2 text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <button className="underline" onClick={() => setRun(r)}>
                  {new Date(r.createdAt).toLocaleString()}
                </button>
                <span>· {r.adapter} · {r.status.replace(/_/g, " ")} · {r.currentStep}</span>
                {r.errorCode ? <span>· [{r.errorCode}]</span> : null}
                {r.resumedFromRunId ? <span>· recovered (retries: {r.retryCount})</span> : r.retryCount > 0 ? <span>· resumed ×{r.retryCount}</span> : null}
                {r.submissionConfirmedAt ? <span>· submitted {new Date(r.submissionConfirmedAt).toLocaleString()}</span> : null}
                {["FAILED", "BLOCKED", "CANCELLED"].includes(r.status) ? (
                  <button
                    className="rounded-lg border px-2 py-1 text-xs"
                    disabled={busy}
                    onClick={() => act("Recover", async () => {
                      const recovered = await runsApi.recover(r.id, "User-requested recovery from history");
                      return runsApi.start(recovered.run.id);
                    })}>
                    Recover into new run
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h2 className="font-semibold">Timeline</h2>
        {!app ? (
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>Loading…</p>
        ) : (
          (() => {
            const timeline = [
              ...app.events.map((e) => ({
                key: `event-${e.id}`,
                title: e.newStatus.replace(/_/g, " "),
                sub: `${e.source}${e.note ? ` — ${e.note.slice(0, 200)}` : ""}`,
                at: e.createdAt,
                category: eventCategory(e.source, e.note),
              })),
              ...(app.emails ?? []).map((m) => ({
                key: `email-${m.id}`,
                title: `Email: ${m.subject || "(no subject)"}`,
                sub: `${m.fromEmail} · ${m.classification.replace(/_/g, " ")}`,
                at: m.receivedAt,
                category: "Email",
              })),
            ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
            return timeline.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>No activity yet.</p>
            ) : (
              <ol className="mt-3 grid gap-3">
                {timeline.map((t) => (
                  <li key={t.key} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t.title}</span>
                      <Badge>{t.category}</Badge>
                    </div>
                    <div style={{ color: "var(--muted)" }}>{t.sub}</div>
                    <div style={{ color: "var(--muted)" }}>{new Date(t.at).toLocaleString()}</div>
                  </li>
                ))}
              </ol>
            );
          })()
        )}
      </Card>
    </div>
  );
}
