/** Client workflow for password setup, TOTP enrollment, and recovery-code handoff. */

"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useState, type FormEvent } from "react";

type Invitation = { email: string; displayName: string | null; role: string; expiresAt: string } | null;

export function AdminActivationForm({ invitation, token }: { invitation: Invitation; token: string }) {
  const [stage, setStage] = useState<"password" | "mfa" | "complete">("password");
  const [secret, setSecret] = useState("");
  const [provisioningUri, setProvisioningUri] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!invitation) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">This invitation is invalid or expired. Ask an Owner to create a new invitation.</div>;
  }

  async function setup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) return setError("Passwords do not match.");
    setSubmitting(true);
    try {
      const result = await activationRequest({ action: "setup", token, password });
      const nextSecret = String(result.secret ?? "");
      const nextProvisioningUri = String(result.provisioningUri ?? "");
      if (!nextSecret || !nextProvisioningUri.startsWith("otpauth://totp/")) {
        throw new Error("Authenticator setup could not be prepared.");
      }
      setSecret(nextSecret);
      setProvisioningUri(nextProvisioningUri);
      setStage("mfa");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Activation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const form = new FormData(event.currentTarget);
      const result = await activationRequest({ action: "confirm", token, code: form.get("code") });
      setRecoveryCodes(Array.isArray(result.recoveryCodes) ? result.recoveryCodes.map(String) : []);
      setSecret("");
      setProvisioningUri("");
      setStage("complete");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "MFA confirmation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm">
        <strong className="block text-primary">{invitation.displayName || invitation.email}</strong>
        <span className="mt-1 block text-secondary">{invitation.email} · {invitation.role.toLowerCase().replaceAll("_", " ")}</span>
      </div>

      {stage === "password" ? (
        <form className="grid gap-4" onSubmit={setup}>
          <label className="grid gap-2 text-sm font-semibold">Password<input autoComplete="new-password" className="admin-form-control" minLength={12} name="password" required type="password" /></label>
          <label className="grid gap-2 text-sm font-semibold">Confirm password<input autoComplete="new-password" className="admin-form-control" minLength={12} name="confirmPassword" required type="password" /></label>
          <p className="text-xs leading-5 text-secondary">Use at least 12 characters. This invitation expires {formatDate(invitation.expiresAt)}.</p>
          <SubmitButton disabled={submitting}>Continue to authenticator</SubmitButton>
        </form>
      ) : null}

      {stage === "mfa" ? (
        <form className="grid gap-4" onSubmit={confirm}>
          <div className="grid gap-5 rounded-lg border border-border p-4 text-sm sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="mx-auto rounded-xl border border-border bg-white p-3 shadow-sm sm:mx-0">
              <QRCodeSVG
                aria-label="Scan this QR code with your authenticator app"
                bgColor="#ffffff"
                fgColor="#111827"
                level="M"
                marginSize={2}
                role="img"
                size={196}
                title="Modern State Admin authenticator setup"
                value={provisioningUri}
              />
            </div>
            <div>
              <strong className="block text-base text-primary">Scan with your authenticator app</strong>
              <ol className="mt-2 list-decimal space-y-1 pl-5 leading-6 text-secondary">
                <li>Open Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden, or another TOTP app.</li>
                <li>Choose Add account, then scan the QR code.</li>
                <li>Enter the current 6-digit code below.</li>
              </ol>
              <p className="mt-3 text-xs leading-5 text-secondary">Cannot scan it? Choose manual setup and enter this key:</p>
              <code className="mt-2 block break-all rounded bg-surface-muted p-3 text-center text-sm font-semibold tracking-widest">{secret}</code>
            </div>
          </div>
          <label className="grid gap-2 text-sm font-semibold">6-digit authenticator code<input autoComplete="one-time-code" className="admin-form-control" inputMode="numeric" maxLength={6} minLength={6} name="code" pattern="[0-9]{6}" required /></label>
          <SubmitButton disabled={submitting}>Verify and activate</SubmitButton>
        </form>
      ) : null}

      {stage === "complete" ? (
        <div className="grid gap-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><strong>Account activated.</strong> Save these one-time recovery codes now; they will not be shown again.</div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-muted p-4 font-mono text-sm">{recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div>
          <Link className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white" href="/admin/login">Continue to login</Link>
        </div>
      ) : null}

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">{error}</p> : null}
    </div>
  );
}

async function activationRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/auth/activate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as Record<string, unknown> & { ok?: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error || "Activation failed.");
  return result;
}

function SubmitButton({ children, disabled }: { children: string; disabled: boolean }) {
  return <button className="min-h-12 rounded-md bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={disabled} type="submit">{disabled ? "Please wait…" : children}</button>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
