/**
 * Renders the operational admin overview using only verifiable catalog data.
 */

"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Boxes,
  CircleAlert,
  CircleCheck,
  Database,
  ImageOff,
  Layers3,
  PencilRuler,
  RefreshCw
} from "lucide-react";
import type { SquareCatalogCacheSummary } from "@/features/catalog/square-catalog-cache";

type DashboardCatalogResponse = {
  ok: boolean;
  error?: string;
  summary: SquareCatalogCacheSummary;
  total: number;
};

type DashboardData = {
  summary: SquareCatalogCacheSummary;
  missingImageCount: number;
};

async function readCatalogResponse(response: Response): Promise<DashboardCatalogResponse> {
  let result: DashboardCatalogResponse;

  try {
    result = await response.json() as DashboardCatalogResponse;
  } catch {
    throw new Error(
      response.ok
        ? "The catalog service returned an invalid response."
        : "The catalog service is unavailable. Check the database connection and try again."
    );
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "The catalog service is unavailable. Try again in a moment.");
  }

  return result;
}

export function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const requests = [
      fetch("/api/admin/full-catalog-products?page=1&pageSize=1", { cache: "no-store", signal: controller.signal }),
      fetch("/api/admin/full-catalog-products?page=1&pageSize=1&images=without", { cache: "no-store", signal: controller.signal })
    ];

    Promise.all(requests)
      .then(async ([catalogResponse, missingImagesResponse]) => {
        const [catalog, missingImages] = await Promise.all([
          readCatalogResponse(catalogResponse),
          readCatalogResponse(missingImagesResponse)
        ]);
        return { summary: catalog.summary, missingImageCount: missingImages.total };
      })
      .then((nextData) => {
        setData(nextData);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Store data could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [refreshKey]);

  const catalogReady = data?.summary.status === "completed";

  function refreshDashboard() {
    setIsLoading(true);
    setError("");
    setRefreshKey((current) => current + 1);
  }

  return (
    <main className="admin-page" data-store-component="AdminDashboard">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Daily workspace</p>
          <h1 className="admin-page-title">Store overview</h1>
          <p className="admin-lede">
            Catalog health and the next useful work. Commerce data stays in Square; website presentation stays here.
          </p>
        </div>
        <div className="admin-page-header-actions">
          <button className="admin-button-secondary" disabled={isLoading} onClick={refreshDashboard} type="button">
            <RefreshCw aria-hidden="true" className={isLoading ? "admin-loading-mark" : ""} size={15} />
            Refresh
          </button>
          <Link className="admin-button" href="/admin/products">
            Open products
          </Link>
        </div>
      </header>

      <section aria-label="Catalog summary" className="admin-metric-grid">
        <Metric icon={<Database aria-hidden="true" size={15} />} label="Catalog items" loading={isLoading} meta="Square source records" value={data?.summary.itemCount} />
        <Metric icon={<Layers3 aria-hidden="true" size={15} />} label="Variations" loading={isLoading} meta="Available to review" value={data?.summary.variationCount} />
        <Metric icon={<ImageOff aria-hidden="true" size={15} />} label="Missing images" loading={isLoading} meta="Needs merchandising review" tone={data?.missingImageCount ? "warning" : "default"} value={data?.missingImageCount} />
        <Metric icon={<Boxes aria-hidden="true" size={15} />} label="Categories" loading={isLoading} meta="Square reference taxonomy" value={data?.summary.categoryCount} />
      </section>

      {error ? (
        <div className="admin-panel admin-error-state mt-4" role="alert">
          <div>
            <CircleAlert aria-hidden="true" className="mx-auto" size={23} />
            <p className="mt-3 text-sm font-bold">Live store data is unavailable</p>
            <p className="mt-1 text-xs">{error}</p>
          </div>
        </div>
      ) : null}

      <div className="admin-dashboard-grid">
        <section aria-labelledby="focus-heading" className="admin-panel admin-focus-panel">
          <div className="admin-panel-header">
            <div>
              <h2 className="admin-section-heading" id="focus-heading">Today&apos;s focus</h2>
              <p className="admin-section-note">Concrete next steps, based on current capabilities.</p>
            </div>
          </div>
          <div className="admin-task-list">
            {!data ? (
              <TaskRow
                href="/admin/products"
                icon={<CircleAlert aria-hidden="true" size={16} />}
                meta="Live catalog data is unavailable. Restore the database connection, then refresh this workspace."
                title="Catalog review is waiting"
                warning
              />
            ) : data.missingImageCount ? (
              <TaskRow
                href="/admin/products"
                icon={<ImageOff aria-hidden="true" size={16} />}
                meta={`${formatCount(data.missingImageCount)} variations currently match the missing-image filter.`}
                title="Review products without imagery"
                warning
              />
            ) : (
              <TaskRow
                href="/admin/products"
                icon={<CircleCheck aria-hidden="true" size={16} />}
                meta="No products are currently returned by the missing-image filter."
                title="Product imagery is clear"
              />
            )}
            <TaskRow href="/admin/product-placement#products" icon={<Boxes aria-hidden="true" size={16} />} meta="Assign website categories, visibility and merchandising surfaces." title="Review the website assortment" />
            <TaskRow href="/admin/homepage" icon={<PencilRuler aria-hidden="true" size={16} />} meta="Continue homepage content, ordering and responsive preview work." title="Continue the website story" />
          </div>
        </section>

        <section aria-labelledby="systems-heading" className="admin-panel admin-systems-panel">
          <div className="admin-panel-header">
            <div>
              <h2 className="admin-section-heading" id="systems-heading">Data boundaries</h2>
              <p className="admin-section-note">Know where each change belongs.</p>
            </div>
          </div>
          <div className="admin-system-list">
            <SystemRow
              meta={data ? `Last catalog sync ${formatSyncTime(data.summary.updatedAt)}` : error ? "Catalog status could not be verified" : "Loading catalog status"}
              quiet={!data}
              state={catalogReady ? "Synced" : data ? data.summary.status : error ? "Unavailable" : "Loading"}
              title="Square catalog"
            />
            <SystemRow meta="Categories, visibility, website copy and placement" state="Editable" title="Website merchandising" />
            <SystemRow meta="Orders, delivery and fulfillment execution" quiet state="External" title="OrderPRO" />
          </div>
        </section>

      </div>
    </main>
  );
}

