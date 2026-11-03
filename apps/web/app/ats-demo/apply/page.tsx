"use client";

import { useState } from "react";
import { PageHeader, Card } from "../../../components/ui";

/**
 * Controlled local ATS fixture for Phase 8 adapter testing.
 * NOT a third-party integration — a deterministic local form that mimics
 * a production ATS flow (auth question, voluntary EEO section, confirmation
 * reference). Job context: Frontend Engineer at Beta.
 */
function Field({ id, label, required, children, hint }: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="grid gap-1 text-sm" htmlFor={id}>
      <span className="font-medium">{label}{required ? " *" : ""}</span>
      {children}
      {hint ? <span style={{ color: "var(--muted)" }}>{hint}</span> : null}
    </label>
  );
}

export default function AtsDemoApplyPage() {
  const [submitted, setSubmitted] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const missing: string[] = [];
    for (const key of ["fullName", "email", "coverLetter", "terms"]) {
      if (!String(data.get(key) ?? "").trim()) missing.push(key);
    }
    if (missing.length > 0) {
      setSubmitted(`VALIDATION_ERROR: missing ${missing.join(", ")}`);
      return;
    }
    setSubmitted("ATS-2026-0042");
  }

  if (submitted) {
    if (submitted.startsWith("VALIDATION_ERROR")) {
      return (
        <div>
          <PageHeader title="Beta — Frontend Engineer application" sub="Controlled local ATS fixture." />
          <Card><p className="text-sm" data-testid="ats-error">{submitted}</p></Card>
        </div>
      );
    }
    return (
      <div>
        <PageHeader title="Beta — Frontend Engineer application" sub="Controlled local ATS fixture." />
        <Card>
          <h2 className="font-semibold">Thank you for applying!</h2>
          <p className="mt-2 text-sm" data-testid="ats-confirmation">
            Your application has been submitted. Confirmation reference number is {submitted}.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Beta — Frontend Engineer application" sub="Controlled local ATS fixture, not a real employer." />
      <Card>
        <form onSubmit={onSubmit} className="grid gap-3" data-testid="ats-form">
          <Field id="atsName" label="Full Name" required>
            <input id="atsName" name="fullName" type="text" required autoComplete="name" className="rounded-lg border p-2" />
          </Field>
          <Field id="atsEmail" label="Email" required>
            <input id="atsEmail" name="email" type="email" required autoComplete="email" className="rounded-lg border p-2" />
          </Field>
          <Field id="atsPhone" label="Phone">
            <input id="atsPhone" name="phone" type="tel" autoComplete="tel" className="rounded-lg border p-2" />
          </Field>
          <Field id="atsLinkedin" label="LinkedIn Profile">
            <input id="atsLinkedin" name="linkedin" type="url" placeholder="https://linkedin.com/in/you" className="rounded-lg border p-2" />
          </Field>
          <Field id="atsExp" label="Years of Experience">
            <select id="atsExp" name="experience" className="rounded-lg border p-2">
              <option value="">Select…</option>
              <option>0-2 years</option>
              <option>3-5 years</option>
              <option>5+ years</option>
            </select>
          </Field>
          <fieldset className="grid gap-1 text-sm">
            <legend className="font-medium">Are you authorized to work in this country?</legend>
            <label><input type="radio" name="workAuth" value="yes" className="mr-2" />Yes</label>
            <label><input type="radio" name="workAuth" value="no" className="mr-2" />No</label>
          </fieldset>
          <Field id="atsCover" label="Cover Letter" required>
            <textarea id="atsCover" name="coverLetter" rows={4} required className="rounded-lg border p-2" />
          </Field>
          <Field id="atsGender" label="Gender (voluntary, EEO)">
            <select id="atsGender" name="eeoGender" className="rounded-lg border p-2">
              <option value="">Prefer not to say</option>
              <option>Female</option>
              <option>Male</option>
              <option>Non-binary</option>
            </select>
          </Field>
          <Field id="atsResume" label="Resume" hint="Upload manually — automation will not attach files.">
            <input id="atsResume" name="resume" type="file" className="rounded-lg border p-2" />
          </Field>
          <Field id="atsTerms" label="I certify that the information provided is accurate" required>
            <input id="atsTerms" name="terms" type="checkbox" value="accepted" required className="h-4 w-4" />
          </Field>
          <button type="submit" className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
            Submit Application
          </button>
        </form>
      </Card>
    </div>
  );
}
