/**
 * Renders the admin login page and prepares its route-level data.
 */

import type { Metadata } from "next";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { safeAdminReturnTo } from "@/lib/security/admin-return-to";
import { isAdminLoginConfigured } from "@/server/admin/admin-login";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};

export default async function AdminLoginPage({ searchParams }: { searchParams?: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const returnTo = safeAdminReturnTo(params?.next);

  return (
    <main className="grid min-h-screen place-items-center bg-surface-muted p-5">
      <section className="w-full max-w-md rounded-xl border border-border bg-surface p-7 shadow-sm sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">Modern State</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-primary">Admin login</h1>
        <p className="mb-7 mt-2 text-sm text-secondary">Sign in to manage the website and catalog.</p>
        <AdminLoginForm configured={isAdminLoginConfigured()} returnTo={returnTo} />
      </section>
    </main>
  );
}
