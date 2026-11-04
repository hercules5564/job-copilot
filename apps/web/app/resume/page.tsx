"use client";

import { useEffect, useState } from "react";
import { resumesApi, ApiError, type Resume, type ResumeVersion } from "../../lib/api";
import { SuggestInput } from "../../components/suggest-input";
import { ROLES } from "../../lib/reference";
import { PageHeader, Card, Badge } from "../../components/ui";

/**
 * Phase 12A — resume management over the existing metadata/content CRUD.
 * Supported: list/create/edit/delete, active flag, version history
 * (auto-snapshots on edit, read-only). NOT supported and not shown:
 * parsing, AI generation, file uploads, version restore.
 */

interface ResumeForm {
  name: string;
  targetRoles: string;
  isActive: boolean;
  fileUrl: string;
  parsedText: string;
}

const EMPTY_FORM: ResumeForm = { name: "", targetRoles: "", isActive: true, fileUrl: "", parsedText: "" };

function toForm(r: Resume): ResumeForm {
  return {
    name: r.name,
    targetRoles: (r.targetRoles ?? []).join(", "),
    isActive: r.isActive,
    fileUrl: r.fileUrl ?? "",
    parsedText: r.parsedText ?? "",
  };
}

function toBody(f: ResumeForm): Record<string, unknown> {
  const opt = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    name: f.name.trim(),
    targetRoles: f.targetRoles.split(",").map((s) => s.trim()).filter(Boolean),
    isActive: f.isActive,
    fileUrl: opt(f.fileUrl),
    parsedText: opt(f.parsedText),
  };
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span style={{ color: "var(--muted)" }}>{hint}</span> : null}
    </label>
  );
}

const inputCls = "rounded-lg border p-2 text-sm";

function FormFields({ form, set, prefix }: { form: ResumeForm; set: (f: ResumeForm) => void; prefix: string }) {
  const setK = (key: keyof ResumeForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value;
    set({ ...form, [key]: v });
  };
  return (
    <div className="grid gap-3">
      <Field label="Name *">
        <input id={`${prefix}Name`} className={inputCls} value={form.name} onChange={setK("name")} placeholder="Full Stack Resume" maxLength={200} required />
      </Field>
      <Field label="Target roles" hint="Comma-separated. Start typing for suggestions.">
        <SuggestInput id={`${prefix}Roles`} value={form.targetRoles} onChange={(v) => set({ ...form, targetRoles: v })} options={ROLES} placeholder="Backend Engineer, Platform Engineer" />
      </Field>
      <Field label="File URL" hint="Link to an already-hosted file. No upload here.">
        <input id={`${prefix}FileUrl`} className={inputCls} inputMode="url" value={form.fileUrl} onChange={setK("fileUrl")} placeholder="https://example.com/resume.pdf" maxLength={2000} />
      </Field>
      <Field label="Resume text" hint="Paste plain text. Each edit snapshots the previous content as a version.">
        <textarea id={`${prefix}Text`} className={inputCls} rows={6} value={form.parsedText} onChange={setK("parsedText")} placeholder="Experience, skills, education…" maxLength={100000} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input id={`${prefix}Active`} type="checkbox" checked={form.isActive} onChange={setK("isActive")} />
        <span className="font-medium">Active</span>
      </label>
    </div>
  );
}

