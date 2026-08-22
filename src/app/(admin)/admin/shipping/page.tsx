/** Read-only shipping configuration, health, and Operations handoff. */

import { ExternalLink } from "lucide-react";
import { requireAdminSession } from "@/server/admin/admin-session";
import {
  readAdminShippingHealth,
  type ShippingHealthState
} from "@/server/admin/admin-shipping-health";

export default async function AdminShippingPage() {
  await requireAdminSession({ capability: "integrations:read", returnTo: "/admin/shipping" });
  const health = readAdminShippingHealth();

  return (
    <main className="grid gap-6 p-5 sm:p-7" data-store-area="Admin" data-store-component="AdminShippingHealth" data-store-section="admin.shipping">
      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Read-only configuration</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-primary">Shipping health</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary">Shippo configuration and the Operations shipping contract. Credentials, rates, customer addresses and label actions are never exposed here.</p>
          </div>
          <StatusPill state={health.shippingCheckoutReady ? "READY" : "INCOMPLETE"} />
        </div>
        <p className="mt-4 text-xs text-secondary">Checked {formatDate(health.checkedAt)}</p>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary">Shippo</p><h3 className="mt-1 text-lg font-semibold text-primary">Carrier configuration</h3></div>
            <StatusPill state={health.shippo.state} />
          </div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <Fact label="Mode" value={health.shippo.mode} />
            <Fact label="Credential" value={labelValue(health.shippo.credentialState)} />
            <Fact label="Product eligibility" value="Published catalog policies" />
            <Fact label="Package data" value="Per product" />
            <Fact label="Webhook secret" value={yesNo(health.shippo.webhookConfigured)} />
            <Fact label="Allowed carriers" value={health.shippo.allowedCarriers.join(", ") || "None configured"} />
          </dl>
          <div className="mt-5 rounded-lg border border-border bg-surface-muted p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary">Redacted origin</p>
            <p className="mt-2 text-sm font-medium text-primary">{health.shippo.origin.label ?? "Name not configured"}</p>
            <p className="mt-1 text-sm text-secondary">{health.shippo.origin.street}</p>
            <p className="mt-1 text-sm text-secondary">{health.shippo.origin.locality ?? "Locality not configured"}</p>
            <p className="mt-2 text-xs text-secondary">Phone {yesNo(health.shippo.origin.phoneConfigured)} · Email {yesNo(health.shippo.origin.emailConfigured)}</p>
          </div>
          <MissingConfiguration items={health.shippo.missingConfiguration} />
        </article>

        <article className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary">Operations</p><h3 className="mt-1 text-lg font-semibold text-primary">Shipping contract</h3></div>
            <StatusPill state={health.orderPro.state} />
          </div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <Fact label="Checkout switch" value={health.orderPro.checkoutEnabled ? "Enabled" : "Disabled"} />
            <Fact label="Allocation preview" value={yesNo(health.orderPro.allocationContractConfigured)} />
            <Fact label="Shipping order contract" value={yesNo(health.orderPro.shippingOrderContractConfigured)} />
            <Fact label="System of record" value="Operations" />
          </dl>
          <MissingConfiguration items={health.orderPro.missingConfiguration} />
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-sm font-semibold text-primary">Operations handoff</p>
            <p className="mt-2 text-sm leading-6 text-secondary">Open the external Operations workspace for fulfillment queues, packing, labels and status changes.</p>
            {health.handoff.available && health.handoff.url ? (
              <a className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90" href={health.handoff.url} rel="noreferrer" target="_blank">Open Operations <ExternalLink aria-hidden="true" className="ml-2" size={16} /></a>
            ) : (
              <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{health.handoff.reason === "INVALID_DESTINATION" ? "The Operations admin destination is not approved." : "The Operations admin destination is not configured."}</p>
            )}
          </div>
        </article>
      </section>

      <section className="rounded-xl border border-border bg-surface-muted p-5">
        <p className="text-sm font-semibold text-primary">Authority boundaries</p>
        <ul className="mt-3 grid gap-2 text-sm text-secondary">
          {health.boundaries.map((boundary) => <li key={boundary}>• {boundary}</li>)}
        </ul>
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-[0.07em] text-secondary">{label}</dt><dd className="mt-1 font-medium text-primary">{value}</dd></div>;
}

function MissingConfiguration({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="mt-5 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Required configuration is complete.</p>;
  return <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p className="font-semibold">Configuration needed</p><ul className="mt-2 grid gap-1">{items.map((item) => <li key={item}>• {item}</li>)}</ul></div>;
}

function StatusPill({ state }: { state: ShippingHealthState }) {
  const style = state === "READY" ? "bg-emerald-50 text-emerald-800" : state === "TEST" ? "bg-blue-50 text-blue-800" : state === "INCOMPLETE" ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{labelValue(state)}</span>;
}

function labelValue(value: string) {
  return value.toLowerCase().split("_").map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join(" ");
}

function yesNo(value: boolean) {
  return value ? "Configured" : "Not configured";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(value));
}
