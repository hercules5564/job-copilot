"use client";

import { useEffect, useState } from "react";
import { authApi, ApiError } from "../../lib/api";
import { GoogleIcon, ArrowRight } from "../../components/icons";
import { AuthLandscape } from "../../components/site/pixel";

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

  return (
    <div className="cf-auth w-full">
      <div className="cf-auth-art">
        <AuthLandscape />
        <div className="cf-auth-art-copy">
          <span className="cf-mono text-[9px] text-white/65">JobPilot</span>
          <h2 className="mt-3">Run your entire job search with AI agents.</h2>
          <p>
            Discover roles, match them against your real experience, and prepare
            applications with human-approved context.
          </p>
        </div>
      </div>

      <div className="cf-auth-form">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-7">
            <div className="flex items-center gap-2">
              <span className="cf-wordmark-mark" aria-hidden="true" style={{ color: "var(--ink)" }}>
                <i /> <i /> <i /> <i /> <i /> <i /> <i /> <i /> <i />
              </span>
              <span className="cf-serif text-[25px] leading-none">JobPilot</span>
            </div>
            <h1 className="mt-5 text-[28px] leading-[1.12] tracking-[-0.02em]">
              {mode === "login" ? "Sign in to JobPilot" : "Create your account"}
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-muted)]">
              {mode === "login"
                ? "Use your email and password, or continue with Google."
                : "Email and password only — you can add Google later."}
            </p>
          </div>

          <div className="cf-auth-tabs" role="tablist" aria-label="Account mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => switchMode("login")}
              className="cf-auth-tab"
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              onClick={() => switchMode("register")}
              className="cf-auth-tab"
            >
              Create account
            </button>
          </div>

          {expired ? (
            <p className="cf-alert cf-alert-warning mt-4" data-testid="login-expired">
              Your session expired. Please sign in again.
            </p>
          ) : null}
          {error ? (
            <p className="cf-alert cf-alert-danger mt-4" data-testid="login-error">
              {error}
            </p>
          ) : null}

          <form onSubmit={submit} className="mt-5 grid gap-3.5">
            {mode === "register" ? (
              <label className="cf-label">
                <span>Name (optional)</span>
                <input
                  className="cf-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ada Lovelace"
                  maxLength={200}
                  autoComplete="name"
                />
              </label>
            ) : null}
            <label className="cf-label">
              <span>Email</span>
              <input
                className="cf-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                maxLength={320}
                autoComplete="email"
                required
              />
            </label>
            <label className="cf-label">
              <span>Password</span>
              <input
                className="cf-input"
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
              className="cf-btn cf-btn-dark mt-1 w-full"
            >
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              {!busy ? <ArrowRight width={15} height={15} /> : null}
            </button>
          </form>

          <div className="cf-auth-divider">or</div>

          <button
            onClick={signInWithGoogle}
            disabled={busy}
            data-testid="login-google"
            className="cf-btn cf-btn-light w-full"
          >
            <GoogleIcon width={16} height={16} />
            Continue with Google
          </button>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-[var(--ink-faint)]">
            Sessions are server-side and secure. Nothing auth-related is stored
            in your browser&apos;s local storage.
          </p>
        </div>
      </div>
    </div>
  );
}