export default function ResumePage() {
  const [resumes, setResumes] = useState<Resume[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<ResumeForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ResumeForm>(EMPTY_FORM);
  const [versions, setVersions] = useState<Record<string, ResumeVersion[]>>({});
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function load() {
    try {
      const r = await resumesApi.list();
      setResumes(r.resumes);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        window.location.href = "/login?expired=1";
        return;
      }
      setError("Could not load resumes. Start the API with npm run dev:api.");
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
    if (!createForm.name.trim()) {
      fail("Resume name is required.");
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await resumesApi.create(toBody(createForm));
      setCreateForm(EMPTY_FORM);
      setShowCreate(false);
      await load();
      setNotice("Resume created.");
    } catch (err) {
      fail(err instanceof ApiError && err.status === 400 ? "Invalid resume data (check the file URL format)." : "Could not create the resume.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(r: Resume) {
    setEditingId(r.id);
    setEditForm(toForm(r));
    setError("");
    setNotice("");
    setConfirmDeleteId(null);
  }

  async function saveEdit(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (busy) return;
    if (!editForm.name.trim()) {
      fail("Resume name is required.");
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await resumesApi.update(id, toBody(editForm));
      setEditingId(null);
      await load();
      setNotice("Resume updated. The previous content was snapshotted as a new version.");
    } catch (err) {
      fail(err instanceof ApiError && err.status === 400 ? "Invalid resume data (check the file URL format)." : "Could not update the resume.");
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
      await resumesApi.remove(id);
      setConfirmDeleteId(null);
      if (editingId === id) setEditingId(null);
      await load();
      setNotice("Resume deleted.");
    } catch {
      fail("Could not delete the resume.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleVersions(id: string) {
    if (versionsFor === id) {
      setVersionsFor(null);
      return;
    }
    setError("");
    try {
      const r = await resumesApi.versions(id);
      setVersions((prev) => ({ ...prev, [id]: r.versions }));
      setVersionsFor(id);
    } catch {
      fail("Could not load version history.");
    }
  }

  return (
    <div>
      <PageHeader title="Resumes" sub="Manage resume records. Text and metadata only — no parsing or uploads." />
      {error ? <Card className="mb-4"><p className="text-sm" data-testid="resumes-error">{error}</p></Card> : null}
      {notice ? <Card className="mb-4"><p className="text-sm" data-testid="resumes-notice">{notice}</p></Card> : null}
      <div className="mb-4">
        <button
          onClick={() => setShowCreate((v) => !v)}
          data-testid="resumes-new"
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--border)" }}
        >
          {showCreate ? "Cancel" : "New resume"}
        </button>
      </div>
      {showCreate ? (
        <Card className="mb-4">
          <h2 className="font-semibold">New resume</h2>
          <form onSubmit={create} className="mt-3">
            <FormFields form={createForm} set={setCreateForm} prefix="newResume" />
            <button type="submit" disabled={busy} data-testid="resumes-create" className="mt-3 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ borderColor: "var(--border)" }}>
              {busy ? "Creating…" : "Create resume"}
            </button>
          </form>
        </Card>
      ) : null}
      {resumes === null ? (
        <Card><p className="text-sm" data-testid="resumes-loading">Loading resumes…</p></Card>
      ) : resumes.length === 0 ? (
        <Card><p className="text-sm" data-testid="resumes-empty">No resumes yet. Create one to attach to future applications.</p></Card>
      ) : (
        <div className="grid gap-3" data-testid="resumes-list">
          {resumes.map((r) => (
            <Card key={r.id}>
              {editingId === r.id ? (
                <form onSubmit={(e) => saveEdit(e, r.id)}>
                  <FormFields form={editForm} set={setEditForm} prefix={`editResume-${r.id}`} />
                  <div className="mt-3 flex gap-2">
                    <button type="submit" disabled={busy} data-testid={`resumes-save-${r.id}`} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ borderColor: "var(--border)" }}>
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
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{r.name}</span>
                        {r.isActive ? <Badge>Active</Badge> : null}
                      </div>
                      {(r.targetRoles ?? []).length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {(r.targetRoles ?? []).map((t) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(r)} data-testid={`resumes-edit-${r.id}`} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>
                        Edit
                      </button>
                      <button onClick={() => toggleVersions(r.id)} data-testid={`resumes-versions-${r.id}`} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>
                        {versionsFor === r.id ? "Hide versions" : "Versions"}
                      </button>
                      {confirmDeleteId === r.id ? (
                        <span className="flex items-center gap-2 text-xs">
                          Delete this resume?
                          <button onClick={() => destroy(r.id)} disabled={busy} data-testid={`resumes-confirm-delete-${r.id}`} className="rounded-lg border px-3 py-1.5 font-medium disabled:opacity-60" style={{ borderColor: "var(--border)" }}>
                            Yes, delete
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }}>
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(r.id)} data-testid={`resumes-delete-${r.id}`} aria-label={`Delete ${r.name}`} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  {r.fileUrl ? (
                    <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                      File: <a href={r.fileUrl} target="_blank" rel="noreferrer" className="hover:underline">{r.fileUrl}</a>
                    </p>
                  ) : null}
                  {r.parsedText ? (
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs" style={{ color: "var(--muted)" }}>{r.parsedText.slice(0, 600)}</p>
                  ) : null}
                  {versionsFor === r.id ? (
                    <div className="mt-3 border-t pt-2" data-testid={`resumes-versions-list-${r.id}`} style={{ borderColor: "var(--border)" }}>
                      <div className="text-xs font-medium">Version history (read-only snapshots)</div>
                      {(versions[r.id] ?? []).length === 0 ? (
                        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>No versions yet. Each edit creates one automatically.</p>
                      ) : (
                        <ul className="mt-1 grid gap-1 text-xs" style={{ color: "var(--muted)" }}>
                          {(versions[r.id] ?? []).map((v) => (
                            <li key={v.id}>v{v.version} · {v.note ?? "snapshot"} · {v.createdAt.slice(0, 10)}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
