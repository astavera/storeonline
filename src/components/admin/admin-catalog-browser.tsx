/**
 * Browses the synchronized Square production catalog without exposing Square edit actions.
 */

"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Filter, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import type { WebsiteProductPlacement } from "@/features/catalog/services/website-merchandising-service";
import type { SquareCatalogCacheSummary } from "@/features/catalog/square-catalog-cache";
import { formatMoney } from "@/lib/utils";

type CatalogRecord = {
  product: StorefrontProduct;
  placement: WebsiteProductPlacement;
  saved?: boolean;
  readinessIssues?: string[];
};

type CatalogResponse = {
  ok: boolean;
  error?: string;
  records: CatalogRecord[];
  summary: SquareCatalogCacheSummary;
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
};

type ImageFilter = "all" | "with" | "without";

async function readCatalogResponse(response: Response): Promise<CatalogResponse> {
  let result: CatalogResponse;

  try {
    result = await response.json() as CatalogResponse;
  } catch {
    throw new Error(
      response.ok
        ? "The catalog service returned an invalid response."
        : "The catalog service is unavailable. Check the database connection and try again."
    );
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "The production catalog could not be loaded.");
  }

  return result;
}

export function AdminCatalogBrowser() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({ page: String(page), pageSize: "24" });
    if (query) parameters.set("q", query);
    if (imageFilter !== "all") parameters.set("images", imageFilter);

    fetch(`/api/admin/full-catalog-products?${parameters}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        return readCatalogResponse(response);
      })
      .then((result) => {
        setCatalog(result);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "The production catalog could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [imageFilter, page, query, refreshKey]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setPage(1);
    setQuery(queryInput.trim());
  }

  function changeImageFilter(nextFilter: ImageFilter) {
    setIsLoading(true);
    setError("");
    setImageFilter(nextFilter);
    setPage(1);
  }

  function changePage(nextPage: number) {
    setIsLoading(true);
    setError("");
    setPage(nextPage);
  }

  function refreshProducts() {
    setIsLoading(true);
    setError("");
    setRefreshKey((current) => current + 1);
  }

  return (
    <main className="admin-page" data-store-component="AdminCatalogBrowser">
      <header className="admin-page-header admin-page-header--actions-only">
        <div className="admin-page-header-actions">
          <Link className="admin-button" href="/admin/products?tab=publishing#products">Open catalog publishing</Link>
        </div>
      </header>

      <section aria-label="Products" className="admin-panel admin-products-panel">
        <div aria-label="Catalog status" className="admin-products-summary">
          <SummaryItem label="Items" value={catalog ? formatCount(catalog.summary.itemCount) : "—"} />
          <SummaryItem label="Variations" value={catalog ? formatCount(catalog.summary.variationCount) : "—"} />
          <SummaryItem label="Catalog state" value={catalog ? formatCatalogStatus(catalog.summary.status) : "—"} />
          <SummaryItem label="Last sync" value={catalog ? formatSyncTime(catalog.summary.updatedAt) : "—"} />
        </div>

        <div className="admin-products-toolbar">
          <form className="admin-search-form" onSubmit={submitSearch}>
            <div className="admin-search-shell">
              <Search aria-hidden="true" size={15} />
              <label className="sr-only" htmlFor="admin-catalog-search">Search full catalog</label>
              <input
                className="admin-search-input"
                id="admin-catalog-search"
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search product, SKU, UPC or Square ID"
                value={queryInput}
              />
            </div>
            <button className="admin-search-submit" type="submit">Search</button>
          </form>

          <label className="admin-filter-group">
            <span className="admin-filter-label"><Filter aria-hidden="true" className="mr-1 inline" size={12} />Product images</span>
            <select
              className="admin-select"
              onChange={(event) => changeImageFilter(event.target.value as ImageFilter)}
              value={imageFilter}
            >
              <option value="all">All products</option>
              <option value="with">With image</option>
              <option value="without">Missing image</option>
            </select>
          </label>

          <button aria-label="Refresh products" className="admin-icon-button" disabled={isLoading} onClick={refreshProducts} title="Refresh products" type="button">
            <RefreshCw aria-hidden="true" className={isLoading ? "admin-loading-mark" : ""} size={15} />
          </button>
        </div>

        <div className="admin-products-resultbar">
          <span>{catalog ? resultRange(catalog) : "Loading products"}</span>
          <span>{query ? `Search: “${query}”` : imageFilter === "all" ? "All synchronized variations" : imageFilter === "with" ? "Products with images" : "Products missing images"}</span>
        </div>

        {error ? (
          <div className="admin-error-state" role="alert">
            <div>
              <p className="text-sm font-bold">Products could not be loaded</p>
              <p className="mt-1 text-xs">{error}</p>
              <button className="admin-button-secondary mt-4" onClick={refreshProducts} type="button">Try again</button>
            </div>
          </div>
        ) : null}

        {!error && isLoading ? (
          <div className="admin-loading-state" role="status">
            <div>
              <LoaderCircle aria-hidden="true" className="admin-loading-mark mx-auto" size={22} />
              <p className="mt-3 text-xs font-semibold text-[#687386]">Loading synchronized products...</p>
            </div>
          </div>
        ) : null}

        {!error && !isLoading && catalog?.records.length === 0 ? (
          <div className="admin-empty-state">
            <div>
              <p className="text-sm font-bold">No matching products</p>
              <p className="mt-1 max-w-md text-xs text-[#737d8d]">Try a broader search or clear the image filter.</p>
            </div>
          </div>
        ) : null}

        {!error && !isLoading && catalog?.records.length ? (
          <>
            <div className="admin-products-table-wrap">
              <table className="admin-products-table">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Website setup</th>
                    <th scope="col">Department</th>
                    <th scope="col">Price</th>
                    <th scope="col">Source</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.records.map((record) => <ProductTableRow key={record.product.squareVariationId} record={record} />)}
                </tbody>
              </table>
            </div>

            <div className="admin-product-mobile-list">
              {catalog.records.map((record) => <ProductMobileCard key={record.product.squareVariationId} record={record} />)}
            </div>
          </>
        ) : null}

        {catalog && catalog.pageCount > 1 ? (
          <nav aria-label="Catalog pages" className="admin-pagination">
            <button className="admin-button-secondary" disabled={isLoading || catalog.page <= 1} onClick={() => changePage(Math.max(1, catalog.page - 1))} type="button">
              <ChevronLeft aria-hidden="true" size={14} />Previous
            </button>
            <p className="admin-pagination-copy">Page {catalog.page} of {catalog.pageCount}</p>
            <button className="admin-button-secondary" disabled={isLoading || catalog.page >= catalog.pageCount} onClick={() => changePage(catalog.page + 1)} type="button">
              Next<ChevronRight aria-hidden="true" size={14} />
            </button>
          </nav>
        ) : null}
      </section>
    </main>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div className="admin-products-summary-item"><p className="admin-products-summary-label">{label}</p><p className="admin-products-summary-value">{value}</p></div>;
}

function ProductTableRow({ record }: { record: CatalogRecord }) {
  const { product } = record;
  return (
    <tr>
      <td>
        <div className="admin-product-cell">
          <Image alt="" className="admin-product-thumb" height={48} src={product.imageUrl || "/images/product-fallback.svg"} unoptimized width={48} />
          <div className="min-w-0">
            <h2 className="admin-product-name" title={product.name}>{product.name}</h2>
            <p className="admin-product-id" title={product.squareVariationId}>{product.squareVariationId}</p>
          </div>
        </div>
      </td>
      <td><WebsiteSetupBadge record={record} /></td>
      <td>{product.department || "Uncategorized"}</td>
      <td className="font-semibold text-[#10233f]">{product.priceAvailable === false ? "Unavailable" : formatMoney(product.priceCents)}</td>
      <td><span className="admin-source-badge">Square</span></td>
      <td className="text-right"><Link className="admin-row-action" href={`/admin/products/${encodeURIComponent(product.squareVariationId)}`}>Manage</Link></td>
    </tr>
  );
}

function ProductMobileCard({ record }: { record: CatalogRecord }) {
  const { product } = record;
  return (
    <article className="admin-product-mobile-card">
      <Image alt="" className="admin-product-thumb" height={48} src={product.imageUrl || "/images/product-fallback.svg"} unoptimized width={48} />
      <div className="min-w-0">
        <p className="admin-product-name" title={product.name}>{product.name}</p>
        <div className="admin-product-mobile-details">
          <span>{product.department || "Uncategorized"}</span>
          <span>{product.priceAvailable === false ? "Price unavailable" : formatMoney(product.priceCents)}</span>
          <WebsiteSetupBadge record={record} />
        </div>
      </div>
      <Link aria-label={`Manage ${product.name}`} className="admin-row-action" href={`/admin/products/${encodeURIComponent(product.squareVariationId)}`}>Manage</Link>
    </article>
  );
}

function WebsiteSetupBadge({ record }: { record: CatalogRecord }) {
  if (!record.saved) {
    return <span className="admin-status-badge admin-status-badge--warning">Needs setup</span>;
  }
  if (record.placement?.visible && (record.readinessIssues?.length ?? 0) === 0) {
    return <span className="admin-status-badge admin-status-badge--good">Live</span>;
  }
  if ((record.readinessIssues?.length ?? 0) > 0) {
    const issueCount = record.readinessIssues?.length ?? 0;
    return <span className="admin-status-badge admin-status-badge--warning" title={record.readinessIssues?.join(" ")}>{issueCount} field{issueCount === 1 ? "" : "s"} needed</span>;
  }
  return <span className="admin-status-badge">Draft</span>;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCatalogStatus(value: SquareCatalogCacheSummary["status"]) {
  return value === "completed" ? "Ready" : value.charAt(0).toUpperCase() + value.slice(1);
}

function formatSyncTime(value: string | null) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function resultRange(catalog: CatalogResponse) {
  if (catalog.total === 0) return "0 products";
  const start = (catalog.page - 1) * catalog.pageSize + 1;
  const end = Math.min(catalog.total, start + catalog.records.length - 1);
  return `${formatCount(start)}–${formatCount(end)} of ${formatCount(catalog.total)} variations`;
}
