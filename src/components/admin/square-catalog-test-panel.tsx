"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, ImageOff, RefreshCw, Search } from "lucide-react";
import type { SquareCatalogCachePage } from "@/features/catalog/square-catalog-cache";

type ApiResponse = SquareCatalogCachePage & { ok: boolean };

export function SquareCatalogTestPanel() {
  const [catalog, setCatalog] = useState<ApiResponse | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({ page: String(page), pageSize: "24" });
    if (query) parameters.set("q", query);

    fetch(`/api/admin/square-catalog-cache?${parameters}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const result = await response.json().catch(() => null) as { message?: string; error?: string } | null;
          throw new Error(result?.message || result?.error || "The local Square catalog cache could not be read.");
        }
        return response.json() as Promise<ApiResponse>;
      })
      .then((result) => {
        setCatalog(result);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "The local Square catalog cache could not be read.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [page, query, reloadKey]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    beginRequest();
    setPage(1);
    setQuery(queryInput.trim());
    setReloadKey((value) => value + 1);
  }

  function beginRequest() {
    setIsLoading(true);
    setError("");
  }

  const summary = catalog?.summary;

  return (
    <section className="bg-surface-muted p-4 md:p-6" aria-labelledby="real-catalog-heading">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue">Real Square catalog</p>
            <span className="rounded-pill bg-green/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-green">Read only</span>
            <span className="rounded-pill bg-yellow/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-primary">Hidden from website</span>
          </div>
          <h2 className="mt-2 font-display text-xl font-semibold" id="real-catalog-heading">Real catalog</h2>
        </div>
        <button className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-semibold hover:border-primary" onClick={() => { beginRequest(); setReloadKey((value) => value + 1); }} type="button">
          <RefreshCw className={`mr-2 ${isLoading ? "animate-spin" : ""}`} size={16} />Refresh cache view
        </button>
      </div>

      {catalog === null && isLoading ? (
        <div className="mt-5 rounded-md border border-border bg-surface p-6" aria-live="polite">
          <p className="inline-flex items-center font-semibold text-primary"><RefreshCw className="mr-2 animate-spin" size={16} />Loading catalog cache</p>
        </div>
      ) : catalog && summary?.available ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <CatalogMetric label="Products" value={summary.itemCount} />
            <CatalogMetric label="Variations" value={summary.variationCount} />
            <CatalogMetric label="Images" value={summary.imageCount} />
            <CatalogMetric label="Categories" value={summary.categoryCount} />
            <CatalogMetric label="Square vendors" value={summary.vendorCount} />
          </div>
          <div className="mt-3 flex flex-col justify-between gap-2 rounded-md border border-blue/20 bg-cyan px-4 py-3 text-sm sm:flex-row sm:items-center">
            <p><span className="font-semibold text-primary">{catalogStatusLabel(summary.status)}</span>{summary.hasMore ? ` · ${summary.pagesCompleted} pages saved · more pages remain` : ` · ${summary.pagesCompleted} pages saved`}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary">{summary.environment} · {summary.updatedAt ? formatDate(summary.updatedAt) : "Not updated"}</p>
          </div>
        </>
      ) : catalog ? (
        <div className="mt-5 rounded-md border border-dashed border-border bg-surface p-6">
          <h3 className="font-display text-xl font-semibold">No local catalog cache yet</h3>
          <p className="mt-2 text-sm text-secondary">Run the read-only sync command.</p>
          <code className="mt-4 block overflow-x-auto rounded-md bg-primary p-3 text-xs text-white">npm run sync:square:catalog -- --all-pages --confirm-production-read-only</code>
        </div>
      ) : null}

      {error ? <p className="mt-5 rounded-md border border-red/30 bg-red/10 p-4 text-sm font-semibold text-red" role="alert">{error}</p> : null}

      {catalog && summary?.available ? (
        <div className="mt-5 overflow-hidden rounded-md border border-border bg-surface">
          <div className="border-b border-border p-4">
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submitSearch}>
              <label className="flex min-h-11 flex-1 items-center gap-3 rounded-md border border-border bg-surface px-3 focus-within:border-primary">
                <Search className="shrink-0 text-secondary" size={17} />
                <input className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" onChange={(event) => setQueryInput(event.target.value)} placeholder="Search product, variation, SKU or UPC" type="search" value={queryInput} />
              </label>
              <button className="min-h-11 rounded-md bg-primary px-5 text-sm font-semibold text-white hover:opacity-90" type="submit">Search catalog</button>
            </form>
            <p className="mt-3 text-xs text-secondary">{catalog.total.toLocaleString()} matching products · Page {catalog.page} of {Math.max(catalog.pageCount, 1)}</p>
          </div>

          <div className={`grid gap-px bg-border sm:grid-cols-2 2xl:grid-cols-3 ${isLoading ? "opacity-60" : ""}`} aria-busy={isLoading}>
            {catalog.products.map((product) => (
              <article className="min-w-0 bg-surface p-4" key={product.id}>
                <div className="flex gap-4">
                  <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-muted">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" className="h-full w-full object-contain" loading="lazy" src={product.imageUrl} />
                    ) : <ImageOff aria-label="No Square image" className="text-secondary" size={24} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 text-sm font-semibold text-primary">{product.name}</h3>
                      {product.isArchived ? <span className="rounded-pill bg-surface-muted px-2 py-1 text-[9px] font-black uppercase text-secondary">Archived</span> : null}
                    </div>
                    <p className="mt-1 text-xs text-secondary">{product.variationCount} variation{product.variationCount === 1 ? "" : "s"}</p>
                    <p className="mt-2 font-display text-lg font-semibold">{formatMoney(product.firstVariation?.priceAmount, product.firstVariation?.currency)}</p>
                    <p className="mt-1 truncate text-xs text-secondary">SKU: {product.firstVariation?.sku || "Not set"}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {product.categoryNames.slice(0, 3).map((category) => <span className="rounded-pill bg-cyan px-2 py-1 text-[10px] font-semibold text-blue" key={category}>{category}</span>)}
                  {product.categoryNames.length === 0 ? <span className="text-xs text-secondary">No Square category</span> : null}
                </div>
              </article>
            ))}
          </div>
          {!isLoading && catalog.products.length === 0 ? <p className="p-10 text-center text-sm text-secondary">No products match this search in the pages already cached.</p> : null}
          <div className="flex items-center justify-between gap-3 border-t border-border p-4">
            <button className="inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40" disabled={catalog.page <= 1 || isLoading} onClick={() => { beginRequest(); setPage(Math.max(1, catalog.page - 1)); }} type="button"><ChevronLeft className="mr-1" size={16} />Previous</button>
            <span className="text-xs font-semibold text-secondary">{catalog.page.toLocaleString()} / {Math.max(catalog.pageCount, 1).toLocaleString()}</span>
            <button className="inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40" disabled={catalog.page >= catalog.pageCount || isLoading} onClick={() => { beginRequest(); setPage(catalog.page + 1); }} type="button">Next<ChevronRight className="ml-1" size={16} /></button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CatalogMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-border bg-surface px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary">{label}</p><p className="mt-1 text-2xl font-black text-primary">{value.toLocaleString()}</p></div>;
}

function catalogStatusLabel(status: SquareCatalogCachePage["summary"]["status"]) {
  if (status === "completed") return "Full cache complete";
  if (status === "running") return "Sync running";
  if (status === "failed") return "Sync paused after an error";
  if (status === "partial") return "Partial cache ready for testing";
  return "Cache unavailable";
}

function formatMoney(amount: string | null | undefined, currency: string | null | undefined) {
  if (!amount || !currency) return "Price not set";
  const cents = Number(amount);
  if (!Number.isFinite(cents)) return "Price not set";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(value));
}
