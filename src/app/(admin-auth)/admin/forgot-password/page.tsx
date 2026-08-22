/** Store Admin password recovery request page. */

import type { Metadata } from "next";
import { AdminForgotPasswordForm } from "@/components/admin/admin-forgot-password-form";
import { isAdminPasswordResetEmailConfigured } from "@/server/admin/identity/admin-password-reset-service";

export const metadata: Metadata = { title: "Forgot Admin password", robots: { index: false, follow: false, noarchive: true, nocache: true } };

export default function AdminForgotPasswordPage() {
  return <main className="grid min-h-screen place-items-center bg-surface-muted p-5"><section className="w-full max-w-lg rounded-xl border border-border bg-white p-7 shadow-sm sm:p-9"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">Modern State</p><h1 className="mt-2 font-display text-3xl font-semibold text-primary">Forgot your password?</h1><p className="mb-7 mt-2 text-sm leading-6 text-secondary">Request a private, single-use link for your Store Admin account.</p><AdminForgotPasswordForm emailConfigured={isAdminPasswordResetEmailConfigured()} /></section></main>;
}
