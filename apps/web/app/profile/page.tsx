"use client";

import { useEffect, useState } from "react";
import { profileApi, ApiError, type Profile } from "../../lib/api";
import { redirectToLogin } from "../../lib/auth-redirect";
import { PageHeader, Card } from "../../components/ui";
import { Autocomplete } from "../../components/autocomplete";

/**
 * Phase 12A — profile/preferences editor over the existing PUT/GET API.
 * PUT upserts (creates when missing); every field maps 1:1 to the
 * backend contract. CSV inputs map to string arrays; blanks become [].
 */

const EMPTY_PREFS = {
  targetRoles: [] as string[],
  skills: [] as string[],
  minSalary: null as number | null,
  preferredSalary: null as number | null,
  salaryCurrency: "USD",
  preferredLocations: [] as string[],
  workMode: "ANY" as Profile["workMode"],
  employmentTypes: [] as string[],
  noticePeriodDays: null as number | null,
  workAuthorization: [] as string[],
  preferredIndustries: [] as string[],
  preferredCompanies: [] as string[],
  excludedCompanies: [] as string[],
};

interface FormState {
  fullName: string;
  headline: string;
  summary: string;
  yearsOfExperience: string;
  education: string;
  targetRoles: string;
  skills: string;
  minSalary: string;
  preferredSalary: string;
  salaryCurrency: string;
  preferredLocations: string;
  workMode: Profile["workMode"];
  employmentTypes: string;
  noticePeriodDays: string;
  workAuthorization: string;
  preferredIndustries: string;
  preferredCompanies: string;
  excludedCompanies: string;
}

const EMPTY_FORM: FormState = {
  fullName: "",
  headline: "",
  summary: "",
  yearsOfExperience: "",
  education: "",
  targetRoles: "",
  skills: "",
  minSalary: "",
  preferredSalary: "",
  salaryCurrency: "USD",
  preferredLocations: "",
  workMode: "ANY",
  employmentTypes: "",
  noticePeriodDays: "",
  workAuthorization: "",
  preferredIndustries: "",
  preferredCompanies: "",
  excludedCompanies: "",
};

function csv(list: string[]): string {
  return (list ?? []).join(", ");
}

