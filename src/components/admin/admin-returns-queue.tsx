/** Read-only Returns tab over the persisted RMA queue. */

import Link from "next/link";
import type { AdminReturnQueue } from "@/server/admin/admin-returns-service";

export type AdminReturnsQuery = { q?: string; status?: string; page?: string };

export function AdminReturnsQueue({ params, queue }: { params: AdminReturnsQuery; queue: AdminReturnQueue }) {
  return (
    <main className="grid gap-6 p-5 sm:p-7">
      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Customer support</p>
          <h2 className="mt-2 text-2xl font-semibold text-primary">Returns</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary">Review return requests and refund estimates here. Fulfillment execution remains in Operations, Shippo owns labels and tracking, and Square remains the only refund executor.</p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="All requests" value={queue.total} />
          {Object.entries(queue.statusCounts).slice(0, 3).map(([status, value]) => <Metric key={status} label={labelStatus(status)} value={value} />)}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-white shadow-sm">
        <form action="/admin/orders" className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row" method="get">
          <input name="tab" type="hidden" value="returns" />
          <input className="admin-form-control flex-1" defaultValue={params.q} maxLength={100} name="q" placeholder="Search RMA, order, or tracking" />
          <select className="admin-form-control sm:w-56" defaultValue={params.status ?? ""} name="status"><option value="">All statuses</option>{Object.keys(queue.statusCounts).map((status) => <option key={status} value={status}>{labelStatus(status)}</option>)}</select>
          <button className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white" type="submit">Filter</button>
        </form>
        {!queue.available ? <p className="m-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">The return database is unavailable. No queue state is being inferred.</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-[0.08em] text-secondary"><tr><th className="px-5 py-3">Return</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Refund estimate</th><th className="px-4 py-3">Shipment</th><th className="px-5 py-3">Updated</th></tr></thead>
            <tbody className="divide-y divide-border">
              {queue.requests.map((request) => <tr key={request.id}><td className="px-5 py-4"><strong className="block">{request.rmaNumber}</strong><span className="text-xs text-secondary">Order {request.orderNumber}</span></td><td className="px-4 py-4"><Status value={request.status} /></td><td className="px-4 py-4">{request.itemCount}</td><td className="px-4 py-4">{money(request.finalApprovedRefundCents ?? request.estimatedNetRefundCents, request.currency)}</td><td className="px-4 py-4"><span className="block">{request.carrier || "Not shipped"}</span><span className="text-xs text-secondary">{request.trackingNumber || "No tracking"}</span></td><td className="px-5 py-4 text-secondary">{formatDate(request.updatedAt)}</td></tr>)}
              {queue.available && queue.requests.length === 0 ? <tr><td className="px-5 py-8 text-center text-secondary" colSpan={6}>No returns match these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border p-4 text-sm">
          <span className="text-secondary">Page {queue.page} of {queue.pageCount}</span>
          <div className="flex gap-2">
            {queue.page > 1 ? <Link className="rounded border border-border px-3 py-1.5" href={returnPageHref(params, queue.page - 1)}>Previous</Link> : null}
            {queue.page < queue.pageCount ? <Link className="rounded border border-border px-3 py-1.5" href={returnPageHref(params, queue.page + 1)}>Next</Link> : null}
          </div>
        </div>
      </section>
    </main>
  );
}

export function returnPageHref(params: AdminReturnsQuery, page: number) {
  const query = new URLSearchParams({ tab: "returns" });
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  query.set("page", String(page));
  return `/admin/orders?${query}`;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-border bg-surface-muted p-3"><strong className="block text-xl">{value}</strong><span className="text-xs text-secondary">{label}</span></div>; }
function Status({ value }: { value: string }) { return <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{labelStatus(value)}</span>; }
function labelStatus(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function money(cents: number, currency: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100); }
