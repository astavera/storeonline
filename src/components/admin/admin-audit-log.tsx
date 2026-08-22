/** Presents the immutable audit trail with bounded, server-backed filters. */

import Link from "next/link";
import type { AdminAuditLogQuery, AdminAuditLogResult } from "@/server/admin/admin-audit-log-service";

export function AdminAuditLog({
  canExport,
  error,
  query,
  result
}: {
  canExport: boolean;
  error?: string;
  query: AdminAuditLogQuery;
  result: AdminAuditLogResult;
}) {
  const { entries, pagination } = result;

  return (
    <main className="admin-page" data-store-component="AdminAuditLog">
      <header className="admin-page-header admin-page-header--actions-only">
        <div className="admin-page-header-actions">
          <span className="admin-status-badge admin-status-badge--neutral">Read only</span>
          {canExport ? <a className="admin-button-secondary" href={buildAuditLogExportHref(query)}>Export CSV</a> : null}
        </div>
      </header>

      <section aria-labelledby="audit-filters-heading" className="admin-panel p-5">
        <div className="admin-panel-header">
          <div>
            <h2 className="admin-section-heading" id="audit-filters-heading">Filter activity</h2>
            <p className="admin-section-note">Search immutable events by action, resource, actor, or UTC date.</p>
          </div>
          <p className="text-xs font-semibold text-secondary">{formatCount(pagination.total)} events</p>
        </div>

        <form action="/admin/audit-log" className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6" method="get">
          <AuditFilter defaultValue={query.action} label="Action" name="action" placeholder="publish, update…" />
          <AuditFilter defaultValue={query.entityType} label="Resource type" name="entityType" placeholder="product, policy…" />
          <AuditFilter defaultValue={query.actor} label="Actor" name="actor" placeholder="Name, email, or ID" />
          <AuditFilter defaultValue={query.from} label="From" name="from" type="date" />
          <AuditFilter defaultValue={query.to} label="To" name="to" type="date" />
          <label className="grid gap-2 text-xs font-semibold text-secondary">
            Results per page
            <select className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-primary" defaultValue={String(query.pageSize)} name="pageSize">
              {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2 xl:col-span-6">
            <button className="admin-button" type="submit">Apply filters</button>
            <Link className="admin-button-secondary" href="/admin/audit-log">Clear</Link>
          </div>
        </form>
      </section>

      {error ? (
        <section className="admin-panel admin-error-state mt-4" role="alert">
          <div>
            <p className="text-sm font-bold">Audit activity could not be loaded</p>
            <p className="mt-1 text-xs">{error}</p>
          </div>
        </section>
      ) : null}

      {!error ? (
        <section aria-labelledby="audit-events-heading" className="admin-panel mt-4 overflow-hidden">
          <div className="admin-panel-header p-5">
            <div>
              <h2 className="admin-section-heading" id="audit-events-heading">Recorded events</h2>
              <p className="admin-section-note">Newest activity appears first. Sensitive snapshot fields are redacted.</p>
            </div>
            <p className="text-xs font-semibold text-secondary">Page {pagination.page} of {pagination.pageCount}</p>
          </div>

          {entries.length === 0 ? (
            <div className="border-t border-border px-5 py-12 text-center text-sm text-secondary">No audit events match these filters.</div>
          ) : (
            <div className="admin-products-table-wrap">
              <table className="admin-products-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap align-top">
                        <time dateTime={entry.createdAt}>{formatTimestamp(entry.createdAt)}</time>
                      </td>
                      <td className="align-top">
                        <p className="font-semibold text-primary">{entry.actor?.displayName || entry.actor?.email || "System"}</p>
                        <p className="mt-1 max-w-56 truncate text-xs text-secondary" title={entry.actor?.email || entry.actorId || undefined}>
                          {entry.actor?.email || entry.actorId || "Automated event"}
                        </p>
                      </td>
                      <td className="align-top"><code className="text-xs font-semibold text-primary">{entry.action}</code></td>
                      <td className="align-top">
                        <p className="font-semibold text-primary">{entry.entityType}</p>
                        <p className="mt-1 max-w-56 truncate text-xs text-secondary" title={entry.entityId || undefined}>{entry.entityId || "No entity ID"}</p>
                      </td>
                      <td className="min-w-56 align-top">
                        <AuditSnapshots after={entry.after} before={entry.before} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {!error && pagination.pageCount > 1 ? (
        <nav aria-label="Audit log pages" className="admin-pagination">
          <PaginationLink disabled={pagination.page <= 1} href={buildAuditLogHref(query, pagination.page - 1)} label="Previous" />
          <p className="admin-pagination-copy">Page {pagination.page} of {pagination.pageCount}</p>
          <PaginationLink disabled={pagination.page >= pagination.pageCount} href={buildAuditLogHref(query, pagination.page + 1)} label="Next" />
        </nav>
      ) : null}
    </main>
  );
}

function AuditFilter({
  defaultValue,
  label,
  name,
  placeholder,
  type = "text"
}: {
  defaultValue: string;
  label: string;
  name: string;
  placeholder?: string;
  type?: "date" | "text";
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-secondary">
      {label}
      <input
        className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-primary placeholder:text-secondary/70"
        defaultValue={defaultValue}
        name={name}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

function AuditSnapshots({ after, before }: { after: unknown; before: unknown }) {
  if (before === null && after === null) return <span className="text-xs text-secondary">No snapshot</span>;

  return (
    <details>
      <summary className="cursor-pointer text-xs font-semibold text-primary">Review before / after</summary>
      <div className="mt-3 grid max-w-xl gap-3 lg:grid-cols-2">
        <Snapshot label="Before" value={before} />
        <Snapshot label="After" value={after} />
      </div>
    </details>
  );
}

function Snapshot({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-muted p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-secondary">{label}</p>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-primary">{formatSnapshot(value)}</pre>
    </div>
  );
}

function PaginationLink({ disabled, href, label }: { disabled: boolean; href: string; label: string }) {
  return disabled
    ? <span aria-disabled="true" className="admin-button-secondary pointer-events-none opacity-40">{label}</span>
    : <Link className="admin-button-secondary" href={href}>{label}</Link>;
}

function buildAuditLogHref(query: AdminAuditLogQuery, page: number) {
  const parameters = new URLSearchParams();
  if (query.action) parameters.set("action", query.action);
  if (query.entityType) parameters.set("entityType", query.entityType);
  if (query.actor) parameters.set("actor", query.actor);
  if (query.from) parameters.set("from", query.from);
  if (query.to) parameters.set("to", query.to);
  parameters.set("pageSize", String(query.pageSize));
  parameters.set("page", String(Math.max(1, page)));
  return `/admin/audit-log?${parameters.toString()}`;
}

function buildAuditLogExportHref(query: AdminAuditLogQuery) {
  const href = buildAuditLogHref(query, 1);
  return `${href}&format=csv`;
}

function formatSnapshot(value: unknown) {
  return value === null ? "No data" : JSON.stringify(value, null, 2);
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York"
  }).format(new Date(value));
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
