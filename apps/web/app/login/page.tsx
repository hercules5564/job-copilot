"use client";

import { useEffect, useState } from "react";
import { authApi } from "../../lib/api";
import { Card } from "../../components/ui";

/**
 * Phase 9 — JobPilot sign-in. Google OIDC only (no passwords, no MFA):
 * the button navigates to the API, which 302s to Google; the callback
 * establishes an HttpOnly session cookie and lands on /dashboard.
 * No token ever touches localStorage, URLs, or React state.
 */

const ERROR_COPY: Record<string, string> = {
  oauth_not_configured: "Google sign-in is not configured on this server. Set the GOOGLE_AUTH_* variables and try again.",
  oauth_failed: "Google sign-in failed. Please try again.",
  invalid_state: "The sign-in attempt expired or was invalid. Please try again.",
};

export default function LoginPage() {
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (code) setError(ERROR_COPY[code] ?? "Sign-in failed. Please try again.");
    if (params.get("expired") === "1") setExpired(true);
    // Already signed in? Skip the form.
    authApi.me().then(() => {
      window.location.href = "/dashboard";
    }).catch(() => undefined);
  }, []);

  function signIn() {
    setBusy(true);
    window.location.href = authApi.googleUrl;
  }

  return (
    <div className="mx-auto max-w-md pt-16">
      <div className="mb-6 text-center">
        <div className="text-2xl font-bold">JobPilot</div>
        <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          AI job-search operating system
        </div>
      </div>
      <Card>
        <h1 className="text-lg font-semibold">Sign in to JobPilot</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Continue with your Google account. Sessions are server-side and expire automatically.
        </p>
        {expired ? (
          <p className="mt-3 text-sm" data-testid="login-expired">
            Your session expired. Please sign in again.
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm" data-testid="login-error">{error}</p>
        ) : null}
        <button
          onClick={signIn}
          disabled={busy}
          data-testid="login-google"
          className="mt-5 w-full rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          {busy ? "Redirecting to Google…" : "Continue with Google"}
        </button>
      </Card>
    </div>
  );
}
