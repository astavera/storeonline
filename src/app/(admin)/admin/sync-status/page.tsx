/** Read-only integration configuration, freshness, and failure health. */

import { requireAdminSession } from "@/server/admin/admin-session";
import { readAdminIntegrationHealth, type IntegrationHealthState } from "@/server/admin/admin-integration-health";

export default async function AdminSyncStatusPage() {
  await requireAdminSession({ capability: "integrations:read", returnTo: "/admin/sync-status" });
  const health = await readAdminIntegrationHealth();

  return (
    <main className="grid gap-6 p-5 sm:p-7">
      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">System status</p>
        <h2 className="mt-2 text-2xl font-semibold text-primary">Integration health</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary">Configuration, data freshness and failures from the systems that actually own each operation. Credential values are never displayed.</p>
        <p className="mt-4 text-xs text-secondary">Checked {formatDate(health.checkedAt)}</p>
      </section>
      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {health.items.map((item) => (
          <article className="rounded-xl border border-border bg-white p-5 shadow-sm" key={item.id}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary">{item.authority}</p><h3 className="mt-1 font-semibold text-primary">{item.label}</h3></div><HealthPill state={item.state} /></div>
            <p className="mt-4 text-sm leading-6 text-secondary">{item.summary}</p>
            <p className="mt-4 text-xs text-secondary">{item.lastEventAt ? `Last event ${formatDate(item.lastEventAt)}` : "No event timestamp available"}</p>
          </article>
        ))}
      </section>
      <section className="rounded-xl border border-border bg-surface-muted p-5 text-sm text-secondary">
        Retries are intentionally not exposed until each provider operation has a verified idempotency contract. This page does not write prices, inventory, taxes, payments, refunds, fulfillment states or shipping labels.
      </section>
    </main>
  );
}

function HealthPill({ state }: { state: IntegrationHealthState }) {
  const style = state === "healthy" ? "bg-emerald-50 text-emerald-800" : state === "warning" ? "bg-amber-50 text-amber-900" : state === "unavailable" ? "bg-red-50 text-red-900" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{state}</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(value));
}
