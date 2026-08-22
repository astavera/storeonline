/** Read-only analytics from local Square and returns mirrors. */

import { requireAdminSession } from "@/server/admin/admin-session";
import {
  parseAdminAnalyticsDateRange,
  readAdminAnalytics,
  type AdminAnalyticsDataState,
  type AdminAnalyticsMetric
} from "@/server/admin/admin-analytics-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminAnalyticsPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireAdminSession({ capability: "analytics:read", returnTo: "/admin/analytics" });
  const query = await searchParams;
  const parsedRange = parseAdminAnalyticsDateRange(query);
  const report = parsedRange.ok ? await readAdminAnalytics(parsedRange.range) : null;
  const canExport = session.capabilities.includes("admin:*") || session.capabilities.includes("analytics:export");

  return (
    <main className="grid gap-6 p-5 sm:p-7" data-store-area="Admin" data-store-component="AdminAnalytics" data-store-section="admin.analytics">
      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="text-2xl font-semibold text-primary">Store analytics</h2>
          {report ? <StatePill state={report.state} /> : null}
        </div>
        <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
          <label className="grid gap-1.5 text-sm font-medium text-primary">From<input className="min-h-11 rounded-md border border-border bg-white px-3" defaultValue={parsedRange.ok ? parsedRange.range.from : query.from} max={new Date().toISOString().slice(0, 10)} name="from" required type="date" /></label>
          <label className="grid gap-1.5 text-sm font-medium text-primary">To<input className="min-h-11 rounded-md border border-border bg-white px-3" defaultValue={parsedRange.ok ? parsedRange.range.to : query.to} max={new Date().toISOString().slice(0, 10)} name="to" required type="date" /></label>
          <button className="min-h-11 rounded-md bg-primary px-5 text-sm font-semibold text-white" type="submit">Apply range</button>
          {canExport && parsedRange.ok ? <a className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-5 text-sm font-semibold text-primary" href={`/api/admin/analytics?from=${parsedRange.range.from}&to=${parsedRange.range.to}&format=csv`}>Export CSV</a> : null}
        </form>
        {!parsedRange.ok ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">{parsedRange.message}</p> : null}
        {report ? <p className="mt-4 text-xs text-secondary">UTC dates · Generated {formatDateTime(report.generatedAt)}</p> : null}
      </section>

      {report ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Analytics metrics">
            <MetricCard label="Gross mirrored sales" metric={report.metrics.grossSalesCents} money />
            <MetricCard label="Known net sales" metric={report.metrics.netSalesCents} money />
            <MetricCard label="Paid orders" metric={report.metrics.paidOrderCount} />
            <MetricCard label="Average order value" metric={report.metrics.averageOrderValueCents} money />
            <MetricCard label="Return requests" metric={report.metrics.returnRequestCount} />
            <MetricCard label="Open returns" metric={report.metrics.openReturnRequestCount} />
            <MetricCard label="Known completed refunds" metric={report.metrics.completedRefundCount} />
            <MetricCard label="Known refunded amount" metric={report.metrics.completedRefundCents} money />
          </section>

          <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-primary">Data sources</h3>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {report.sources.map((source) => <article className="rounded-lg border border-border p-4" key={source.id}><div className="flex items-start justify-between gap-3"><p className="font-semibold text-primary">{source.label}</p><StatePill state={source.state} /></div><p className="mt-3 text-sm leading-6 text-secondary">{source.note}</p></article>)}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
            <div><h3 className="text-lg font-semibold text-primary">Daily mirror activity</h3><p className="mt-1 text-sm text-secondary">Gross totals use order creation date; known refunds use the last locally recorded refund-state date.</p></div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead><tr className="border-b border-border text-xs uppercase tracking-[0.06em] text-secondary"><th className="px-3 py-3">Date</th><th className="px-3 py-3 text-right">Gross</th><th className="px-3 py-3 text-right">Orders</th><th className="px-3 py-3 text-right">Known refunds</th><th className="px-3 py-3 text-right">Refund count</th><th className="px-3 py-3 text-right">Returns</th></tr></thead>
                <tbody>{report.daily.map((row) => <tr className="border-b border-border/70" key={row.date}><td className="px-3 py-3 font-medium text-primary">{row.date}</td><td className="px-3 py-3 text-right">{formatMoney(row.grossSalesCents)}</td><td className="px-3 py-3 text-right">{formatCount(row.paidOrderCount)}</td><td className="px-3 py-3 text-right">{formatMoney(row.knownRefundCents)}</td><td className="px-3 py-3 text-right">{formatCount(row.completedRefundCount)}</td><td className="px-3 py-3 text-right">{formatCount(row.returnRequestCount)}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface-muted p-5">
            <p className="text-sm font-semibold text-primary">Intentionally excluded</p>
            <ul className="mt-3 grid gap-2 text-sm text-secondary">{report.excluded.map((item) => <li key={item}>• {item}</li>)}</ul>
          </section>
        </>
      ) : null}
    </main>
  );
}

function MetricCard({ label, metric, money = false }: { label: string; metric: AdminAnalyticsMetric; money?: boolean }) {
  const value = metric.value === null ? "Unavailable" : money ? formatMoney(metric.value) : formatCount(metric.value);
  return <article className="rounded-xl border border-border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-secondary">{label}</p><StatePill state={metric.state} /></div><p className="mt-3 text-2xl font-semibold text-primary">{value}</p><p className="mt-3 text-xs leading-5 text-secondary">{metric.note}</p></article>;
}

function StatePill({ state }: { state: AdminAnalyticsDataState }) {
  const style = state === "available" ? "bg-emerald-50 text-emerald-800" : state === "partial" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-900";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{state}</span>;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(value));
}
