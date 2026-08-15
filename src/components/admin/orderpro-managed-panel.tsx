/**
 * Renders the OrderPro managed panel interface and its user interactions.
 */

import { ExternalLink, ShieldCheck } from "lucide-react";
import { SectionFrame } from "@/components/sections/section-frame";

export function OrderProManagedPanel({ description, title }: { description: string; title: string }) {
  const orderProUrl = process.env.ORDERPRO_ADMIN_URL;

  return (
    <main className="p-6">
      <SectionFrame area="Admin" className="surface-card p-6" component="OrderProManagedPanel" sectionId="admin.orderpro" variant="admin-control-editor">
        <div className="mx-auto max-w-2xl py-8">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-blue/10 text-blue"><ShieldCheck aria-hidden="true" size={21} /></span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-blue">Managed by OrderPro</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">{title}</h1>
          <p className="mt-3 text-secondary">{description}</p>
          <p className="mt-3 text-sm text-secondary">This store reads availability and operational status from OrderPro. Changes are intentionally disabled here to avoid duplicate or conflicting records.</p>
          {orderProUrl ? (
            <a className="mt-7 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90" href={orderProUrl} rel="noreferrer" target="_blank">
              Open OrderPro <ExternalLink aria-hidden="true" className="ml-2" size={16} />
            </a>
          ) : (
            <div className="mt-7 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
              Add <code>ORDERPRO_ADMIN_URL</code> to the production environment to enable the OrderPro shortcut.
            </div>
          )}
        </div>
      </SectionFrame>
    </main>
  );
}
