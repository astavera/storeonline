/** Password replacement UI for a validated, single-use Admin reset token. */

"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export function AdminResetPasswordForm({ token, valid }: { token: string; valid: boolean }) {
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!valid) return <div className="grid gap-4"><p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">This password reset link is invalid or expired.</p><Link className="text-sm font-semibold text-primary underline underline-offset-4" href="/admin/forgot-password">Request another reset link</Link></div>;
  if (complete) return <div className="grid gap-4"><p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">Password updated. Existing Admin sessions have been signed out.</p><Link className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white" href="/admin/login">Continue to login</Link></div>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) return setError("Passwords do not match.");
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) return setError(result.error || "Password reset failed.");
      setComplete(true);
    } catch {
      setError("Unable to reach password reset.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <label className="grid gap-2 text-sm font-semibold">New password<input autoComplete="new-password" className="admin-form-control" disabled={submitting} minLength={12} name="password" required type="password" /></label>
      <label className="grid gap-2 text-sm font-semibold">Confirm new password<input autoComplete="new-password" className="admin-form-control" disabled={submitting} minLength={12} name="confirmPassword" required type="password" /></label>
      <p className="text-xs leading-5 text-secondary">Use at least 12 characters. Your authenticator remains required at the next login.</p>
      <button className="min-h-12 rounded-md bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={submitting} type="submit">{submitting ? "Updating..." : "Update password"}</button>
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">{error}</p> : null}
    </form>
  );
}
