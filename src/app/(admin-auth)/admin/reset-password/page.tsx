/** Store Admin password replacement page for a one-time recovery token. */

import type { Metadata } from "next";
import { AdminResetPasswordForm } from "@/components/admin/admin-reset-password-form";
import { readAdminPasswordReset } from "@/server/admin/identity/admin-password-reset-service";

export const metadata: Metadata = { title: "Reset Admin password", robots: { index: false, follow: false, noarchive: true, nocache: true } };

export default async function AdminResetPasswordPage({ searchParams }: { searchParams?: Promise<{ token?: string }> }) {
  const token = (await searchParams)?.token?.trim() ?? "";
  const reset = await readAdminPasswordReset(token).catch(() => null);
  return <main className="grid min-h-screen place-items-center bg-surface-muted p-5"><section className="w-full max-w-lg rounded-xl border border-border bg-white p-7 shadow-sm sm:p-9"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">Modern State</p><h1 className="mt-2 font-display text-3xl font-semibold text-primary">Reset Admin password</h1><p className="mb-7 mt-2 text-sm leading-6 text-secondary">Choose a new password. Your MFA enrollment and recovery codes remain protected.</p><AdminResetPasswordForm token={token} valid={Boolean(reset)} /></section></main>;
}
