/**
 * Renders the admin login page and prepares its route-level data.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { safeAdminReturnTo } from "@/lib/security/admin-return-to";
import { isAdminLoginConfigured } from "@/server/admin/admin-login";
import { isDatabaseAdminIdentityEnabled } from "@/server/admin/identity/admin-database-login";

export const metadata: Metadata = {
  title: "Secure Admin sign in",
  description: "Authorized staff access to Modern State Store Admin.",
  robots: { index: false, follow: false, noarchive: true, nocache: true }
};

export default async function AdminLoginPage({ searchParams }: { searchParams?: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const returnTo = safeAdminReturnTo(params?.next);
  const databaseIdentity = isDatabaseAdminIdentityEnabled();
  const configured = isAdminLoginConfigured();

  return (
    <main className="admin-login-page" data-store-area="Admin" data-store-component="AdminLogin">
      <aside className="admin-login-brand-panel">
        <div aria-hidden="true" className="admin-login-orbit" />
        <header className="admin-login-brand-header">
          <div className="admin-login-brand-lockup">
            <span aria-hidden="true" className="admin-login-brand-mark">MS</span>
            <span>
              <strong>Modern State</strong>
              <small>Store administration</small>
            </span>
          </div>
          <span className="admin-login-brand-index">NYC / 01</span>
        </header>

        <div className="admin-login-brand-copy">
          <p>Modern State operations</p>
          <h2>Run the store.<br />Protect the customer.</h2>
        </div>

        <footer className="admin-login-brand-footer">
          <span>Authorized staff only</span>
          <span aria-hidden="true" className="admin-login-signal"><i /><i /><i /></span>
        </footer>
      </aside>

      <div className="admin-login-access-panel">
        <div className="admin-login-access-topbar">
          <span><ShieldCheck aria-hidden="true" size={13} /> Secure staff access</span>
          <Link href="/">
            View store
            <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.8} />
          </Link>
        </div>

        <section aria-labelledby="admin-login-title" className="admin-login-access-card">
          <p className="admin-login-eyebrow">Store Admin</p>
          <h1 id="admin-login-title">Sign in securely.</h1>
          <p className="admin-login-intro">Use your staff account to manage products, orders, customers and storefront content.</p>
          <AdminLoginForm configured={configured} databaseIdentity={databaseIdentity} returnTo={returnTo} />
        </section>
      </div>
    </main>
  );
}
