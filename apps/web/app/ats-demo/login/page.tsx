"use client";

import Link from "next/link";
import { PageHeader, Card } from "../../../components/ui";

/**
 * Controlled login-wall fixture. Automation must stop here with
 * LOGIN_REQUIRED; the user signs in manually (or follows the demo
 * post-login landing link) and then resumes the run. JobPilot never
 * asks for, captures, or stores credentials.
 */
export default function AtsDemoLoginPage() {
  return (
    <div>
      <PageHeader title="Beta ATS — Sign in" sub="Controlled local fixture." />
      <Card>
        <h2 className="font-semibold">Sign in to continue your application</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          This demo applicant tracking system requires login before you can apply.
          Sign in manually in your browser. JobPilot will never ask for your password.
        </p>
        <form className="mt-3 grid gap-3" onSubmit={(e) => e.preventDefault()}>
          <label className="grid gap-1 text-sm" htmlFor="atsLoginEmail">
            <span className="font-medium">Email</span>
            <input id="atsLoginEmail" name="email" type="email" autoComplete="email" className="rounded-lg border p-2" />
          </label>
          <label className="grid gap-1 text-sm" htmlFor="atsLoginPassword">
            <span className="font-medium">Password</span>
            <input id="atsLoginPassword" name="password" type="password" autoComplete="current-password" className="rounded-lg border p-2" />
          </label>
        </form>
        <Link
          href="/ats-demo/apply"
          className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
          I have signed in — continue to the application (demo)
        </Link>
      </Card>
    </div>
  );
}
