"use client";

import { useEffect, useState } from "react";
import {
  autopilotApi,
  discoveryApi,
  resumesApi,
  type AutopilotSummary,
  type DiscoveryConfig,
  type Resume,
} from "../../lib/api";
import { PageHeader, Card, Badge } from "../../components/ui";

const EMPTY: DiscoveryConfig = {
  enabled: true,
  targetRoles: [],
  targetLocations: [],
  remoteOnly: false,
  minimumSalary: null,
  employmentTypes: [],
  experienceLevels: [],
  preferredSkills: [],
  excludedKeywords: [],
  sourceKeys: ["arbeitnow"],
  boards: [],
  maxJobsPerRun: 20,
  scheduleEnabled: false,
  scheduleIntervalHours: 24,
  autopilotEnabled: false,
  autopilotMinScore: 80,
  autopilotMaxPerRun: 3,
  autopilotResumeId: null,
};

function statusTone(status: string): string {
  if (status === "filled") return "var(--fg)";
  if (status === "failed" || status === "blocked") return "var(--danger)";
  return "var(--muted)";
}

export default function AutopilotPage() {
  const [config, setConfig] = useState<DiscoveryConfig>(EMPTY);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [summary, setSummary] = useState<AutopilotSummary | null>(null);
  const [recent, setRecent] = useState<{ runId: string; applicationId: string; title: string; companyName: string; status: string; adapter: string }[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await discoveryApi.config();
      if (r.config) setConfig({ ...EMPTY, ...r.config });
    } catch {
      setError("API unreachable. Start it with npm run dev:api.");
      return;
    }
    try {
      const r = await resumesApi.list();
      setResumes(r.resumes);
    } catch {
      // Resume list is optional; autopilot falls back to the active resume.
    }
    try {
      const st = await autopilotApi.status();
      if (st.autopilot?.lastSummary) setSummary(st.autopilot.lastSummary);
      setRecent(st.recentRuns);
    } catch {
      // Status is optional.
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function set<K extends keyof DiscoveryConfig>(key: K, value: DiscoveryConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const r = await discoveryApi.save(config);
      setConfig({ ...EMPTY, ...r.config });
      setNotice("Autopilot settings saved.");
    } catch {
      setError("Could not save autopilot settings. Check the bounds and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const r = await autopilotApi.run({
        limit: config.autopilotMaxPerRun,
        minScore: config.autopilotMinScore,
      });
      setSummary(r.autopilot);
      const st = await autopilotApi.status();
      setRecent(st.recentRuns);
      setNotice(
        `Autopilot finished: ${r.autopilot.filled} filled, ${r.autopilot.needsInput} need input, ${r.autopilot.skipped} skipped, ${r.autopilot.failed} blocked/failed.`,
      );
    } catch {
      setError("Could not run autopilot. Enable it, save, and make sure discovery/matching ran first.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Autopilot"
        sub="Prepare applications automatically. You review the filled form and confirm submission yourself."
      />
      {error ? <Card className="mb-4"><p className="text-sm" data-testid="autopilot-error">{error}</p></Card> : null}
      {notice ? <Card className="mb-4"><p className="text-sm" data-testid="autopilot-notice">{notice}</p></Card> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Settings</h2>
          <div className="mt-3 grid gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={config.autopilotEnabled} onChange={(e) => set("autopilotEnabled", e.target.checked)} />
              Enable autopilot
            </label>
            <label className="grid gap-1">
              Minimum match score (0–100)
              <input
                type="number"
                min={0}
                max={100}
                className="rounded-lg border p-2"
                value={config.autopilotMinScore}
                onChange={(e) => set("autopilotMinScore", Number(e.target.value))}
              />
            </label>
            <label className="grid gap-1">
              Max applications per run (1–10)
              <input
                type="number"
                min={1}
                max={10}
                className="rounded-lg border p-2"
                value={config.autopilotMaxPerRun}
                onChange={(e) => set("autopilotMaxPerRun", Number(e.target.value))}
              />
            </label>
            <label className="grid gap-1">
              Resume to attach
              <select
                className="rounded-lg border p-2"
                value={config.autopilotResumeId ?? ""}
                onChange={(e) => set("autopilotResumeId", e.target.value === "" ? null : e.target.value)}
              >
                <option value="">Active resume (automatic)</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.isActive ? " (active)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Autopilot uses jobs already discovered and matched above your score threshold.
              It fills the form and stops at “waiting for submission”. File uploads (resume
              attachment) and the final submit stay manual.
            </p>
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={busy}
                data-testid="autopilot-save"
                className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
                style={{ borderColor: "var(--border)" }}
              >
                Save settings
              </button>
              <button
                onClick={run}
                disabled={busy || !config.autopilotEnabled}
                data-testid="autopilot-run"
                className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
                style={{ borderColor: "var(--border)" }}
              >
                {busy ? "Preparing…" : "Run autopilot"}
              </button>
            </div>
            {busy ? (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Preparing applications can take a minute per job while the browser opens and fills each form.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold">Last autopilot run</h2>
          {summary ? (
            <div className="mt-2 text-sm">
              <p>
                Evaluated {summary.evaluated} · Filled <Badge>{summary.filled}</Badge> · Need input{" "}
                <Badge>{summary.needsInput}</Badge> · Skipped <Badge>{summary.skipped}</Badge> · Blocked/failed{" "}
                <Badge>{summary.failed}</Badge>
              </p>
              <ul className="mt-3 grid gap-2" data-testid="autopilot-items">
                {summary.items.map((item) => (
                  <li key={item.jobId} className="rounded-lg border p-2 text-xs" style={{ borderColor: "var(--border)" }}>
                    <div className="font-medium">
                      {item.title} · {item.companyName}
                    </div>
                    <div style={{ color: "var(--muted)" }}>
                      score {item.score} · {item.adapter ?? "no adapter"} ·{" "}
                      <span style={{ color: statusTone(item.status) }}>{item.status}</span>
                    </div>
                    {item.message ? <div className="mt-1">{item.message}</div> : null}
                    {item.applicationId ? (
                      <a className="mt-1 inline-block font-medium hover:underline" href={`/applications/${item.applicationId}`}>
                        Open application
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-sm">No autopilot run yet.</p>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="font-semibold">Recent prepared runs</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm">No application runs yet.</p>
        ) : (
          <ul className="mt-2 grid gap-2 text-sm">
            {recent.map((r) => (
              <li key={r.runId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
                <span className="min-w-0">
                  <span className="font-medium">{r.title}</span> · {r.companyName}
                  <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                    {r.adapter}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs">
                  <Badge>{r.status}</Badge>
                  <a className="font-medium hover:underline" href={`/applications/${r.applicationId}`}>
                    Open
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
