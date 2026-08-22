/**
 * Renders the admin login form interface and its user interactions.
 */

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowRight, Eye, EyeOff, Info, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";

type LoginResponse = { ok?: boolean; error?: string; returnTo?: string };
type MfaMethod = "authenticator" | "recovery";

export function AdminLoginForm({ configured, databaseIdentity = false, returnTo }: { configured: boolean; databaseIdentity?: boolean; returnTo: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [mfaMethod, setMfaMethod] = useState<MfaMethod>("authenticator");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          mfaCode: databaseIdentity ? form.get("mfaCode") : undefined,
          returnTo
        })
      });
      const result = await readLoginResponse(response);
      if (!response.ok || !result.ok) {
        const retryAfter = readRetryAfter(response);
        setError(`${result.error || "Unable to sign in."}${retryAfter ? ` Try again in ${retryAfter}.` : ""}`);
        return;
      }

      router.replace(result.returnTo || "/admin");
      router.refresh();
    } catch {
      setError("Unable to reach the Admin login.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form aria-busy={submitting} className="admin-login-form" noValidate={false} onSubmit={submit}>
      <label className="admin-login-field">
        <span>Email address</span>
        <input
          aria-describedby={error ? "admin-login-error" : undefined}
          aria-invalid={Boolean(error)}
          autoCapitalize="none"
          autoComplete="username"
          autoCorrect="off"
          autoFocus
          disabled={!configured || submitting}
          inputMode="email"
          name="email"
          placeholder="name@modernstate.com"
          required
          spellCheck={false}
          type="email"
        />
      </label>
      {databaseIdentity ? (
        <fieldset className="admin-login-mfa-fieldset">
          <legend>Two-step verification</legend>
          <div aria-label="Verification method" className="admin-login-mfa-methods" role="group">
            <button aria-pressed={mfaMethod === "authenticator"} disabled={!configured || submitting} onClick={() => setMfaMethod("authenticator")} type="button">Authenticator</button>
            <button aria-pressed={mfaMethod === "recovery"} disabled={!configured || submitting} onClick={() => setMfaMethod("recovery")} type="button">Recovery code</button>
          </div>
          <label className="admin-login-field">
            <span>{mfaMethod === "authenticator" ? "6-digit authenticator code" : "One-time recovery code"}</span>
            <input
              autoComplete={mfaMethod === "authenticator" ? "one-time-code" : "off"}
              disabled={!configured || submitting}
              inputMode={mfaMethod === "authenticator" ? "numeric" : "text"}
              key={mfaMethod}
              maxLength={mfaMethod === "authenticator" ? 6 : 64}
              minLength={mfaMethod === "authenticator" ? 6 : 1}
              name="mfaCode"
              pattern={mfaMethod === "authenticator" ? "[0-9]{6}" : undefined}
              placeholder={mfaMethod === "authenticator" ? "000000" : "Enter a saved recovery code"}
              required
            />
          </label>
        </fieldset>
      ) : null}
      <label className="admin-login-field">
        <span>Password</span>
        <span className="admin-login-password-control">
          <input autoComplete="current-password" disabled={!configured || submitting} minLength={12} name="password" required type={showPassword ? "text" : "password"} />
          <button aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} disabled={!configured || submitting} onClick={() => setShowPassword((visible) => !visible)} type="button">
            {showPassword ? <EyeOff aria-hidden="true" size={18} strokeWidth={1.7} /> : <Eye aria-hidden="true" size={18} strokeWidth={1.7} />}
          </button>
        </span>
      </label>
      {databaseIdentity ? <Link className="admin-login-forgot-link" href="/admin/forgot-password">Forgot password?</Link> : null}
      {error ? (
        <p className="admin-login-feedback admin-login-feedback--error" id="admin-login-error" role="alert">
          <AlertCircle aria-hidden="true" size={17} />
          <span>{error}</span>
        </p>
      ) : null}
      {!configured ? (
        <p className="admin-login-feedback admin-login-feedback--notice">
          <Info aria-hidden="true" size={17} />
          <span>Admin access is not configured.</span>
        </p>
      ) : null}
      <button className="admin-login-submit" disabled={!configured || submitting} type="submit">
        <span>
          {submitting
            ? <LoaderCircle aria-hidden="true" className="admin-login-spinner" size={16} strokeWidth={1.8} />
            : <LockKeyhole aria-hidden="true" size={16} strokeWidth={1.8} />}
          {submitting ? "Signing in..." : "Sign in"}
        </span>
        <ArrowRight aria-hidden="true" size={17} strokeWidth={1.8} />
      </button>
      <p className="admin-login-trust-note">
        <ShieldCheck aria-hidden="true" size={15} />
        <span>{databaseIdentity ? "Protected by MFA, encrypted sessions and attempt limits." : "Protected by encrypted sessions and attempt limits."}</span>
      </p>
    </form>
  );
}

async function readLoginResponse(response: Response): Promise<LoginResponse> {
  try {
    return await response.json() as LoginResponse;
  } catch {
    return { ok: false, error: response.ok ? "The login service returned an invalid response." : "Unable to sign in." };
  }
}

function readRetryAfter(response: Response) {
  if (response.status !== 429) return "";
  const seconds = Number(response.headers.get("retry-after"));
  if (!Number.isFinite(seconds) || seconds <= 0) return "a few minutes";
  if (seconds < 60) return `${Math.ceil(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
