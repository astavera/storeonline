/** One-time Store Admin invitation activation page. */

import type { Metadata } from "next";
import { AdminActivationForm } from "@/components/admin/admin-activation-form";
import { readAdminInvitation } from "@/server/admin/identity/admin-activation-service";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};

export default async function AdminActivatePage({ searchParams }: { searchParams?: Promise<{ token?: string }> }) {
  const token = (await searchParams)?.token?.trim() ?? "";
  const invitation = await readAdminInvitation(token).catch(() => null);

  return (
    <main className="grid min-h-screen place-items-center bg-surface-muted p-5">
      <section className="w-full max-w-lg rounded-xl border border-border bg-white p-7 shadow-sm sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">Modern State</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-primary">Activate Admin access</h1>
        <p className="mb-7 mt-2 text-sm leading-6 text-secondary">Create a password and enroll an authenticator before your account becomes active.</p>
        <AdminActivationForm invitation={invitation} token={token} />
      </section>
    </main>
  );
}
