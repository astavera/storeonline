/** Server-rendered, read-only customer and consent directory. */

import Link from "next/link";
import { AdminCustomerPrivacyPanel } from "@/components/admin/admin-customer-privacy-panel";
import type {
  AdminCustomerQuery,
  AdminCustomerSummary,
  AdminCustomerDirectoryResult
} from "@/server/admin/admin-customer-directory-service";
import type { AdminCustomerPrivacyProfile } from "@/server/admin/admin-customer-privacy-service";

export function AdminCustomerDirectory({
  canNote = false,
  canPrivacy = false,
  error,
  query,
  result,
  selectedProfile
}: {
  canNote?: boolean;
  canPrivacy?: boolean;
  error?: string;
  query: AdminCustomerQuery;
  result: AdminCustomerDirectoryResult;
  selectedProfile?: AdminCustomerPrivacyProfile | null;
}) {
  return (
    <main className="admin-page" data-store-component="AdminCustomerDirectory">
      <header className="admin-page-header admin-page-header--actions-only">
        <div className="admin-page-header-actions">
          <span className="admin-status-badge admin-status-badge--neutral">Read only</span>
        </div>
      </header>

      <section aria-labelledby="customer-filters-heading" className="admin-panel p-5">
        <div className="admin-panel-header">
          <div>
            <h2 className="admin-section-heading" id="customer-filters-heading">Customers &amp; privacy</h2>
            <p className="admin-section-note">Support view of account identity, consent history and locally matched activity. No session tokens or payment data are exposed.</p>
          </div>
          <p className="text-xs font-semibold text-secondary">{formatCount(result.pagination.total)} customers</p>
        </div>

        <form action="/admin/customers" className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_220px_180px_auto]" method="get">
          <Field label="Name or email">
            <input className="admin-form-control" defaultValue={query.search} maxLength={160} name="search" placeholder="Search customers" type="search" />
          </Field>
          <Field label="Marketing consent">
            <select className="admin-form-control" defaultValue={query.consent} name="consent">
              <option value="all">All consent states</option>
              <option value="marketing-granted">Opted in</option>
              <option value="marketing-denied">Opted out</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>
          </Field>
          <Field label="Sort">
            <select className="admin-form-control" defaultValue={query.sort} name="sort">
              <option value="recent">Newest customers</option>
              <option value="name">Name</option>
              <option value="last-login">Last login</option>
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <button className="admin-button min-h-11" type="submit">Apply</button>
            <Link className="admin-button-secondary min-h-11" href="/admin/customers">Clear</Link>
          </div>
        </form>
      </section>

      {selectedProfile ? <AdminCustomerPrivacyPanel canNote={canNote} canPrivacy={canPrivacy} profile={selectedProfile} /> : null}

      {error ? (
        <section className="admin-panel admin-error-state mt-4" role="alert">
          <div><p className="text-sm font-bold">Customer directory could not be loaded</p><p className="mt-1 text-xs">{error}</p></div>
        </section>
      ) : null}

      {!error ? (
        <section aria-labelledby="customer-results-heading" className="admin-panel mt-4 overflow-hidden">
          <div className="admin-panel-header p-5">
            <div>
              <h2 className="admin-section-heading" id="customer-results-heading">Customer profiles</h2>
              <p className="admin-section-note">Order counts use the local order mirror. Return counts use privacy-preserving email hashes.</p>
              {result.countSources.returns === "UNAVAILABLE" ? <p className="mt-1 text-xs font-semibold text-amber-800">Return counts are unavailable until the returns security key is configured.</p> : null}
            </div>
            <p className="text-xs font-semibold text-secondary">Page {result.pagination.page} of {result.pagination.pageCount}</p>
          </div>

          {result.customers.length === 0 ? (
            <div className="border-t border-border px-5 py-12 text-center text-sm text-secondary">No customers match these filters.</div>
          ) : (
            <div className="admin-products-table-wrap">
              <table className="admin-products-table">
                <thead><tr><th>Customer</th><th>Consent &amp; privacy</th><th>Activity</th><th>Consent history</th></tr></thead>
                <tbody>{result.customers.map((customer) => <CustomerRow customer={customer} key={customer.id} />)}</tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {!error && result.pagination.pageCount > 1 ? (
        <nav aria-label="Customer directory pages" className="admin-pagination">
          <PageLink disabled={result.pagination.page <= 1} href={buildCustomerHref(query, result.pagination.page - 1)} label="Previous" />
          <p className="admin-pagination-copy">Page {result.pagination.page} of {result.pagination.pageCount}</p>
          <PageLink disabled={result.pagination.page >= result.pagination.pageCount} href={buildCustomerHref(query, result.pagination.page + 1)} label="Next" />
        </nav>
      ) : null}

      <section className="mt-4 rounded-lg border border-border bg-surface-muted p-4 text-xs leading-5 text-secondary">Refunds and financial actions remain outside this module. Data exports and deletion reviews are limited to explicitly authorized privacy administrators and never mutate Square or Operations automatically.</section>
    </main>
  );
}

function CustomerRow({ customer }: { customer: AdminCustomerSummary }) {
  return (
    <tr>
      <td className="min-w-64 align-top">
        <p className="font-semibold text-primary">{customer.displayName}</p>
        <p className="mt-1 text-sm text-secondary">{customer.email}</p>
        <Link className="mt-2 inline-flex text-xs font-semibold underline underline-offset-4" href={`/admin/customers?customerId=${encodeURIComponent(customer.id)}`}>Open profile</Link>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusPill label={customer.squareProfileLinked ? "Square linked" : "Web account"} tone="neutral" />
          <span className="text-xs text-secondary">Customer since {formatDate(customer.activity.customerSince)}</span>
        </div>
      </td>
      <td className="min-w-64 align-top">
        <StatusPill label={marketingLabel(customer.marketing.status)} tone={customer.marketing.status === "OPTED_IN" ? "success" : "neutral"} />
        <p className="mt-3 text-xs text-secondary">Terms {customer.terms.version}</p>
        <p className="mt-1 text-xs text-secondary">Accepted {formatDate(customer.terms.acceptedAt)}</p>
        {customer.marketing.version ? <p className="mt-1 text-xs text-secondary">Marketing policy {customer.marketing.version}</p> : null}
      </td>
      <td className="min-w-44 align-top">
        <p><strong className="text-primary">{customer.activity.localOrderCount}</strong> <span className="text-xs text-secondary">local orders</span></p>
        <p className="mt-2"><strong className="text-primary">{customer.activity.returnRequestCount ?? "—"}</strong> <span className="text-xs text-secondary">return requests</span></p>
        <p className="mt-3 text-xs text-secondary">{customer.activity.lastLoginAt ? `Last login ${formatDate(customer.activity.lastLoginAt)}` : "No recorded login"}</p>
      </td>
      <td className="min-w-64 align-top">
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-primary">{customer.privacy.consentEventCount} recorded events</summary>
          {customer.privacy.recentConsentEvents.length > 0 ? (
            <ol className="mt-3 grid gap-3">
              {customer.privacy.recentConsentEvents.map((event) => (
                <li className="rounded-md border border-border bg-surface-muted p-3 text-xs" key={event.id}>
                  <p className="font-semibold text-primary">{event.type}: {event.granted ? "granted" : "revoked"}</p>
                  <p className="mt-1 text-secondary">{event.policyVersion} · {formatDate(event.occurredAt)}</p>
                  <p className="mt-1 text-secondary">Source: {event.source}</p>
                </li>
              ))}
            </ol>
          ) : <p className="mt-2 text-xs text-secondary">No consent event history.</p>}
        </details>
      </td>
    </tr>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="grid gap-2 text-xs font-semibold text-secondary"><span>{label}</span>{children}</label>;
}

function StatusPill({ label, tone }: { label: string; tone: "neutral" | "success" }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{label}</span>;
}

function PageLink({ disabled, href, label }: { disabled: boolean; href: string; label: string }) {
  return disabled
    ? <span aria-disabled="true" className="admin-button-secondary pointer-events-none opacity-40">{label}</span>
    : <Link className="admin-button-secondary" href={href}>{label}</Link>;
}

function buildCustomerHref(query: AdminCustomerQuery, page: number) {
  const parameters = new URLSearchParams();
  if (query.search) parameters.set("search", query.search);
  if (query.consent !== "all") parameters.set("consent", query.consent);
  if (query.sort !== "recent") parameters.set("sort", query.sort);
  parameters.set("pageSize", String(query.pageSize));
  parameters.set("page", String(Math.max(1, page)));
  return `/admin/customers?${parameters.toString()}`;
}

function marketingLabel(status: AdminCustomerSummary["marketing"]["status"]) {
  if (status === "OPTED_IN") return "Marketing opted in";
  if (status === "UNSUBSCRIBED") return "Marketing unsubscribed";
  return "Marketing opted out";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(value));
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
