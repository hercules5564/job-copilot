"use client";

import { useEffect, useState } from "react";
import { discoveryApi, signalsApi, api, type DiscoveryConfig, type HiringSignal } from "../../lib/api";
import { SuggestInput } from "../../components/suggest-input";
import { EMPLOYMENT_TYPES, LOCATIONS, ROLES, SKILLS } from "../../lib/reference";
import { PageHeader, Card, Badge } from "../../components/ui";

/**
 * Phase 10B — minimal discovery surface (backend infrastructure UI).
 * Configure sources → save → run → watch status → review hiring signals.
 * No redesign of /jobs; no AI dashboard.
 */

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

const CSV_KEYS = [
  "targetRoles",
  "targetLocations",
  "preferredSkills",
  "excludedKeywords",
  "employmentTypes",
  "boards",
] as const;

type CsvKey = (typeof CSV_KEYS)[number];

function csv(value: string[]): string {
  return value.join(", ");
}

function uncsv(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function csvStateFrom(config: DiscoveryConfig): Record<CsvKey, string> {
  return {
    targetRoles: csv(config.targetRoles),
    targetLocations: csv(config.targetLocations),
    preferredSkills: csv(config.preferredSkills),
    excludedKeywords: csv(config.excludedKeywords),
    employmentTypes: csv(config.employmentTypes),
    boards: csv(config.boards),
  };
}

export default function DiscoveryPage() {
  const [config, setConfig] = useState<DiscoveryConfig>(EMPTY);
  // Raw CSV text is kept separately so typing spaces/commas never gets
  // re-parsed and trimmed mid-keystroke. Arrays are rebuilt only on save.
  const [csvFields, setCsvFields] = useState<Record<CsvKey, string>>(csvStateFrom(EMPTY));
  const [sources, setSources] = useState<{ id: string; name: string; available: boolean; mock: boolean }[]>([]);
  const [status, setStatus] = useState<{ lastRunAt?: string | null; lastStatus?: string | null; lastSummary?: Record<string, number | boolean | string> | null } | null>(null);
  const [recent, setRecent] = useState<{ jobId: string; queue: string; state: string }[]>([]);
  const [signals, setSignals] = useState<HiringSignal[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function applyConfig(next: DiscoveryConfig) {
    setConfig(next);
    setCsvFields(csvStateFrom(next));
  }

  async function load() {
    try {
      const r = await discoveryApi.config();
      if (r.config) applyConfig({ ...EMPTY, ...r.config });
    } catch {
      setError("API unreachable. Start it with npm run dev:api.");
      return;
    }
    try {
      const s = await api.jobSources();
      setSources(s.sources);
    } catch { /* optional */ }
    try {
      const st = await discoveryApi.status();
      if (st.config) setStatus(st.config);
      setRecent(st.recentJobs);
    } catch { /* optional */ }
    try {
      const sig = await signalsApi.list();
      setSignals(sig.signals);
    } catch { /* optional */ }
  }

  useEffect(() => { void load(); }, []);

  function set<K extends keyof DiscoveryConfig>(key: K, value: DiscoveryConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const payload: DiscoveryConfig = {
        ...config,
        targetRoles: uncsv(csvFields.targetRoles),
        targetLocations: uncsv(csvFields.targetLocations),
        preferredSkills: uncsv(csvFields.preferredSkills),
        excludedKeywords: uncsv(csvFields.excludedKeywords),
        employmentTypes: uncsv(csvFields.employmentTypes),
        boards: uncsv(csvFields.boards).map((s) => s.toLowerCase()),
      };
      const r = await discoveryApi.save(payload);
      applyConfig({ ...EMPTY, ...r.config });
      setNotice(`Configuration saved (schedule: ${r.schedule}).`);
    } catch {
      setError("Could not save configuration. Check bounds and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const r = await discoveryApi.run({});
      setNotice(`Discovery queued: ${r.jobId} (${r.queue}). Refresh status to follow it.`);
      const st = await discoveryApi.status();
      if (st.config) setStatus(st.config);
      setRecent(st.recentJobs);
    } catch {
      setError("Could not start discovery. Save a valid configuration first.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSource(id: string) {
    setConfig((prev) => ({
      ...prev,
      sourceKeys: prev.sourceKeys.includes(id)
        ? prev.sourceKeys.filter((s) => s !== id)
        : [...prev.sourceKeys, id].slice(0, 5),
    }));
  }

  return (
    <div>
      <PageHeader title="Discovery" sub="Automated job discovery over permitted public sources." />
      {error ? <Card><p className="text-sm" data-testid="discovery-error">{error}</p></Card> : null}
      {notice ? <Card><p className="text-sm" data-testid="discovery-notice">{notice}</p></Card> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Configuration</h2>
          <div className="mt-3 grid gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={config.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Enabled
            </label>
            <label className="grid gap-1">Target roles (comma-separated, max 20)
              <SuggestInput value={csvFields.targetRoles} onChange={(v) => setCsvFields((prev) => ({ ...prev, targetRoles: v }))} options={ROLES} placeholder="Backend Engineer, Frontend Engineer" />
            </label>
            <label className="grid gap-1">Target locations (comma-separated, max 20)
              <SuggestInput value={csvFields.targetLocations} onChange={(v) => setCsvFields((prev) => ({ ...prev, targetLocations: v }))} options={LOCATIONS} placeholder="Berlin, Remote" />
            </label>
            <label className="grid gap-1">Preferred skills (comma-separated, max 50)
              <SuggestInput value={csvFields.preferredSkills} onChange={(v) => setCsvFields((prev) => ({ ...prev, preferredSkills: v }))} options={SKILLS} placeholder="TypeScript, React" />
            </label>
            <label className="grid gap-1">Excluded keywords (comma-separated, max 50)
              <input className="rounded-lg border p-2" value={csvFields.excludedKeywords} onChange={(e) => setCsvFields((prev) => ({ ...prev, excludedKeywords: e.target.value }))} placeholder="senior, internship" />
            </label>
            <label className="grid gap-1">Employment types (comma-separated)
              <SuggestInput value={csvFields.employmentTypes} onChange={(v) => setCsvFields((prev) => ({ ...prev, employmentTypes: v }))} options={EMPLOYMENT_TYPES} placeholder="Full-time" />
            </label>
            <label className="grid gap-1">Board tokens — Greenhouse / Lever / Ashby (comma-separated, max 5)
              <input className="rounded-lg border p-2" value={csvFields.boards} onChange={(e) => setCsvFields((prev) => ({ ...prev, boards: e.target.value }))} placeholder="airbnb, stripe" />
            </label>
            <div className="flex gap-3">
              <label className="grid flex-1 gap-1">Max jobs/run (1–50)
                <input type="number" min={1} max={50} className="rounded-lg border p-2" value={config.maxJobsPerRun} onChange={(e) => set("maxJobsPerRun", Number(e.target.value))} />
              </label>
              <label className="grid flex-1 gap-1">Min salary (optional)
                <input type="number" min={0} className="rounded-lg border p-2" value={config.minimumSalary ?? ""} onChange={(e) => set("minimumSalary", e.target.value === "" ? null : Number(e.target.value))} />
              </label>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={config.remoteOnly} onChange={(e) => set("remoteOnly", e.target.checked)} /> Remote only
            </label>
            <div>
              <div className="mb-1 font-medium">Sources (max 5 total, max 3 per run)</div>
              <div className="flex flex-wrap gap-2">
                {sources.map((s) => (
                  <label key={s.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${s.available ? "" : "opacity-50"}`}>
                    <input type="checkbox" checked={config.sourceKeys.includes(s.id)} disabled={!s.available} onChange={() => toggleSource(s.id)} />
                    {s.name}{s.mock ? " (mock)" : ""}{s.available ? "" : " (not configured)"}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={config.scheduleEnabled} onChange={(e) => set("scheduleEnabled", e.target.checked)} /> Scheduled discovery
            </label>
            <label className="grid gap-1">Every N hours (1–168)
              <input type="number" min={1} max={168} className="rounded-lg border p-2" value={config.scheduleIntervalHours} onChange={(e) => set("scheduleIntervalHours", Number(e.target.value))} />
            </label>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} data-testid="discovery-save" className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ borderColor: "var(--border)" }}>
                Save
              </button>
              <button onClick={run} disabled={busy} data-testid="discovery-run" className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ borderColor: "var(--border)" }}>
                Run now
              </button>
            </div>
          </div>
        </Card>
        <div className="grid content-start gap-4">
          <Card>
            <h2 className="font-semibold">Last run</h2>
            {status ? (
              <div className="mt-2 text-sm">
                <p>Status: <Badge>{status.lastStatus ?? "never ran"}</Badge></p>
                {status.lastRunAt ? <p className="mt-1">At: {status.lastRunAt}</p> : null}
                {status.lastSummary ? (
                  <pre className="mt-2 overflow-auto rounded-lg border p-2 text-xs" data-testid="discovery-summary">
                    {JSON.stringify(status.lastSummary, null, 2)}
                  </pre>
                ) : null}
              </div>
            ) : <p className="mt-2 text-sm">No runs yet.</p>}
            {recent.length > 0 ? (
              <div className="mt-3 text-sm">
                <div className="font-medium">Recent jobs</div>
                <ul className="mt-1 grid gap-1">
                  {recent.slice(0, 10).map((j) => (
                    <li key={j.jobId} className="truncate text-xs">
                      <Badge>{j.state}</Badge> {j.queue} · {j.jobId}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
          <Card>
            <h2 className="font-semibold">Hiring signals</h2>
            {signals.length === 0 ? (
              <p className="mt-2 text-sm">No signals yet. Run discovery to collect public postings as evidence.</p>
            ) : (
              <ul className="mt-2 grid gap-2 text-sm">
                {signals.slice(0, 20).map((s) => (
                  <li key={s.id} className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      {s.companyName} · {s.type} · confidence {s.confidence}
                    </div>
                    {s.evidenceSummary ? <div className="mt-1 text-xs">{s.evidenceSummary}</div> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
