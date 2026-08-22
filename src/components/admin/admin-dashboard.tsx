/**
 * Renders the permission-aware admin overview from existing read-only sources.
 */

"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  Database,
  ImageOff,
  PencilRuler,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Truck,
  UsersRound
} from "lucide-react";
import type { SquareCatalogCacheSummary } from "@/features/catalog/square-catalog-cache";

type DashboardCatalogResponse = {
  ok: boolean;
  error?: string;
  summary: SquareCatalogCacheSummary;
  total: number;
};

type DashboardCatalogData = {
  summary: SquareCatalogCacheSummary;
  missingImageCount: number;
};

type DashboardDataState = "available" | "partial" | "unavailable";

type DashboardAnalyticsMetric = {
  value: number | null;
  state: DashboardDataState;
  note: string;
};

type DashboardAnalyticsReport = {
  range: {
    from: string;
    to: string;
  };
  state: DashboardDataState;
  metrics: {
    grossSalesCents: DashboardAnalyticsMetric;
    paidOrderCount: DashboardAnalyticsMetric;
    averageOrderValueCents: DashboardAnalyticsMetric;
    openReturnRequestCount: DashboardAnalyticsMetric;
  };
};

type DashboardAnalyticsResponse = {
  ok: boolean;
  message?: string;
  report?: DashboardAnalyticsReport;
};

type AdminDashboardProps = {
  canReadAnalytics?: boolean;
  canReadCatalog?: boolean;
  canReadCustomers?: boolean;
  canReadOrders?: boolean;
  canReadReturns?: boolean;
};

async function readCatalogResponse(response: Response): Promise<DashboardCatalogResponse> {
  let result: DashboardCatalogResponse;

  try {
    result = await response.json() as DashboardCatalogResponse;
  } catch {
    throw new Error("Catalog unavailable");
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Catalog unavailable");
  }

  return result;
}

async function readAnalyticsResponse(response: Response): Promise<DashboardAnalyticsReport> {
  let result: DashboardAnalyticsResponse;

  try {
    result = await response.json() as DashboardAnalyticsResponse;
  } catch {
    throw new Error("Analytics unavailable");
  }

  if (!response.ok || !result.ok || !result.report) {
    throw new Error(result.message || "Analytics unavailable");
  }

  return result.report;
}

