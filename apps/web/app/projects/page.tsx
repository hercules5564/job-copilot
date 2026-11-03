"use client";

import { useEffect, useState } from "react";
import { projectsApi, ApiError, type Project } from "../../lib/api";
import { PageHeader, Card, Badge } from "../../components/ui";

/**
 * Phase 12A — project library over the existing CRUD API.
 * Fields map 1:1 to the backend contract (name/description required;
 * dates validated server-side as parseable dates).
 */

interface ProjectForm {
  name: string;
  description: string;
  technologies: string;
  role: string;
  contributions: string;
  achievements: string;
  githubUrl: string;
  liveUrl: string;
  startDate: string;
  endDate: string;
}

const EMPTY_FORM: ProjectForm = {
  name: "",
  description: "",
  technologies: "",
  role: "",
  contributions: "",
  achievements: "",
  githubUrl: "",
  liveUrl: "",
  startDate: "",
  endDate: "",
};

function toForm(p: Project): ProjectForm {
  const date = (v?: string | null) => (v ? v.slice(0, 10) : "");
  return {
    name: p.name,
    description: p.description,
    technologies: (p.technologies ?? []).join(", "),
    role: p.role ?? "",
    contributions: p.contributions ?? "",
    achievements: p.achievements ?? "",
    githubUrl: p.githubUrl ?? "",
    liveUrl: p.liveUrl ?? "",
    startDate: date(p.startDate),
    endDate: date(p.endDate),
  };
}

