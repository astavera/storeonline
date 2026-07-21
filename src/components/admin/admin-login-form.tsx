"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";

export function AdminLoginForm({ configured, returnTo }: { configured: boolean; returnTo: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
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
          returnTo
        })
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; returnTo?: string };
      if (!response.ok || !result.ok) {
        setError(result.error || "Unable to sign in.");
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
    <form className="grid gap-5" onSubmit={submit}>
      <label className="grid gap-2 text-sm font-semibold text-primary">
        Email
        <input autoComplete="username" className="min-h-12 rounded-md border border-border bg-white px-4 outline-none focus:border-primary" disabled={!configured || submitting} name="email" required type="email" />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-primary">
        Password
        <input autoComplete="current-password" className="min-h-12 rounded-md border border-border bg-white px-4 outline-none focus:border-primary" disabled={!configured || submitting} minLength={12} name="password" required type="password" />
      </label>
      {error ? <p aria-live="polite" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p> : null}
      {!configured ? <p className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">Admin credentials are not configured yet.</p> : null}
      <button className="inline-flex min-h-12 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50" disabled={!configured || submitting} type="submit">
        <LockKeyhole aria-hidden="true" className="mr-2" size={17} />
        {submitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
