"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  profileApi,
  resumesApi,
  portfolioApi,
  recommendationsApi,
  ApiError,
  type DiscoveryWorkMode,
  type ExperienceLevel,
  type PortfolioAnalysis,
  type Profile,
  type ProfileCompleteness,
  type Resume,
  type ResumeExtraction,
} from "../../lib/api";
import { redirectToLogin } from "../../lib/auth-redirect";
import { PageHeader, Card, Badge } from "../../components/ui";
import { Autocomplete } from "../../components/autocomplete";

/**
 * Phase 22 — "Build Your Job Profile" workflow:
 * upload → analyse → review/confirm → portfolio & links → matched jobs.
 * Extraction never becomes matching input until the user confirms it.
 */

const inputCls = "rounded-lg border p-2 text-sm";

const STEPS = [
  "Upload your resume",
  "AI analyses your profile",
  "Review & confirm",
  "Portfolio & preferences",
  "Discover matched jobs",
];

function csv(values: string[]): string {
  return values.join(", ");
}

function uncsv(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function StatusBadge({ status }: { status?: string }) {
  if (status === "PARSED") return <Badge>Analysed</Badge>;
  if (status === "FAILED") return <Badge>Failed</Badge>;
  if (status === "PARSING") return <Badge>Analysing…</Badge>;
  return <Badge>Uploaded</Badge>;
}

export default function JobProfilePage() {
  const [resumes, setResumes] = useState<Resume[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [completeness, setCompleteness] = useState<ProfileCompleteness | null>(null);
  const [extraction, setExtraction] = useState<ResumeExtraction | null>(null);
  const [activeResumeId, setActiveResumeId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioAnalysis, setPortfolioAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [portfolioBusy, setPortfolioBusy] = useState(false);
  const [matchedCount, setMatchedCount] = useState<number | null>(null);

  async function refreshCompleteness() {
    try {
      setCompleteness(await recommendationsApi.completeness());
    } catch {
      // Non-essential indicator.
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [resumeList, completenessResult] = await Promise.all([
          resumesApi.list(),
          recommendationsApi.completeness(),
        ]);
        let loadedProfile: Profile | null = null;
        try {
          loadedProfile = (await profileApi.get()).profile;
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            redirectToLogin({ expired: true });
            return;
          }
          if (!(e instanceof ApiError && e.status === 404)) throw e;
        }
        if (cancelled) return;
        setResumes(resumeList.resumes);
        setCompleteness(completenessResult);
        setProfile(loadedProfile);
        setPortfolioUrl(loadedProfile?.portfolioUrl ?? "");
        setGithubUrl(loadedProfile?.githubUrl ?? "");
        setLinkedinUrl(loadedProfile?.linkedinUrl ?? "");

        const active =
          resumeList.resumes.find((r) => (r.kind ?? "RESUME") === "RESUME" && r.isActive) ??
          resumeList.resumes.find((r) => (r.kind ?? "RESUME") === "RESUME");
        if (active) {
          setActiveResumeId(active.id);
          const stored = await resumesApi.extraction(active.id).catch(() => null);
          if (!cancelled && stored?.extraction) {
            setExtraction(stored.extraction);
            setStep(3);
          } else if (!cancelled && active.status === "FAILED") {
            setStep(2);
            setError(active.parseError ?? "This document could not be analysed.");
          }
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          redirectToLogin({ expired: true });
          return;
        }
        if (!cancelled) setError("Could not load your job profile. Start the API with npm run dev:api.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function upload(file: File, kind: "RESUME" | "PORTFOLIO") {
    setUploading(true);
    setProgress(0);
    setError("");
    setNotice("");
    try {
      const result = await resumesApi.upload({
        file,
        kind,
        name: file.name,
        onProgress: setProgress,
      });
      setResumes((prev) => [result.resume, ...(prev ?? [])]);
      if (kind === "RESUME") {
        setActiveResumeId(result.resume.id);
        if (result.extraction) {
          setExtraction(result.extraction);
          setStep(3);
          setNotice(
            result.provider === "ai"
              ? "AI analysis complete. Review every field before saving."
              : "Analysis complete. Review every field before saving.",
          );
        } else {
          setStep(2);
          setError(result.parseError ?? "The document was uploaded but could not be analysed.");
        }
      } else {
        setNotice("Portfolio uploaded.");
      }
      await refreshCompleteness();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        redirectToLogin({ expired: true });
        return;
      }
      setError(e instanceof ApiError ? e.message : "Upload failed. Check the file and try again.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function retryParse() {
    if (!activeResumeId) return;
    setBusy(true);
    setError("");
    try {
      const result = await resumesApi.parse(activeResumeId);
      setExtraction(result.extraction);
      setStep(3);
      setNotice("Analysis complete. Review every field before saving.");
      await refreshCompleteness();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not analyse this document.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmExtraction() {
    if (!activeResumeId || !extraction) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await resumesApi.confirm(activeResumeId, {
        extraction,
        portfolioUrl: portfolioUrl.trim() || null,
        githubUrl: githubUrl.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
        setActive: true,
      });
      setProfile(result.profile);
      setNotice("Profile saved. Your confirmed details now power job matching.");
      await refreshCompleteness();
      setStep(4);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLinks() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await profileApi.save({
        portfolioUrl: portfolioUrl.trim() || null,
        githubUrl: githubUrl.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
      });
      setProfile(result.profile);
      setNotice("Links saved.");
      await refreshCompleteness();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save links.");
    } finally {
      setBusy(false);
    }
  }

  async function analyzePortfolio() {
    const url = portfolioUrl.trim() || githubUrl.trim();
    if (!url) {
      setError("Add a portfolio or GitHub URL first.");
      return;
    }
    setPortfolioBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await portfolioApi.analyze(url);
      setPortfolioAnalysis(result.analysis);
      if (!result.analysis.accessible) {
        setError(result.analysis.error ?? "Could not analyse that URL.");
      } else {
        setNotice(
          `Analysed ${result.analysis.projects.length} project(s) and ${result.analysis.skills.length} skill(s).`,
        );
        await refreshCompleteness();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not analyse that URL.");
    } finally {
      setPortfolioBusy(false);
    }
  }

  async function findMatches() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await recommendationsApi.run({ limit: 30 });
      setMatchedCount(result.matched);
      setNotice(`Scored ${result.matched} job(s) against your confirmed profile.`);
      setStep(5);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setError("Confirm your profile first, then run matching.");
      } else {
        setError(e instanceof ApiError ? e.message : "Could not run matching.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeResume(id: string) {
    if (!window.confirm("Delete this document and its extracted data?")) return;
    setError("");
    try {
      await resumesApi.remove(id);
      setResumes((prev) => (prev ?? []).filter((r) => r.id !== id));
      if (activeResumeId === id) {
        setActiveResumeId(null);
        setExtraction(null);
        setStep(1);
      }
      await refreshCompleteness();
      setNotice("Document deleted.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete the document.");
    }
  }

  function updateExtraction(patch: Partial<ResumeExtraction>) {
    setExtraction((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Build Your Job Profile" sub="Upload a resume, review what AI extracted, and discover roles that fit." />
        <Card><p className="text-sm">Loading your profile…</p></Card>
      </div>
    );
  }

  const resumeDocs = (resumes ?? []).filter((r) => (r.kind ?? "RESUME") === "RESUME");
  const portfolioDocs = (resumes ?? []).filter((r) => r.kind === "PORTFOLIO");

  return (
    <div>
      <PageHeader
        title="Build Your Job Profile"
        sub="Upload a resume or portfolio, review the extracted details, and match against real jobs from JobPilot's sources."
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Profile completeness</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {completeness?.percent ?? 0}% complete
              {completeness?.parsedResumes ? ` · ${completeness.parsedResumes} analysed resume(s)` : ""}
            </p>
          </div>
          <Link href="/matches" className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: "var(--border)" }}>
            View matches →
          </Link>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-sunken)" }}>
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${completeness?.percent ?? 0}%`, background: "var(--blue)" }}
          />
        </div>
        {completeness && completeness.missing.length > 0 ? (
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Next: {completeness.missing.slice(0, 4).join(" · ")}
          </p>
        ) : null}
      </Card>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, index) => (
          <span
            key={label}
            className="rounded-full border px-3 py-1"
            style={{
              borderColor: index + 1 === step ? "var(--blue)" : "var(--border)",
              color: index + 1 === step ? "var(--blue)" : "var(--muted)",
              background: index + 1 === step ? "var(--blue-soft)" : "transparent",
            }}
          >
            {index + 1}. {label}
          </span>
        ))}
      </div>

      {error ? <Card className="mb-4"><p className="text-sm" data-testid="job-profile-error">{error}</p></Card> : null}
      {notice ? <Card className="mb-4"><p className="text-sm" data-testid="job-profile-notice">{notice}</p></Card> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">1. Upload your resume</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            PDF or DOCX, up to 10 MB. Files stay private and are only readable by you.
          </p>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Resume (PDF or DOCX)</span>
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={uploading}
                data-testid="resume-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file, "RESUME");
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Portfolio PDF (optional)</span>
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={uploading}
                data-testid="portfolio-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file, "PORTFOLIO");
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {uploading ? (
              <div>
                <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-sunken)" }}>
                  <div className="h-2 rounded-full" style={{ width: `${progress}%`, background: "var(--blue)" }} />
                </div>
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Uploading… {progress}%</p>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold">Your documents</h2>
          {resumeDocs.length === 0 && portfolioDocs.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              No documents yet. Upload a resume to begin.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 text-sm">
              {[...resumeDocs, ...portfolioDocs].map((doc) => (
                <li key={doc.id} className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{doc.name}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {(doc.kind ?? "RESUME") === "PORTFOLIO" ? "Portfolio" : "Resume"} ·{" "}
                        {doc.originalName ?? "document"} ·{" "}
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={doc.status} />
                      <a
                        href={resumesApi.downloadUrl(doc.id)}
                        className="rounded-lg border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--border)" }}
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        onClick={() => void removeResume(doc.id)}
                        className="rounded-lg border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--border)" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {doc.parseError ? (
                    <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{doc.parseError}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {activeResumeId ? (
            <button
              type="button"
              onClick={() => void retryParse()}
              disabled={busy}
              className="mt-3 rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              {busy ? "Analysing…" : "Re-analyse active resume"}
            </button>
          ) : null}
        </Card>
      </div>

      {extraction ? (
        <Card className="mt-4">
          <h2 className="font-semibold">2–3. Review extracted information</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Correct anything that is wrong or missing. Nothing is saved to matching until you confirm.
            Confidence: {Math.round((extraction.confidence ?? 0) * 100)}%.
          </p>
          {extraction.warnings.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-xs" style={{ color: "var(--muted)" }}>
              {extraction.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="font-medium">Professional summary</span>
              <textarea
                className={inputCls}
                rows={3}
                value={extraction.summary ?? ""}
                onChange={(e) => updateExtraction({ summary: e.target.value || null })}
                placeholder="Leave empty if the resume does not state one."
                data-testid="extraction-summary"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Current / desired title</span>
              <input
                className={inputCls}
                value={extraction.currentTitle ?? ""}
                onChange={(e) => updateExtraction({ currentTitle: e.target.value || null })}
                placeholder="Software Engineer"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Years of experience</span>
              <input
                className={inputCls}
                inputMode="decimal"
                value={extraction.yearsOfExperience ?? ""}
                onChange={(e) =>
                  updateExtraction({ yearsOfExperience: e.target.value === "" ? null : Number(e.target.value) })
                }
                placeholder="Leave empty if unknown"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Location</span>
              <input
                className={inputCls}
                value={extraction.location ?? ""}
                onChange={(e) => updateExtraction({ location: e.target.value || null })}
                placeholder="City, Country"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Work mode</span>
              <select
                className={inputCls}
                value={extraction.workMode}
                onChange={(e) => updateExtraction({ workMode: e.target.value as DiscoveryWorkMode })}
              >
                <option value="ANY">Any</option>
                <option value="REMOTE">Remote</option>
                <option value="HYBRID">Hybrid</option>
                <option value="ONSITE">Onsite</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Experience level</span>
              <select
                className={inputCls}
                value={extraction.experienceLevel ?? ""}
                onChange={(e) =>
                  updateExtraction({ experienceLevel: (e.target.value || null) as ExperienceLevel | null })
                }
              >
                <option value="">Unknown</option>
                <option value="INTERN">Internship</option>
                <option value="ENTRY">Entry level</option>
                <option value="MID">Mid level</option>
                <option value="SENIOR">Senior</option>
                <option value="LEAD">Lead / principal</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Minimum salary (optional)</span>
              <input
                className={inputCls}
                inputMode="decimal"
                value={extraction.minSalary ?? ""}
                onChange={(e) => updateExtraction({ minSalary: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="Only if explicitly stated"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Employment types (comma-separated)</span>
              <input
                className={inputCls}
                value={csv(extraction.employmentTypes)}
                onChange={(e) => updateExtraction({ employmentTypes: uncsv(e.target.value) })}
                placeholder="Full-time, Internship"
              />
            </label>
            <div className="grid gap-1 text-sm">
              <span className="font-medium">Target roles</span>
              <Autocomplete
                kind="role"
                mode="csv"
                className={inputCls}
                value={csv(extraction.targetRoles)}
                onChange={(value) => updateExtraction({ targetRoles: uncsv(value) })}
                placeholder="Software Engineer, Backend Engineer"
                data-testid="extraction-roles"
              />
            </div>
            <div className="grid gap-1 text-sm">
              <span className="font-medium">Preferred locations</span>
              <Autocomplete
                kind="location"
                mode="csv"
                className={inputCls}
                value={csv(extraction.preferredLocations)}
                onChange={(value) => updateExtraction({ preferredLocations: uncsv(value) })}
                placeholder="Berlin, Remote"
                data-testid="extraction-locations"
              />
            </div>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="font-medium">Skills (comma-separated)</span>
              <input
                className={inputCls}
                value={csv(extraction.skills.map((s) => s.name))}
                onChange={(e) => {
                  const names = uncsv(e.target.value);
                  const skills = names.map((name) => ({
                    name,
                    category:
                      extraction.skills.find((s) => s.name.toLowerCase() === name.toLowerCase())?.category ??
                      ("other" as const),
                  }));
                  updateExtraction({ skills });
                }}
                placeholder="TypeScript, React, PostgreSQL"
              />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="font-medium">Education (one per line)</span>
              <textarea
                className={inputCls}
                rows={3}
                value={extraction.education.join("\n")}
                onChange={(e) =>
                  updateExtraction({
                    education: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  })
                }
              />
            </label>
          </div>

          {extraction.experience.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Experience</h3>
              <ul className="mt-1 grid gap-2 text-sm">
                {extraction.experience.map((exp, i) => (
                  <li key={i} className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
                    <div className="font-medium">{exp.title ?? "Role"}{exp.company ? ` · ${exp.company}` : ""}</div>
                    {exp.responsibilities.length > 0 ? (
                      <ul className="mt-1 list-disc pl-5 text-xs" style={{ color: "var(--muted)" }}>
                        {exp.responsibilities.map((r, j) => <li key={j}>{r}</li>)}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {extraction.projects.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Projects</h3>
              <ul className="mt-1 grid gap-2 text-sm">
                {extraction.projects.map((project, i) => (
                  <li key={i} className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
                    <div className="font-medium">{project.name}</div>
                    {project.description ? <p className="text-xs" style={{ color: "var(--muted)" }}>{project.description}</p> : null}
                    {project.technologies.length > 0 ? (
                      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                        {project.technologies.join(", ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void confirmExtraction()}
            disabled={busy || !activeResumeId}
            data-testid="confirm-extraction"
            className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {busy ? "Saving…" : "Confirm and save to my profile"}
          </button>
        </Card>
      ) : null}

      <Card className="mt-4">
        <h2 className="font-semibold">4. Portfolio, GitHub and career links</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Only public pages are analysed when you ask. Private pages are never scraped.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Portfolio URL</span>
            <input className={inputCls} value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="https://your-site.dev" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">GitHub URL</span>
            <input className={inputCls} value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/you" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">LinkedIn URL (optional)</span>
            <input className={inputCls} value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/you" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void saveLinks()} disabled={busy} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ borderColor: "var(--border)" }}>
            Save links
          </button>
          <button type="button" onClick={() => void analyzePortfolio()} disabled={portfolioBusy} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ borderColor: "var(--border)" }}>
            {portfolioBusy ? "Analysing…" : "Analyse portfolio / GitHub"}
          </button>
        </div>
        {portfolioAnalysis ? (
          <div className="mt-3 text-sm">
            {portfolioAnalysis.accessible ? (
              <>
                <p className="font-medium">Detected {portfolioAnalysis.projects.length} project(s)</p>
                {portfolioAnalysis.projects.length > 0 ? (
                  <ul className="mt-1 grid gap-1 text-xs" style={{ color: "var(--muted)" }}>
                    {portfolioAnalysis.projects.slice(0, 8).map((project) => (
                      <li key={project.name}>{project.name}{project.technologies.length > 0 ? ` · ${project.technologies.join(", ")}` : ""}</li>
                    ))}
                  </ul>
                ) : null}
                {portfolioAnalysis.warnings.length > 0 ? (
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{portfolioAnalysis.warnings.join(" ")}</p>
                ) : null}
              </>
            ) : (
              <p style={{ color: "var(--danger)" }}>{portfolioAnalysis.error ?? "Could not analyse this URL."}</p>
            )}
          </div>
        ) : null}
      </Card>

      <Card className="mt-4">
        <h2 className="font-semibold">5. Discover jobs matched to your profile</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Matching uses the confirmed profile and your existing job data. Scores come from the deterministic matcher.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void findMatches()}
            disabled={busy}
            data-testid="find-matches"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {busy ? "Matching…" : "Find matched jobs"}
          </button>
          <Link href="/matches" className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
            Open matched jobs →
          </Link>
          {matchedCount !== null ? (
            <span className="text-sm" style={{ color: "var(--muted)" }}>{matchedCount} job(s) scored</span>
          ) : null}
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Need more jobs? Run discovery from the Jobs or Discovery page, then match again.
        </p>
      </Card>
    </div>
  );
}
