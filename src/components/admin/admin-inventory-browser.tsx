/**
 * Browses real synchronized Square inventory without exposing stock mutations.
 */

"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import type { SquareCatalogCacheSummary } from "@/features/catalog/square-catalog-cache";

type InventoryResponse = {
  ok: boolean;
  error?: string;
  products: StorefrontProduct[];
  summary: SquareCatalogCacheSummary;
  pageMetrics: {
    tracked: number;
    lowStock: number;
    outOfStock: number;
  };
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
};

export function AdminInventoryBrowser() {
  const [inventory, setInventory] = useState<InventoryResponse | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({ page: String(page), pageSize: "40" });
    if (query) parameters.set("q", query);

    fetch(`/api/admin/inventory?${parameters}`, { cache: "no-store", signal: controller.signal })
      .then(readInventoryResponse)
      .then((result) => {
        setInventory(result);
        setError("");
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Inventory could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [page, query, refreshKey]);

  const locationCount = useMemo(() => {
    if (!inventory) return 0;
    return new Set(inventory.products.flatMap((product) => product.pickupInventory?.map((location) => location.locationId) ?? [])).size;
  }, [inventory]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError("");
    setPage(1);
    setQuery(queryInput.trim());
  }

  function refreshInventory() {
    setIsLoading(true);
    setError("");
    setRefreshKey((current) => current + 1);
  }

  function changePage(nextPage: number) {
    setIsLoading(true);
    setError("");
    setPage(nextPage);
  }

  return (
    <main className="admin-page" data-store-component="AdminInventoryBrowser">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Operations</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="admin-page-title mt-0" id="inventory-browser-heading">Inventory</h1>
            <span className="admin-source-badge">Square · read only</span>
          </div>
          <p className="admin-lede">Monitor synchronized quantities and stock health. Inventory adjustments remain in Square.</p>
        </div>
        <div className="admin-page-header-actions">
          <Link className="admin-button-secondary" href="/admin/sync-status">View sync status</Link>
        </div>
      </header>

      <section aria-labelledby="inventory-browser-heading" className="admin-panel admin-products-panel admin-inventory-panel">
        <div aria-label="Inventory summary" className="admin-products-summary">
          <SummaryItem label="Variations" value={inventory ? formatCount(inventory.summary.variationCount) : "—"} />
          <SummaryItem label="Tracked · this page" value={inventory ? formatCount(inventory.pageMetrics.tracked) : "—"} />
          <SummaryItem label="Low stock · this page" value={inventory ? formatCount(inventory.pageMetrics.lowStock) : "—"} />
          <SummaryItem label="Locations · this page" value={inventory ? formatCount(locationCount) : "—"} />
        </div>

        <div className="admin-products-toolbar admin-inventory-toolbar">
          <form className="admin-search-form" onSubmit={submitSearch}>
            <div className="admin-search-shell">
              <Search aria-hidden="true" size={15} />
              <label className="sr-only" htmlFor="admin-inventory-search">Search inventory</label>
              <input
                className="admin-search-input"
                id="admin-inventory-search"
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search product, SKU, UPC or Square ID"
                value={queryInput}
              />
            </div>
            <button className="admin-search-submit" type="submit">Search</button>
          </form>
          <p className="admin-inventory-source-note">Live synchronized availability</p>
          <button aria-label="Refresh inventory" className="admin-icon-button" disabled={isLoading} onClick={refreshInventory} title="Refresh inventory" type="button">
            <RefreshCw aria-hidden="true" className={isLoading ? "admin-loading-mark" : ""} size={15} />
          </button>
        </div>

        <div className="admin-products-resultbar">
          <span>{inventory ? resultRange(inventory) : "Loading inventory"}</span>
          <span>{query ? `Search: “${query}”` : "All synchronized variations"}</span>
        </div>

        {error ? (
          <div className="admin-error-state" role="alert">
            <div>
              <p className="text-sm font-bold">Inventory could not be loaded</p>
              <p className="mt-1 text-xs">{error}</p>
              <button className="admin-button-secondary mt-4" onClick={refreshInventory} type="button">Try again</button>
            </div>
          </div>
        ) : null}

        {!error && isLoading ? (
          <div className="admin-loading-state" role="status">
            <div>
              <LoaderCircle aria-hidden="true" className="admin-loading-mark mx-auto" size={22} />
              <p className="mt-3 text-xs font-semibold text-[#687386]">Loading synchronized inventory...</p>
            </div>
          </div>
        ) : null}

        {!error && !isLoading && inventory?.products.length === 0 ? (
          <div className="admin-empty-state">
            <div>
              <p className="text-sm font-bold">No matching inventory</p>
              <p className="mt-1 max-w-md text-xs text-[#737d8d]">Try a broader product name, SKU, UPC or Square ID.</p>
            </div>
          </div>
        ) : null}

        {!error && !isLoading && inventory?.products.length ? (
          <>
            <div className="admin-products-table-wrap">
              <table className="admin-products-table admin-inventory-table">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Available</th>
                    <th scope="col">Stock status</th>
                    <th scope="col">Locations</th>
                    <th scope="col">Tracking</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.products.map((product) => <InventoryTableRow key={product.squareVariationId} product={product} />)}
                </tbody>
              </table>
            </div>
            <div className="admin-product-mobile-list">
              {inventory.products.map((product) => <InventoryMobileCard key={product.squareVariationId} product={product} />)}
            </div>
          </>
        ) : null}

        {inventory && inventory.pageCount > 1 ? (
          <nav aria-label="Inventory pages" className="admin-pagination">
            <button className="admin-button-secondary" disabled={isLoading || inventory.page <= 1} onClick={() => changePage(Math.max(1, inventory.page - 1))} type="button">
              <ChevronLeft aria-hidden="true" size={14} />Previous
            </button>
            <p className="admin-pagination-copy">Page {inventory.page} of {inventory.pageCount}</p>
            <button className="admin-button-secondary" disabled={isLoading || inventory.page >= inventory.pageCount} onClick={() => changePage(inventory.page + 1)} type="button">
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

function InventoryTableRow({ product }: { product: StorefrontProduct }) {
  return (
    <tr>
      <td><ProductIdentity product={product} /></td>
      <td className="admin-inventory-quantity">{formatQuantity(product)}</td>
      <td><InventoryStatus product={product} /></td>
      <td>{formatLocations(product)}</td>
      <td>{product.inventoryTracked ? "Tracked" : "Not tracked"}</td>
      <td className="text-right"><Link className="admin-row-action" href={`/admin/products/${encodeURIComponent(product.squareVariationId)}`}>View product</Link></td>
    </tr>
  );
}

function InventoryMobileCard({ product }: { product: StorefrontProduct }) {
  return (
    <article className="admin-product-mobile-card">
      <Image alt="" className="admin-product-thumb" height={48} src={product.imageUrl || "/images/product-fallback.svg"} unoptimized width={48} />
      <div className="min-w-0">
        <p className="admin-product-name" title={product.name}>{product.name}</p>
        <div className="admin-product-mobile-details">
          <span>{formatQuantity(product)}</span>
          <span>{formatLocations(product)}</span>
          <InventoryStatus product={product} />
        </div>
      </div>
      <Link aria-label={`View ${product.name}`} className="admin-row-action" href={`/admin/products/${encodeURIComponent(product.squareVariationId)}`}>View</Link>
    </article>
  );
}

function ProductIdentity({ product }: { product: StorefrontProduct }) {
  return (
    <div className="admin-product-cell">
      <Image alt="" className="admin-product-thumb" height={48} src={product.imageUrl || "/images/product-fallback.svg"} unoptimized width={48} />
      <div className="min-w-0">
        <p className="admin-product-name" title={product.name}>{product.name}</p>
        <p className="admin-product-id" title={product.squareVariationId}>{product.squareVariationId}</p>
      </div>
    </div>
  );
}

function InventoryStatus({ product }: { product: StorefrontProduct }) {
  if (!product.inventoryTracked) return <span className="admin-status-badge admin-status-badge--neutral">Not tracked</span>;
  if (product.inventoryStatus === "out-of-stock") return <span className="admin-status-badge admin-status-badge--danger">Out of stock</span>;
  if (product.inventoryStatus === "limited") return <span className="admin-status-badge admin-status-badge--warning">Low stock</span>;
  if (product.inventoryStatus === "special-order") return <span className="admin-status-badge admin-status-badge--neutral">Special order</span>;
  return <span className="admin-status-badge admin-status-badge--good">In stock</span>;
}

async function readInventoryResponse(response: Response): Promise<InventoryResponse> {
  let result: InventoryResponse;
  try {
    result = await response.json() as InventoryResponse;
  } catch {
    throw new Error("The inventory service returned an invalid response.");
  }
  if (!response.ok || !result.ok) throw new Error(result.error || "Inventory could not be loaded.");
  return result;
}

function formatQuantity(product: StorefrontProduct) {
  if (!product.inventoryTracked) return "—";
  if (typeof product.availableQuantity !== "number") return "Unavailable";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(product.availableQuantity);
}

function formatLocations(product: StorefrontProduct) {
  const locations = product.pickupInventory ?? [];
  if (locations.length === 0) return product.inventoryTracked ? "No mapped location" : "—";
  if (locations.length === 1) return locations[0].locationName;
  return `${locations.length} mapped locations`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function resultRange(inventory: InventoryResponse) {
  if (inventory.total === 0) return "0 variations";
  const start = (inventory.page - 1) * inventory.pageSize + 1;
  const end = Math.min(inventory.total, start + inventory.products.length - 1);
  return `${start}–${end} of ${formatCount(inventory.total)} variations`;
}
