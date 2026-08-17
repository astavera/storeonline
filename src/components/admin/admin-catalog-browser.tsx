/**
 * Browses the synchronized Square production catalog without exposing edit actions.
 */

"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, LoaderCircle, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import type { SquareCatalogCacheSummary } from "@/features/catalog/square-catalog-cache";
import { formatMoney } from "@/lib/utils";

type CatalogRecord = {
  product: StorefrontProduct;
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

export function AdminCatalogBrowser() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [page, setPage] = useState(1);
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
        const result = await response.json() as CatalogResponse;
        if (!response.ok || !result.ok) {
          throw new Error(result.error || "The production catalog could not be loaded.");
        }
        return result;
      })
      .then(setCatalog)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "The production catalog could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [imageFilter, page, query]);

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

  return (
    <main className="p-4 md:p-6">
      <section className="rounded-lg border border-border bg-surface p-4 md:p-6" aria-labelledby="catalog-browser-heading">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Read-only production data</p>
            <h1 className="mt-2 font-display text-3xl font-semibold" id="catalog-browser-heading">Square catalog</h1>
            <p className="mt-2 max-w-2xl text-sm text-secondary">
              Browse and search the complete catalog synchronized from Square. Product publishing and every other catalog change remain disabled in this preview.
            </p>
          </div>
          {catalog ? (
            <div className="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm">
              <p className="font-semibold">{formatCount(catalog.total)} variations</p>
              <p className="mt-1 text-xs text-secondary">Last sync: {formatSyncTime(catalog.summary.updatedAt)}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <form className="flex gap-2" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="admin-catalog-search">Search full catalog</label>
            <input
              className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
              id="admin-catalog-search"
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Search name, SKU, UPC, or Square variation ID"
              value={queryInput}
            />
            <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white" type="submit">
              <Search aria-hidden="true" size={16} /> Search
            </button>
          </form>
          <label className="text-xs font-semibold text-secondary">
            Product images
            <select
              aria-label="Filter catalog by image"
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-primary"
              onChange={(event) => changeImageFilter(event.target.value as ImageFilter)}
              value={imageFilter}
            >
              <option value="all">All products</option>
              <option value="with">With image</option>
              <option value="without">Without image</option>
            </select>
          </label>
        </div>

        {error ? <p className="mt-5 rounded-md border border-red/30 bg-red/5 p-4 text-sm font-semibold text-red" role="alert">{error}</p> : null}
        {isLoading ? (
          <div className="grid min-h-64 place-items-center text-sm text-secondary"><LoaderCircle aria-hidden="true" className="animate-spin" size={22} />Loading catalog...</div>
        ) : null}
        {!isLoading && catalog?.records.length === 0 ? (
          <p className="mt-5 rounded-md border border-border bg-surface-muted p-5 text-sm text-secondary">No catalog products match these filters.</p>
        ) : null}
        {!isLoading && catalog?.records.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {catalog.records.map(({ product }) => (
              <article className="flex min-w-0 gap-3 rounded-md border border-border bg-surface-muted p-3" key={product.squareVariationId}>
                <Image
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-md border border-border bg-white object-contain"
                  height={64}
                  src={product.imageUrl || "/images/product-fallback.svg"}
                  unoptimized
                  width={64}
                />
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold" title={product.name}>{product.name}</h2>
                  <p className="mt-1 truncate text-xs text-secondary" title={product.department}>{product.department || "Uncategorized"}</p>
                  <p className="mt-2 text-sm font-semibold">{product.priceAvailable === false ? "Price unavailable" : formatMoney(product.priceCents)}</p>
                  <p className="mt-1 truncate font-mono text-[10px] text-secondary" title={product.squareVariationId}>{product.squareVariationId}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {catalog && catalog.pageCount > 1 ? (
          <nav aria-label="Catalog pages" className="mt-6 flex items-center justify-between border-t border-border pt-5">
            <button className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-40" disabled={isLoading || catalog.page <= 1} onClick={() => changePage(Math.max(1, catalog.page - 1))} type="button">
              <ChevronLeft aria-hidden="true" size={16} /> Previous
            </button>
            <p className="text-sm text-secondary">Page {catalog.page} of {catalog.pageCount}</p>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-40" disabled={isLoading || catalog.page >= catalog.pageCount} onClick={() => changePage(catalog.page + 1)} type="button">
              Next <ChevronRight aria-hidden="true" size={16} />
            </button>
          </nav>
        ) : null}
      </section>
    </main>
  );
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatSyncTime(value: string | null) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}
