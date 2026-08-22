/** Email request UI for database-backed Store Admin password recovery. */

"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export function AdminForgotPasswordForm({ emailConfigured }: { emailConfigured: boolean }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email") })
      });
      const result = await response.json() as { ok?: boolean; error?: string; message?: string };
      if (!response.ok || !result.ok) return setError(result.error || "Password recovery is unavailable.");
      setMessage(result.message || "Check your email for a private reset link.");
      event.currentTarget.reset();
    } catch {
      setError("Unable to reach password recovery.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-5">
      {!emailConfigured ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Recovery email delivery is not configured yet. Contact an Owner for a secure reset.</p> : null}
      <form className="grid gap-4" onSubmit={submit}>
        <label className="grid gap-2 text-sm font-semibold">Admin email<input autoComplete="email" className="admin-form-control" disabled={!emailConfigured || submitting} name="email" required type="email" /></label>
        <button className="min-h-12 rounded-md bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={!emailConfigured || submitting} type="submit">{submitting ? "Sending..." : "Send reset link"}</button>
      </form>
      {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950" role="status">{message}</p> : null}
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">{error}</p> : null}
      <Link className="text-sm font-semibold text-primary underline underline-offset-4" href="/admin/login">Return to Admin login</Link>
    </div>
  );
}