function uncsv(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function numOrNull(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function toForm(p: Profile): FormState {
  const edu = Array.isArray(p.education)
    ? (p.education as unknown[]).map((e) => String(e)).join("\n")
    : typeof p.education === "string"
      ? p.education
      : "";
  return {
    fullName: p.fullName ?? "",
    headline: p.headline ?? "",
    summary: p.summary ?? "",
    yearsOfExperience: p.yearsOfExperience?.toString() ?? "",
    education: edu,
    targetRoles: csv(p.targetRoles),
    skills: csv(p.skills),
    minSalary: p.minSalary?.toString() ?? "",
    preferredSalary: p.preferredSalary?.toString() ?? "",
    salaryCurrency: p.salaryCurrency ?? "USD",
    preferredLocations: csv(p.preferredLocations),
    workMode: p.workMode ?? "ANY",
    employmentTypes: csv(p.employmentTypes),
    noticePeriodDays: p.noticePeriodDays?.toString() ?? "",
    workAuthorization: csv(p.workAuthorization),
    preferredIndustries: csv(p.preferredIndustries),
    preferredCompanies: csv(p.preferredCompanies),
    excludedCompanies: csv(p.excludedCompanies),
  };
}

function Field({
  label,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  if (htmlFor) {
    return (
      <div className="grid gap-1 text-sm" style={{ color: "inherit" }}>
        <label htmlFor={htmlFor} className="font-medium">{label}</label>
        {children}
        {hint ? <span style={{ color: "var(--muted)" }}>{hint}</span> : null}
      </div>
    );
  }
  return (
    <label className="grid gap-1 text-sm" style={{ color: "inherit" }}>
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span style={{ color: "var(--muted)" }}>{hint}</span> : null}
    </label>
  );
}

const inputCls = "rounded-lg border p-2 text-sm";

export default function ProfilePage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [exists, setExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    profileApi
      .get()
      .then((r) => {
        setForm(toForm(r.profile));
        setExists(true);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          redirectToLogin({ expired: true });
          return;
        }
        if (e instanceof ApiError && e.status === 404) {
          setExists(false); // no profile yet: empty form is the correct state
        } else {
          setError("Could not load your profile. Start the API with npm run dev:api.");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return; // prevent accidental duplicate submissions
    setError("");
    setNotice("");
    const yoe = numOrNull(form.yearsOfExperience);
    const minSalary = numOrNull(form.minSalary);
    const preferredSalary = numOrNull(form.preferredSalary);
    const noticeDays = numOrNull(form.noticePeriodDays);
    if (Number.isNaN(yoe) || Number.isNaN(minSalary) || Number.isNaN(preferredSalary) || Number.isNaN(noticeDays)) {
      setError("Numeric fields must be empty or non-negative numbers.");
      return;
    }
    setSaving(true);
    try {
      const r = await profileApi.save({
        fullName: form.fullName.trim() || undefined,
        headline: form.headline.trim() || null,
        summary: form.summary.trim() || null,
        yearsOfExperience: yoe,
        education: form.education.split("\n").map((s) => s.trim()).filter(Boolean),
        preferences: {
          ...EMPTY_PREFS,
          targetRoles: uncsv(form.targetRoles),
          skills: uncsv(form.skills),
          minSalary,
          preferredSalary,
          salaryCurrency: form.salaryCurrency.trim() || "USD",
          preferredLocations: uncsv(form.preferredLocations),
          workMode: form.workMode,
          employmentTypes: uncsv(form.employmentTypes),
          noticePeriodDays: noticeDays,
          workAuthorization: uncsv(form.workAuthorization),
          preferredIndustries: uncsv(form.preferredIndustries),
          preferredCompanies: uncsv(form.preferredCompanies),
          excludedCompanies: uncsv(form.excludedCompanies),
        },
      });
      setForm(toForm(r.profile));
      setExists(true);
      setNotice("Profile saved.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin({ expired: true });
        return;
      }
      setError("Could not save your profile. Check the values and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Profile" sub="Your candidate information and job-search preferences. Used for matching and discovery." />
      {error ? <Card className="mb-4"><p className="text-sm" data-testid="profile-error">{error}</p></Card> : null}
      {notice ? <Card className="mb-4"><p className="text-sm" data-testid="profile-notice">{notice}</p></Card> : null}
      {loading ? (
        <Card><p className="text-sm" data-testid="profile-loading">Loading profile…</p></Card>
      ) : (
        <form onSubmit={save}>
          {exists === false ? (
            <Card className="mb-4"><p className="text-sm">No profile yet — fill in the form and save to create one.</p></Card>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h2 className="font-semibold">Basics</h2>
              <div className="mt-3 grid gap-3">
                <Field label="Full name">
                  <input id="profileFullName" className={inputCls} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Ada Lovelace" maxLength={200} />
                </Field>
                <Field label="Headline">
                  <input id="profileHeadline" className={inputCls} value={form.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Backend Engineer, TypeScript" maxLength={300} />
                </Field>
                <Field label="Summary">
                  <textarea id="profileSummary" className={inputCls} rows={4} value={form.summary} onChange={(e) => set("summary", e.target.value)} placeholder="A few sentences about your background." maxLength={5000} />
                </Field>
                <Field label="Years of experience">
                  <input id="profileYoe" className={inputCls} inputMode="decimal" value={form.yearsOfExperience} onChange={(e) => set("yearsOfExperience", e.target.value)} placeholder="4" />
                </Field>
                <Field label="Education" hint="One entry per line.">
                  <textarea id="profileEducation" className={inputCls} rows={3} value={form.education} onChange={(e) => set("education", e.target.value)} placeholder={"BSc Computer Science\nMSc Distributed Systems"} />
                </Field>
              </div>
            </Card>
            <Card>
              <h2 className="font-semibold">Targeting</h2>
              <div className="mt-3 grid gap-3">
                <Field label="Target roles" hint="Comma-separated. Pick a suggestion or type your own." htmlFor="profileRoles">
                  <Autocomplete
                    id="profileRoles"
                    kind="role"
                    mode="csv"
                    className={inputCls}
                    value={form.targetRoles}
                    onChange={(value) => set("targetRoles", value)}
                    placeholder="Backend Engineer, Platform Engineer"
                    data-testid="profile-roles"
                  />
                </Field>
                <Field label="Skills" hint="Comma-separated.">
                  <input id="profileSkills" className={inputCls} value={form.skills} onChange={(e) => set("skills", e.target.value)} placeholder="TypeScript, PostgreSQL, Redis" />
                </Field>
                <Field label="Preferred locations" hint="Comma-separated. Pick a suggestion or type your own." htmlFor="profileLocations">
                  <Autocomplete
                    id="profileLocations"
                    kind="location"
                    mode="csv"
                    className={inputCls}
                    value={form.preferredLocations}
                    onChange={(value) => set("preferredLocations", value)}
                    placeholder="Berlin, Remote"
                    data-testid="profile-locations"
                  />
                </Field>
                <Field label="Work mode">
                  <select id="profileWorkMode" className={inputCls} value={form.workMode} onChange={(e) => set("workMode", e.target.value as FormState["workMode"])}>
                    <option value="ANY">Any</option>
                    <option value="REMOTE">Remote</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="ONSITE">Onsite</option>
                  </select>
                </Field>
                <Field label="Employment types" hint="Comma-separated.">
                  <input id="profileEmploymentTypes" className={inputCls} value={form.employmentTypes} onChange={(e) => set("employmentTypes", e.target.value)} placeholder="Full-time, Contract" />
                </Field>
                <Field label="Work authorization" hint="Comma-separated.">
                  <input id="profileWorkAuth" className={inputCls} value={form.workAuthorization} onChange={(e) => set("workAuthorization", e.target.value)} placeholder="EU, US" />
                </Field>
              </div>
            </Card>
            <Card>
              <h2 className="font-semibold">Compensation</h2>
              <div className="mt-3 grid gap-3">
                <Field label="Minimum salary">
                  <input id="profileMinSalary" className={inputCls} inputMode="decimal" value={form.minSalary} onChange={(e) => set("minSalary", e.target.value)} placeholder="80000" />
                </Field>
                <Field label="Preferred salary">
                  <input id="profilePreferredSalary" className={inputCls} inputMode="decimal" value={form.preferredSalary} onChange={(e) => set("preferredSalary", e.target.value)} placeholder="100000" />
                </Field>
                <Field label="Salary currency">
                  <input id="profileCurrency" className={inputCls} value={form.salaryCurrency} onChange={(e) => set("salaryCurrency", e.target.value)} placeholder="USD" maxLength={10} />
                </Field>
                <Field label="Notice period (days)">
                  <input id="profileNotice" className={inputCls} inputMode="numeric" value={form.noticePeriodDays} onChange={(e) => set("noticePeriodDays", e.target.value)} placeholder="30" />
                </Field>
              </div>
            </Card>
            <Card>
              <h2 className="font-semibold">Companies & industries</h2>
              <div className="mt-3 grid gap-3">
                <Field label="Preferred industries" hint="Comma-separated.">
                  <input id="profileIndustries" className={inputCls} value={form.preferredIndustries} onChange={(e) => set("preferredIndustries", e.target.value)} placeholder="Developer tools, Fintech" />
                </Field>
                <Field label="Preferred companies" hint="Comma-separated.">
                  <input id="profilePreferredCompanies" className={inputCls} value={form.preferredCompanies} onChange={(e) => set("preferredCompanies", e.target.value)} placeholder="Acme, Globex" />
                </Field>
                <Field label="Excluded companies" hint="Comma-separated.">
                  <input id="profileExcludedCompanies" className={inputCls} value={form.excludedCompanies} onChange={(e) => set("excludedCompanies", e.target.value)} placeholder="Initech" />
                </Field>
              </div>
            </Card>
          </div>
          <div className="mt-4">
            <button type="submit" disabled={saving} data-testid="profile-save" className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60" style={{ borderColor: "var(--border)" }}>
              {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
