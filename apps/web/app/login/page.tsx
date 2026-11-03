"use client";

import { useEffect, useState } from "react";
import { authApi, ApiError } from "../../lib/api";
import { Card } from "../../components/ui";

/**
 * Sign-in page: email + password (Phase 21) with optional Google OIDC.
 * Sessions are server-side HttpOnly cookies; nothing auth-related is stored
 * in localStorage or URLs.
 */

const ERROR_COPY: Record<string, string> = {
  oauth_not_configured: "Google sign-in is not configured on this server.",
  oauth_failed: "Google sign-in failed. Please try again.",
  invalid_state: "The sign-in attempt expired or was invalid. Please try again.",
};

type Mode = "login" | "register";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (code) setError(ERROR_COPY[code] ?? "Sign-in failed. Please try again.");
    if (params.get("expired") === "1") setExpired(true);
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setPassword("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Enter your email address.");
      return;
    }
    if (mode === "register" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await authApi.login({ email: trimmedEmail, password });
      } else {
        await authApi.register({
          email: trimmedEmail,
          password,
          ...(name.trim() ? { name: name.trim() } : {}),
        });
      }
      window.location.href = "/dashboard";
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError("Invalid email or password.");
        else if (err.status === 409) setError("An account with this email already exists. Sign in instead.");
        else if (err.status === 400) setError("Check your email and password (minimum 8 characters).");
        else setError("Sign-in failed. Please try again.");
      } else {
        setError("Could not reach the API. Is it running?");
      }
    } finally {
      setBusy(false);
    }
  }

  function signInWithGoogle() {
    setBusy(true);
    window.location.href = authApi.googleUrl;
  }

  const inputCls = "rounded-lg border p-2 text-sm";

  return (
    <div className="mx-auto max-w-md pt-16">
      <div className="mb-6 text-center">
        <div className="text-2xl font-bold">JobPilot</div>
        <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          AI job-search operating system
        </div>
      </div>
      <Card>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === "login" ? "" : "opacity-60"}`}
            style={{ borderColor: "var(--border)" }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode("register")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === "register" ? "" : "opacity-60"}`}
            style={{ borderColor: "var(--border)" }}
          >
            Create account
          </button>
        </div>

        <h1 className="mt-4 text-lg font-semibold">
          {mode === "login" ? "Sign in to JobPilot" : "Create your JobPilot account"}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          {mode === "login"
            ? "Use your email and password, or continue with Google."
            : "Email and password only — you can add Google later."}
        </p>

        {expired ? (
          <p className="mt-3 text-sm" data-testid="login-expired">
            Your session expired. Please sign in again.
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm" data-testid="login-error">{error}</p>
        ) : null}

        <form onSubmit={submit} className="mt-4 grid gap-3">
          {mode === "register" ? (
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Name (optional)</span>
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                maxLength={200}
                autoComplete="name"
              />
            </label>
          ) : null}
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Email</span>
            <input
              className={inputCls}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              maxLength={320}
              autoComplete="email"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Password</span>
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
              maxLength={200}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            data-testid="login-submit"
            className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "var(--border)" }}
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
          <span className="h-px flex-1" style={{ background: "var(--border)" }} />
          or
          <span className="h-px flex-1" style={{ background: "var(--border)" }} />
        </div>

        <button
          onClick={signInWithGoogle}
          disabled={busy}
          data-testid="login-google"
          className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          Continue with Google
        </button>
      </Card>
    </div>
  );
}