export function AdminDashboard({
  canReadAnalytics = false,
  canReadCatalog = true,
  canReadCustomers = false,
  canReadOrders = false,
  canReadReturns = false
}: AdminDashboardProps) {
  const [catalog, setCatalog] = useState<DashboardCatalogData | null>(null);
  const [analytics, setAnalytics] = useState<DashboardAnalyticsReport | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [analyticsError, setAnalyticsError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(canReadCatalog);
  const [analyticsLoading, setAnalyticsLoading] = useState(canReadAnalytics);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!canReadCatalog) return;

    const controller = new AbortController();

    Promise.all([
      fetch("/api/admin/full-catalog-products?page=1&pageSize=1", { cache: "no-store", signal: controller.signal }),
      fetch("/api/admin/full-catalog-products?page=1&pageSize=1&images=without", { cache: "no-store", signal: controller.signal })
    ])
      .then(async ([catalogResponse, missingImagesResponse]) => {
        const [catalogResult, missingImages] = await Promise.all([
          readCatalogResponse(catalogResponse),
          readCatalogResponse(missingImagesResponse)
        ]);
        return { summary: catalogResult.summary, missingImageCount: missingImages.total };
      })
      .then((nextCatalog) => {
        setCatalog(nextCatalog);
        setCatalogError("");
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setCatalog(null);
        setCatalogError(requestError instanceof Error ? requestError.message : "Catalog unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });

    return () => controller.abort();
  }, [canReadCatalog, refreshKey]);

  useEffect(() => {
    if (!canReadAnalytics) return;

    const controller = new AbortController();

    fetch("/api/admin/analytics", { cache: "no-store", signal: controller.signal })
      .then(readAnalyticsResponse)
      .then((nextAnalytics) => {
        setAnalytics(nextAnalytics);
        setAnalyticsError("");
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setAnalytics(null);
        setAnalyticsError(requestError instanceof Error ? requestError.message : "Analytics unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setAnalyticsLoading(false);
      });

    return () => controller.abort();
  }, [canReadAnalytics, refreshKey]);

  const isRefreshing = catalogLoading || analyticsLoading;
  const catalogReady = catalog?.summary.status === "completed";
  const openReturns = analytics?.metrics.openReturnRequestCount;
  const hasOverviewData = canReadAnalytics || canReadCatalog;
  const hasWorkPanels = canReadCatalog || canReadOrders || canReadReturns || canReadCustomers;
  const hasSystemSummary = canReadCatalog || canReadOrders || canReadReturns;
  const attentionHeading = canReadCatalog || (canReadAnalytics && canReadReturns) ? "Needs attention" : "Workspaces";

  function refreshDashboard() {
    setCatalogError("");
    setAnalyticsError("");
    if (canReadCatalog) setCatalogLoading(true);
    if (canReadAnalytics) setAnalyticsLoading(true);
    setRefreshKey((current) => current + 1);
  }

  return (
    <main className="admin-page admin-overview" data-store-component="AdminDashboard">
      <header className="admin-overview-header">
        <h1 className="admin-overview-title">Store overview</h1>
        <div className="admin-overview-header-actions">
          {canReadAnalytics ? (
            <span className="admin-overview-range">
              <CalendarDays aria-hidden="true" size={14} />
              Last 30 days
            </span>
          ) : null}
          {hasOverviewData ? (
            <button className="admin-button-secondary" disabled={isRefreshing} onClick={refreshDashboard} type="button">
              <RefreshCw aria-hidden="true" className={isRefreshing ? "admin-loading-mark" : ""} size={15} />
              Refresh
            </button>
          ) : null}
        </div>
      </header>

      {canReadAnalytics ? (
        <section aria-busy={analyticsLoading} aria-label="Store performance" className="admin-overview-metrics">
          <CommerceMetric label="Gross mirrored sales" loading={analyticsLoading} metric={analytics?.metrics.grossSalesCents} money />
          <CommerceMetric label="Paid orders" loading={analyticsLoading} metric={analytics?.metrics.paidOrderCount} />
          <CommerceMetric label="Average order value" loading={analyticsLoading} metric={analytics?.metrics.averageOrderValueCents} money />
          <CommerceMetric label="Open returns" loading={analyticsLoading} metric={analytics?.metrics.openReturnRequestCount} />
        </section>
      ) : null}

      {catalogError || analyticsError ? (
        <div className="admin-overview-alerts" role="status">
          {analyticsError ? <InlineAlert label="Analytics unavailable" /> : null}
          {catalogError ? <InlineAlert label="Catalog unavailable" /> : null}
        </div>
      ) : null}

      {hasOverviewData && hasWorkPanels ? (
        <div className="admin-overview-grid">
          {canReadCatalog || canReadOrders || canReadReturns || canReadCustomers ? (
            <section aria-labelledby="attention-heading" className="admin-panel admin-overview-attention">
              <div className="admin-overview-panel-header">
                <h2 className="admin-section-heading" id="attention-heading">{attentionHeading}</h2>
              </div>
              <div className="admin-overview-action-list">
                {canReadCatalog ? (
                  <OverviewAction
                    href="/admin/products"
                    icon={<ImageOff aria-hidden="true" size={15} />}
                    label="Products without imagery"
                    loading={catalogLoading}
                    meta="Catalog filter"
                    tone={catalog?.missingImageCount ? "warning" : "default"}
                    value={catalog?.missingImageCount ?? null}
                  />
                ) : null}
                {canReadAnalytics && canReadReturns ? (
                  <OverviewAction
                    href="/admin/orders?tab=returns"
                    icon={<RotateCcw aria-hidden="true" size={15} />}
                    label="Open return requests"
                    loading={analyticsLoading}
                    meta="Returns queue"
                    tone={openReturns?.value ? "warning" : "default"}
                    value={openReturns?.value}
                  />
                ) : null}
                {canReadCatalog ? (
                  <OverviewAction
                    href="/admin/products?tab=publishing"
                    icon={<PencilRuler aria-hidden="true" size={15} />}
                    label="Website assortment"
                    meta="Publishing workspace"
                  />
                ) : null}
                {!canReadCatalog && canReadOrders ? (
                  <OverviewAction href="/admin/orders" icon={<ShoppingBag aria-hidden="true" size={15} />} label="Orders" meta="Order workspace" />
                ) : null}
                {!canReadCatalog && !canReadAnalytics && canReadReturns ? (
                  <OverviewAction href="/admin/orders?tab=returns" icon={<RotateCcw aria-hidden="true" size={15} />} label="Returns" meta="Returns workspace" />
                ) : null}
                {!canReadCatalog && canReadCustomers ? (
                  <OverviewAction href="/admin/customers" icon={<UsersRound aria-hidden="true" size={15} />} label="Customers" meta="Customer workspace" />
                ) : null}
              </div>
            </section>
          ) : null}

          {canReadCatalog ? (
            <section aria-labelledby="catalog-heading" className="admin-panel admin-overview-catalog">
              <div className="admin-overview-panel-header">
                <h2 className="admin-section-heading" id="catalog-heading">Catalog</h2>
                <Link href="/admin/products">Open products</Link>
              </div>
              <dl className="admin-overview-catalog-grid">
                <CatalogValue label="Catalog items" loading={catalogLoading} value={catalog?.summary.itemCount} />
                <CatalogValue label="Variations" loading={catalogLoading} value={catalog?.summary.variationCount} />
                <CatalogValue label="Categories" loading={catalogLoading} value={catalog?.summary.categoryCount} />
                <CatalogValue label="Missing images" loading={catalogLoading} tone={catalog?.missingImageCount ? "warning" : "default"} value={catalog?.missingImageCount} />
              </dl>
              <div className="admin-overview-catalog-state">
                <span><Database aria-hidden="true" size={14} />Square catalog</span>
                <strong className={catalogReady ? "is-good" : catalogError ? "is-unavailable" : ""}>
                  {catalogLoading ? "Loading" : catalogReady ? "Synced" : catalog ? formatStatus(catalog.summary.status) : "Unavailable"}
                </strong>
              </div>
            </section>
          ) : null}
        </div>
      ) : !hasOverviewData ? (
        <AvailableWorkspaces canReadCustomers={canReadCustomers} canReadOrders={canReadOrders} canReadReturns={canReadReturns} />
      ) : null}

      {hasOverviewData && hasSystemSummary ? (
        <section aria-label="Connected systems" className="admin-overview-systems">
          {canReadCatalog ? (
            <SystemSummary
              icon={<Database aria-hidden="true" size={14} />}
              label="Square catalog"
              value={catalog?.summary.updatedAt ? `Last sync ${formatSyncTime(catalog.summary.updatedAt)}` : "Last sync —"}
            />
          ) : null}
          {canReadCatalog ? <SystemSummary icon={<PencilRuler aria-hidden="true" size={14} />} label="Website merchandising" value="Editable" /> : null}
          {canReadOrders || canReadReturns ? <SystemSummary icon={<Truck aria-hidden="true" size={14} />} label="OrderPRO" value="External" /> : null}
        </section>
      ) : null}
    </main>
  );
}

function CommerceMetric({ label, loading, metric, money = false }: {
  label: string;
  loading: boolean;
  metric: DashboardAnalyticsMetric | undefined;
  money?: boolean;
}) {
  const value = loading || metric?.value === null || metric?.value === undefined
    ? "—"
    : money ? formatMoney(metric.value) : formatCount(metric.value);

  return (
    <article className="admin-overview-metric">
      <p>{label}</p>
      <strong>{value}</strong>
      <span className={metric?.state === "partial" ? "is-partial" : metric?.state === "unavailable" ? "is-unavailable" : ""}>
        {loading ? "Loading" : metric ? metricStateLabel(metric.state) : "Unavailable"}
      </span>
    </article>
  );
}

function OverviewAction({ href, icon, label, loading = false, meta, tone = "default", value }: {
  href: string;
  icon: ReactNode;
  label: string;
  loading?: boolean;
  meta: string;
  tone?: "default" | "warning";
  value?: number | null;
}) {
  return (
    <Link className="admin-overview-action" href={href}>
      <span className={tone === "warning" ? "admin-overview-action-icon is-warning" : "admin-overview-action-icon"}>{icon}</span>
      <span className="admin-overview-action-copy">
        <strong>{label}</strong>
        <small>{meta}</small>
      </span>
      {loading || value !== undefined ? <b className={tone === "warning" ? "is-warning" : ""}>{loading || value === null || value === undefined ? "—" : formatCount(value)}</b> : null}
      <ArrowRight aria-hidden="true" size={13} />
    </Link>
  );
}

function CatalogValue({ label, loading, tone = "default", value }: {
  label: string;
  loading: boolean;
  tone?: "default" | "warning";
  value: number | undefined;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={tone === "warning" ? "is-warning" : ""}>{loading || value === undefined ? "—" : formatCount(value)}</dd>
    </div>
  );
}

function SystemSummary({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div><span>{icon}{label}</span><strong>{value}</strong></div>;
}

function InlineAlert({ label }: { label: string }) {
  return <span><CircleAlert aria-hidden="true" size={14} />{label}</span>;
}

function AvailableWorkspaces({ canReadCustomers, canReadOrders, canReadReturns }: {
  canReadCustomers: boolean;
  canReadOrders: boolean;
  canReadReturns: boolean;
}) {
  return (
    <section className="admin-panel admin-overview-workspaces">
      <div className="admin-overview-panel-header"><h2 className="admin-section-heading">Available workspaces</h2></div>
      <div>
        {canReadOrders ? <WorkspaceLink href="/admin/orders" icon={<ShoppingBag aria-hidden="true" size={15} />} label="Orders" /> : null}
        {canReadReturns ? <WorkspaceLink href="/admin/orders?tab=returns" icon={<RotateCcw aria-hidden="true" size={15} />} label="Returns" /> : null}
        {canReadCustomers ? <WorkspaceLink href="/admin/customers" icon={<UsersRound aria-hidden="true" size={15} />} label="Customers" /> : null}
        {!canReadOrders && !canReadReturns && !canReadCustomers ? <p>No additional workspace assigned.</p> : null}
      </div>
    </section>
  );
}

function WorkspaceLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return <Link href={href}>{icon}<span>{label}</span><ArrowRight aria-hidden="true" size={13} /></Link>;
}

function metricStateLabel(state: DashboardDataState) {
  if (state === "partial") return "Partial data";
  if (state === "unavailable") return "Unavailable";
  return "Read only";
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatStatus(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatSyncTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
