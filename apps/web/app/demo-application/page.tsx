"use client";

import { useState } from "react";
import { PageHeader, Card } from "../../components/ui";

/**
 * Local demo application form for Phase 7 browser-automation testing.
 * NOT a real production application — a deterministic fixture with
 * tricky fields (unknown question, sensitive field that must not be
 * touched, file upload that stays manual).
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

export default function DemoApplicationPage() {
  const [submitted, setSubmitted] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("fullName") ?? "applicant");
    const missing: string[] = [];
    for (const key of ["fullName", "email", "coverLetter"]) {
      if (!String(data.get(key) ?? "").trim()) missing.push(key);
    }
    if (missing.length > 0) {
      setSubmitted(`VALIDATION_ERROR: missing ${missing.join(", ")}`);
      return;
    }
    setSubmitted(`CONFIRMED-${name.replace(/[^a-z0-9]+/gi, "").toUpperCase().slice(0, 8)}-2026`);
  }

  if (submitted) {
    if (submitted.startsWith("VALIDATION_ERROR")) {
      return (
        <div>
          <PageHeader title="Demo Application" sub="Local test fixture — not a real application." />
          <Card><p className="text-sm" data-testid="demo-error">{submitted}</p></Card>
        </div>
      );
    }
    return (
      <div>
        <PageHeader title="Demo Application" sub="Local test fixture — not a real application." />
        <Card>
          <h2 className="font-semibold">Application submitted. Thank you for applying!</h2>
          <p className="mt-2 text-sm" data-testid="demo-confirmation">
            Your confirmation reference number is {submitted}. A confirmation email will follow.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Demo Application" sub="Local test fixture for browser automation — not a real application." />
      <Card>
        <form onSubmit={onSubmit} className="grid gap-3" data-testid="demo-form">
          <Field id="fullName" label="Full Name" required>
            <input id="fullName" name="fullName" type="text" required autoComplete="name" className="rounded-lg border p-2" />
          </Field>
          <Field id="email" label="Email" required>
            <input id="email" name="email" type="email" required autoComplete="email" className="rounded-lg border p-2" />
          </Field>
          <Field id="phone" label="Phone Number">
            <input id="phone" name="phone" type="tel" autoComplete="tel" className="rounded-lg border p-2" />
          </Field>
          <Field id="github" label="GitHub">
            <input id="github" name="github" type="url" placeholder="https://github.com/you" className="rounded-lg border p-2" />
          </Field>
          <Field id="portfolio" label="Portfolio">
            <input id="portfolio" name="portfolio" type="url" placeholder="https://your-site.dev" className="rounded-lg border p-2" />
          </Field>
          <Field id="experience" label="Years of Experience">
            <input id="experience" name="experience" type="text" placeholder="e.g. 4 years" className="rounded-lg border p-2" />
          </Field>
          <Field id="skills" label="Skills">
            <textarea id="skills" name="skills" rows={2} className="rounded-lg border p-2" />
          </Field>
          <Field id="whyRole" label="Why do you want this role?">
            <textarea id="whyRole" name="whyRole" rows={3} className="rounded-lg border p-2" />
          </Field>
          <Field id="coverLetter" label="Cover Letter" required>
            <textarea id="coverLetter" name="coverLetter" rows={4} required className="rounded-lg border p-2" />
          </Field>
          <Field id="employmentType" label="Employment Type">
            <select id="employmentType" name="employmentType" className="rounded-lg border p-2">
              <option value="">Select…</option>
              <option>Full-time</option>
              <option>Part-time</option>
              <option>Contract</option>
            </select>
          </Field>
          <Field id="remoteOk" label="Open to remote work">
            <input id="remoteOk" name="remoteOk" type="checkbox" value="yes" className="h-4 w-4" />
          </Field>
          <Field id="resume" label="Resume" hint="Upload manually — automation will not attach files.">
            <input id="resume" name="resume" type="file" className="rounded-lg border p-2" />
          </Field>
          <Field id="dinosaur" label="Favorite dinosaur?">
            <input id="dinosaur" name="dinosaur" type="text" placeholder="Unknown question — answer manually" className="rounded-lg border p-2" />
          </Field>
          <Field id="portalPassword" label="Job portal password (automation must never touch this)">
            <input id="portalPassword" name="portalPassword" type="password" autoComplete="new-password" className="rounded-lg border p-2" />
          </Field>
          <button type="submit" className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
            Submit Application
          </button>
        </form>
      </Card>
    </div>
  );
}