function toBody(f: ProjectForm): Record<string, unknown> {
  const uncsv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const opt = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    name: f.name.trim(),
    description: f.description.trim(),
    technologies: uncsv(f.technologies),
    role: opt(f.role),
    contributions: opt(f.contributions),
    achievements: opt(f.achievements),
    githubUrl: opt(f.githubUrl),
    liveUrl: opt(f.liveUrl),
    startDate: opt(f.startDate),
    endDate: opt(f.endDate),
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "rounded-lg border p-2 text-sm";

function ProjectFormFields({ form, set }: { form: ProjectForm; set: (f: ProjectForm) => void }) {
  const setK = (key: keyof ProjectForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    set({ ...form, [key]: e.target.value });
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name *">
          <input id="projectName" className={inputCls} value={form.name} onChange={setK("name")} placeholder="Realtime API gateway" maxLength={200} required />
        </Field>
        <Field label="Role">
          <input id="projectRole" className={inputCls} value={form.role} onChange={setK("role")} placeholder="Backend Engineer" maxLength={200} />
        </Field>
      </div>
      <Field label="Description *">
        <textarea id="projectDescription" className={inputCls} rows={3} value={form.description} onChange={setK("description")} placeholder="What it does and why it matters." maxLength={5000} required />
      </Field>
      <Field label="Technologies (comma-separated)">
        <input id="projectTechnologies" className={inputCls} value={form.technologies} onChange={setK("technologies")} placeholder="TypeScript, PostgreSQL, Redis" />
      </Field>
      <Field label="Contributions">
        <textarea id="projectContributions" className={inputCls} rows={2} value={form.contributions} onChange={setK("contributions")} placeholder="What you personally built." maxLength={5000} />
      </Field>
      <Field label="Achievements">
        <textarea id="projectAchievements" className={inputCls} rows={2} value={form.achievements} onChange={setK("achievements")} placeholder="Latency cut by 40%, 99.9% uptime." maxLength={5000} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="GitHub URL">
          <input id="projectGithubUrl" className={inputCls} inputMode="url" value={form.githubUrl} onChange={setK("githubUrl")} placeholder="https://github.com/you/repo" />
        </Field>
        <Field label="Live URL">
          <input id="projectLiveUrl" className={inputCls} inputMode="url" value={form.liveUrl} onChange={setK("liveUrl")} placeholder="https://your-site.dev" />
        </Field>
        <Field label="Start date">
          <input id="projectStartDate" className={inputCls} type="date" value={form.startDate} onChange={setK("startDate")} />
        </Field>
        <Field label="End date">
          <input id="projectEndDate" className={inputCls} type="date" value={form.endDate} onChange={setK("endDate")} />
        </Field>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<ProjectForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProjectForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function load() {
    try {
      const r = await projectsApi.list();
      setProjects(r.projects);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        window.location.href = "/login?expired=1";
        return;
      }
      setError("Could not load projects. Start the API with npm run dev:api.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function fail(message: string) {
    setError(message);
    setNotice("");
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!createForm.name.trim() || !createForm.description.trim()) {
      fail("Name and description are required.");
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await projectsApi.create(toBody(createForm));
      setCreateForm(EMPTY_FORM);
      setShowCreate(false);
      await load();
      setNotice("Project created.");
    } catch (err) {
      fail(err instanceof ApiError && err.status === 400 ? "Invalid project data (check URLs and dates)." : "Could not create the project.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(p: Project) {
    setEditingId(p.id);
    setEditForm(toForm(p));
    setError("");
    setNotice("");
    setConfirmDeleteId(null);
  }

  async function saveEdit(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (busy) return;
    if (!editForm.name.trim() || !editForm.description.trim()) {
      fail("Name and description are required.");
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await projectsApi.update(id, toBody(editForm));
      setEditingId(null);
      await load();
      setNotice("Project updated.");
    } catch (err) {
      fail(err instanceof ApiError && err.status === 400 ? "Invalid project data (check URLs and dates)." : "Could not update the project.");
    } finally {
      setBusy(false);
    }
  }

  async function destroy(id: string) {
    if (busy) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await projectsApi.remove(id);
      setConfirmDeleteId(null);
      if (editingId === id) setEditingId(null);
      await load();
      setNotice("Project deleted.");
    } catch {
      fail("Could not delete the project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Projects" sub="Project library used for match recommendations." />
      {error ? <Card className="mb-4"><p className="text-sm" data-testid="projects-error">{error}</p></Card> : null}
      {notice ? <Card className="mb-4"><p className="text-sm" data-testid="projects-notice">{notice}</p></Card> : null}
      <div className="mb-4">
        <button
          onClick={() => setShowCreate((v) => !v)}
          data-testid="projects-new"
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--border)" }}
        >
          {showCreate ? "Cancel" : "New project"}
        </button>
      </div>
      {showCreate ? (
        <Card className="mb-4">
          <h2 className="font-semibold">New project</h2>
          <form onSubmit={create} className="mt-3">
            <ProjectFormFields form={createForm} set={setCreateForm} />
            <button type="submit" disabled={busy} data-testid="projects-create" className="mt-3 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ borderColor: "var(--border)" }}>
              {busy ? "Creating…" : "Create project"}
            </button>
          </form>
        </Card>
      ) : null}
      {projects === null ? (
        <Card><p className="text-sm" data-testid="projects-loading">Loading projects…</p></Card>
      ) : projects.length === 0 ? (
        <Card><p className="text-sm" data-testid="projects-empty">No projects yet. Create your first project to feed match recommendations.</p></Card>
      ) : (
        <div className="grid gap-3" data-testid="projects-list">
          {projects.map((p) => (
            <Card key={p.id}>
              {editingId === p.id ? (
                <form onSubmit={(e) => saveEdit(e, p.id)}>
                  <ProjectFormFields form={editForm} set={setEditForm} />
                  <div className="mt-3 flex gap-2">
                    <button type="submit" disabled={busy} data-testid={`projects-save-${p.id}`} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ borderColor: "var(--border)" }}>
                      {busy ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{p.name}</div>
                      {p.role ? <div className="text-sm" style={{ color: "var(--muted)" }}>{p.role}</div> : null}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(p)} data-testid={`projects-edit-${p.id}`} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>
                        Edit
                      </button>
                      {confirmDeleteId === p.id ? (
                        <span className="flex items-center gap-2 text-xs">
                          Delete this project?
                          <button onClick={() => destroy(p.id)} disabled={busy} data-testid={`projects-confirm-delete-${p.id}`} className="rounded-lg border px-3 py-1.5 font-medium disabled:opacity-60" style={{ borderColor: "var(--border)" }}>
                            Yes, delete
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }}>
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(p.id)} data-testid={`projects-delete-${p.id}`} aria-label={`Delete ${p.name}`} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-sm">{p.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(p.technologies ?? []).map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                    {p.startDate ? <Badge>{p.startDate.slice(0, 10)}{p.endDate ? ` → ${p.endDate.slice(0, 10)}` : " → now"}</Badge> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs" style={{ color: "var(--muted)" }}>
                    {p.githubUrl ? <a href={p.githubUrl} target="_blank" rel="noreferrer" className="hover:underline">GitHub</a> : null}
                    {p.liveUrl ? <a href={p.liveUrl} target="_blank" rel="noreferrer" className="hover:underline">Live site</a> : null}
                  </div>
                  {p.contributions ? <p className="mt-2 text-xs"><span className="font-medium">Contributions: </span>{p.contributions}</p> : null}
                  {p.achievements ? <p className="mt-1 text-xs"><span className="font-medium">Achievements: </span>{p.achievements}</p> : null}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
