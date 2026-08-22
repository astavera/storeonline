/**
 * Presents Square sales KPIs, channel attribution and return signals without exposing mutations.
 */

"use client";

import { Banknote, ExternalLink, LoaderCircle, RefreshCw, RotateCcw, ShoppingBag, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminOrderRange, AdminOrdersAnalytics, AdminOrdersBreakdown } from "@/server/admin/admin-orders-analytics";

type OrdersResponse = {
  ok: boolean;
  analytics?: AdminOrdersAnalytics;
  error?: string;
};

const rangeOptions: Array<{ value: AdminOrderRange; label: string }> = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" }
];

export function AdminOrdersDashboard({ orderProUrl }: { orderProUrl?: string }) {
  const [range, setRange] = useState<AdminOrderRange>("30d");
  const [analytics, setAnalytics] = useState<AdminOrdersAnalytics | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/admin/orders?range=${range}`, { cache: "no-store", signal: controller.signal })
      .then(readOrdersResponse)
      .then((result) => setAnalytics(result))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Sales reporting could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [range, refreshKey]);

  function refresh() {
    setIsLoading(true);
    setError("");
    setRefreshKey((current) => current + 1);
  }

  function selectRange(nextRange: AdminOrderRange) {
    if (nextRange === range) return;
    setIsLoading(true);
    setError("");
    setRange(nextRange);
  }

  return (
    <main className="admin-page admin-orders-page" data-store-component="AdminOrdersDashboard">
      <header className="admin-page-header admin-page-header--actions-only">
        <div className="admin-page-header-actions">
          {orderProUrl ? (
            <a className="admin-button-secondary" href={orderProUrl} rel="noreferrer" target="_blank">Open OrderPRO<ExternalLink aria-hidden="true" size={14} /></a>
          ) : null}
          <button aria-label="Refresh sales reporting" className="admin-icon-button" disabled={isLoading} onClick={refresh} title="Refresh sales reporting" type="button">
            <RefreshCw aria-hidden="true" className={isLoading ? "admin-loading-mark" : ""} size={15} />
          </button>
        </div>
      </header>

      <div aria-label="Reporting period" className="admin-orders-range">
        {rangeOptions.map((option) => (
          <button
            aria-pressed={range === option.value}
            className={range === option.value ? "admin-orders-range-button is-active" : "admin-orders-range-button"}
            disabled={isLoading && range === option.value}
            key={option.value}
            onClick={() => selectRange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
        <span>{analytics ? `Updated ${formatTimestamp(analytics.generatedAt)}` : "Live Square reporting"}</span>
      </div>

      {error ? (
        <section className="admin-panel admin-orders-feedback admin-error-state" role="alert">
          <div>
            <p className="text-sm font-bold">Sales reporting could not be loaded</p>
            <p className="mt-1 text-xs">{error}</p>
            <button className="admin-button-secondary mt-4" onClick={refresh} type="button">Try again</button>
          </div>
        </section>
      ) : null}

      {!error && isLoading && !analytics ? (
        <section className="admin-panel admin-orders-feedback admin-loading-state" role="status">
          <div>
            <LoaderCircle aria-hidden="true" className="admin-loading-mark mx-auto" size={22} />
            <p className="mt-3 text-xs font-semibold text-[#687386]">Loading Square sales and refunds...</p>
          </div>
        </section>
      ) : null}

      {!error && analytics ? (
        <div className={isLoading ? "admin-orders-content is-refreshing" : "admin-orders-content"}>
          <section aria-label={`Sales KPIs for ${analytics.rangeLabel}`} className="admin-metric-grid admin-orders-metrics">
            <OrderMetric icon={<TrendingUp aria-hidden="true" size={15} />} label="Website sales" meta={`${formatCount(analytics.metrics.orderCount)} completed website orders`} value={formatMoney(analytics.metrics.grossSalesCents)} />
            <OrderMetric icon={<Banknote aria-hidden="true" size={15} />} label="Net sales" meta="After completed refunds" value={formatMoney(analytics.metrics.netSalesCents)} />
            <OrderMetric icon={<ShoppingBag aria-hidden="true" size={15} />} label="Orders" meta={`${formatMoney(analytics.metrics.averageOrderCents)} average ticket`} value={formatCount(analytics.metrics.orderCount)} />
            <OrderMetric
              icon={<RotateCcw aria-hidden="true" size={15} />}
              label="Refunds"
              meta={`${formatCount(analytics.metrics.completedRefundCount)} completed · ${formatPercent(analytics.metrics.returnRate)} of orders`}
              tone={analytics.metrics.completedRefundCount > 0 ? "warning" : undefined}
              value={formatMoney(analytics.metrics.completedRefundCents)}
            />
          </section>

          {analytics.truncated ? <p className="admin-orders-data-note">This period contains more records than the reporting safety limit. Use Square for the complete accounting export.</p> : null}

          <div className="admin-orders-insight-grid">
            <BreakdownPanel eyebrow="Payment" empty="No completed website sales in this period." rows={analytics.paymentMethods} title="Sales by payment method" />
            <BreakdownPanel eyebrow="Locations" empty="No location sales in this period." rows={analytics.locations} title="Sales by location" />
          </div>

          <section className="admin-panel admin-orders-returns" aria-labelledby="orders-returns-heading">
            <div className="admin-panel-header">
              <div>
                <p className="admin-eyebrow">Customer service</p>
                <h2 className="admin-section-heading mt-2" id="orders-returns-heading">Returns & refunds</h2>
                <p className="admin-section-note">Return requests come from the website workflow; financial refund status comes from Square.</p>
              </div>
              <span className="admin-status-badge admin-status-badge--neutral">Read only</span>
            </div>

            <div className="admin-orders-return-summary">
              <MiniMetric label="Return requests" value={analytics.returnWorkflowAvailable ? formatCount(analytics.metrics.returnRequestCount) : "Unavailable"} />
              <MiniMetric label="Open requests" value={analytics.returnWorkflowAvailable ? formatCount(analytics.metrics.openReturnRequestCount) : "—"} />
              <MiniMetric label="Completed refunds" value={formatCount(analytics.metrics.completedRefundCount)} />
              <MiniMetric label="Pending refunds" value={formatCount(analytics.metrics.pendingRefundCount)} />
            </div>

            <div className="admin-orders-return-grid">
              <div>
                <h3>Recent return requests</h3>
                {!analytics.returnWorkflowAvailable ? <EmptyLine text="The return workflow database is currently unavailable." /> : null}
                {analytics.returnWorkflowAvailable && analytics.recentReturnRequests.length === 0 ? <EmptyLine text="No return requests in this period." /> : null}
                {analytics.recentReturnRequests.map((request) => (
                  <article className="admin-orders-return-row" key={request.id}>
                    <div>
                      <p>{request.rmaNumber}</p>
                      <span>Order {request.orderNumber} · {formatDate(request.createdAt)}</span>
                    </div>
                    <div className="text-right">
                      <p>{formatMoney(request.amountCents)}</p>
                      <ReturnStatus status={request.status} />
                    </div>
                  </article>
                ))}
              </div>
              <div>
                <h3>Recent Square refunds</h3>
                {analytics.recentRefunds.length === 0 ? <EmptyLine text="No refunds in this period." /> : null}
                {analytics.recentRefunds.map((refund) => (
                  <article className="admin-orders-return-row" key={refund.id}>
                    <div>
                      <p>{refund.location}</p>
                      <span>{refund.reason || "No reason supplied"} · {formatDate(refund.createdAt)}</span>
                    </div>
                    <div className="text-right">
                      <p>{formatMoney(refund.amountCents)}</p>
                      <ReturnStatus status={refund.status} />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="admin-panel admin-orders-recent" aria-labelledby="recent-sales-heading">
            <div className="admin-panel-header">
              <div>
                <p className="admin-eyebrow">Activity</p>
                <h2 className="admin-section-heading mt-2" id="recent-sales-heading">Recent website sales</h2>
              </div>
              <span className="admin-section-note">{analytics.rangeLabel}</span>
            </div>
            {analytics.recentSales.length === 0 ? <div className="admin-empty-state"><EmptyLine text="No completed website sales in this period." /></div> : null}
            {analytics.recentSales.length > 0 ? (
              <div className="admin-products-table-wrap admin-orders-table-wrap">
                <table className="admin-products-table admin-orders-table">
                  <thead><tr><th>Receipt</th><th>Date</th><th>Channel</th><th>Location</th><th>Payment</th><th className="text-right">Amount</th><th className="text-right">Refunded</th></tr></thead>
                  <tbody>
                    {analytics.recentSales.map((sale) => (
                      <tr key={sale.id}>
                        <td className="admin-orders-receipt">{sale.receiptNumber}</td>
                        <td>{formatDate(sale.createdAt)}</td>
                        <td>{sale.channel}</td>
                        <td>{sale.location}</td>
                        <td>{sale.paymentMethod}</td>
                        <td className="admin-orders-money">{formatMoney(sale.amountCents)}</td>
                        <td className="admin-orders-money">{sale.refundedCents > 0 ? formatMoney(sale.refundedCents) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="admin-orders-mobile-sales">
              {analytics.recentSales.map((sale) => (
                <article key={sale.id}>
                  <div><p>{sale.receiptNumber}</p><span>{sale.channel} · {sale.location}</span></div>
                  <div className="text-right"><p>{formatMoney(sale.amountCents)}</p><span>{formatDate(sale.createdAt)}</span></div>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function OrderMetric({ icon, label, meta, tone, value }: { icon: React.ReactNode; label: string; meta: string; tone?: "warning"; value: string }) {
  return <article className={tone ? `admin-metric-card admin-orders-metric--${tone}` : "admin-metric-card"}><p className="admin-metric-label">{icon}{label}</p><p className="admin-metric-value">{value}</p><p className="admin-metric-meta">{meta}</p></article>;
}

function BreakdownPanel({ eyebrow, empty, rows, title }: { eyebrow: string; empty: string; rows: AdminOrdersBreakdown[]; title: string }) {
  return (
    <section className="admin-panel admin-orders-breakdown">
      <div className="admin-panel-header"><div><p className="admin-eyebrow">{eyebrow}</p><h2 className="admin-section-heading mt-2">{title}</h2></div></div>
      {rows.length === 0 ? <EmptyLine text={empty} /> : null}
      <div className="admin-orders-breakdown-list">
        {rows.slice(0, 8).map((row) => (
          <article key={row.key}>
            <div className="admin-orders-breakdown-copy"><div><p>{row.label}</p><span>{formatCount(row.orderCount)} orders</span></div><div className="text-right"><p>{formatMoney(row.salesCents)}</p><span>{formatPercent(row.share)}</span></div></div>
            <div className="admin-orders-breakdown-track"><span style={{ width: `${Math.max(2, Math.min(100, row.share * 100))}%` }} /></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div><p>{label}</p><strong>{value}</strong></div>;
}

function EmptyLine({ text }: { text: string }) {
  return <p className="admin-orders-empty">{text}</p>;
}

function ReturnStatus({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const tone = normalized === "COMPLETED" || normalized === "REFUNDED"
    ? "good"
    : normalized === "FAILED" || normalized === "REJECTED" || normalized === "EXCEPTION"
      ? "danger"
      : normalized === "PENDING" || normalized.includes("REVIEW")
        ? "warning"
        : "neutral";
  return <span className={`admin-status-badge admin-status-badge--${tone}`}>{statusLabel(status)}</span>;
}

async function readOrdersResponse(response: Response): Promise<AdminOrdersAnalytics> {
  let result: OrdersResponse;
  try {
    result = await response.json() as OrdersResponse;
  } catch {
    throw new Error("The sales service returned an invalid response.");
  }
  if (!response.ok || !result.ok || !result.analytics) throw new Error(result.error || "Sales reporting could not be loaded.");
  return result.analytics;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function statusLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