function Metric({ icon, label, loading, meta, tone = "default", value }: { icon: ReactNode; label: string; loading: boolean; meta: string; tone?: "default" | "warning"; value: number | undefined }) {
  return (
    <div className="admin-metric-card">
      <p className="admin-metric-label">{icon}{label}</p>
      <p className={tone === "warning" ? "admin-metric-value text-[#9a5a06]" : "admin-metric-value"}>{loading || value === undefined ? "—" : formatCount(value)}</p>
      <p className="admin-metric-meta">{meta}</p>
    </div>
  );
}

function TaskRow({ href, icon, meta, title, warning = false }: { href: string; icon: ReactNode; meta: string; title: string; warning?: boolean }) {
  return (
    <div className="admin-task-row">
      <span className={warning ? "admin-task-icon admin-task-icon--warning" : "admin-task-icon"}>{icon}</span>
      <div className="admin-task-copy">
        <p className="admin-task-title">{title}</p>
        <p className="admin-task-meta">{meta}</p>
      </div>
      <Link className="admin-task-action" href={href}>Open<ArrowRight aria-hidden="true" size={13} /></Link>
    </div>
  );
}

function SystemRow({ meta, quiet = false, state, title }: { meta: string; quiet?: boolean; state: string; title: string }) {
  return (
    <div className="admin-system-row">
      <div className="admin-system-copy">
        <p className="admin-system-title">{title}</p>
        <p className="admin-system-meta">{meta}</p>
      </div>
      <span className={quiet ? "admin-system-state admin-system-state--quiet" : "admin-system-state"}>{state}</span>
    </div>
  );
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatSyncTime(value: string | null) {
  if (!value) return "is unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "is unavailable";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
