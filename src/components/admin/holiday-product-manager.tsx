/**
 * Renders the holiday product manager interface and its user interactions.
 */

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, ChevronLeft, ChevronRight, ImageOff, Search } from "lucide-react";
import type { SquareCatalogCachePage, SquareCatalogCacheProduct } from "@/features/catalog/square-catalog-cache";
import type { WebsiteHoliday } from "@/features/catalog/services/website-merchandising-service";

type HolidayCatalogProduct = SquareCatalogCacheProduct & {
  assignableVariationCount: number;
  assignedVariationCount: number;
  assignmentStatus: "none" | "partial" | "all";
};

type HolidayCatalogResponse = Omit<SquareCatalogCachePage, "products"> & {
  ok: boolean;
  assignedVariationCount: number;
  products: HolidayCatalogProduct[];
};

type MutationResponse = {
  ok?: boolean;
  error?: string;
  variationIds?: string[];
  updatedCount?: number;
};

export type HolidayProductMutation = {
  action: "assign" | "remove";
  endsAt: string;
  startsAt: string;
  variationIds: string[];
};

export function HolidayProductManager({
  disabled,
  holiday,
  onApplied
}: {
  disabled: boolean;
  holiday: WebsiteHoliday;
  onApplied: (mutation: HolidayProductMutation) => void;
}) {
  const [catalog, setCatalog] = useState<HolidayCatalogResponse | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [startsAt, setStartsAt] = useState(holiday.startDate);
  const [endsAt, setEndsAt] = useState(holiday.endDate);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ holidayId: holiday.id, page: String(page), pageSize: "24" });
    if (query) params.set("q", query);

    fetch(`/api/admin/holiday-products?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as HolidayCatalogResponse & { error?: string };
        if (!response.ok) throw new Error(result.error || "Unable to load products.");
        return result;
      })
      .then(setCatalog)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage(error instanceof Error ? error.message : "Unable to load products.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [holiday.id, page, query, reloadKey]);

  function beginLoad() {
    setIsLoading(true);
    setMessage("");
    setSelectedItemIds(new Set());
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    beginLoad();
    setPage(1);
    setQuery(queryInput.trim());
    setReloadKey((current) => current + 1);
  }

  function toggleItem(itemId: string, checked: boolean) {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  function selectPage() {
    setSelectedItemIds(new Set((catalog?.products ?? []).filter(isAssignableProduct).map((product) => product.id)));
  }

  async function apply(action: "assign" | "remove") {
    if (disabled || selectedItemIds.size === 0) return;
    setIsApplying(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/holiday-products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ holidayId: holiday.id, itemIds: Array.from(selectedItemIds), action, startsAt, endsAt })
      });
      const result = await response.json() as MutationResponse;
      if (!response.ok || !result.ok || !result.variationIds) throw new Error(result.error || "Unable to update products.");

      onApplied({ action, startsAt, endsAt, variationIds: result.variationIds });
      setMessage(`${result.updatedCount ?? result.variationIds.length} variation${(result.updatedCount ?? result.variationIds.length) === 1 ? "" : "s"} updated.`);
      setSelectedItemIds(new Set());
      setReloadKey((current) => current + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update products.");
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section className="border-t border-border" aria-labelledby="holiday-products-heading">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="font-display text-lg font-semibold" id="holiday-products-heading">Products</h4>
          <p className="text-xs text-secondary">{catalog?.assignedVariationCount.toLocaleString() ?? 0} assigned variations</p>
        </div>
        <form className="flex min-w-0 flex-1 gap-2 sm:max-w-xl" onSubmit={submitSearch}>
          <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3 focus-within:border-border">
            <Search aria-hidden="true" className="shrink-0 text-secondary" size={15} />
            <span className="sr-only">Search Square products</span>
            <input className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" onChange={(event) => setQueryInput(event.target.value)} placeholder="Search products" type="search" value={queryInput} />
          </label>
          <button className="rounded-md border border-border px-3 text-sm font-semibold" type="submit">Search</button>
        </form>
      </div>

      {disabled ? <p className="mx-4 mb-4 rounded-md border border-yellow/40 bg-yellow/15 px-3 py-2 text-xs font-semibold">Save changes before editing products.</p> : null}
      {message ? <p aria-live="polite" className="mx-4 mb-4 rounded-md border border-border bg-surface-muted px-3 py-2 text-xs font-semibold">{message}</p> : null}

      <div className={`grid gap-px border-y border-border bg-border sm:grid-cols-2 ${isLoading ? "opacity-60" : ""}`} aria-busy={isLoading}>
        {(catalog?.products ?? []).map((product) => {
          const selectable = isAssignableProduct(product) && !disabled;
          const selected = selectedItemIds.has(product.id);
          return (
            <label className={`flex min-w-0 gap-3 bg-surface p-3 ${selectable ? "cursor-pointer hover:bg-surface-muted" : "opacity-60"}`} key={product.id}>
              <input checked={selected} className="mt-1 h-4 w-4 shrink-0" disabled={!selectable} onChange={(event) => toggleItem(product.id, event.target.checked)} type="checkbox" />
              <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-muted">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" className="h-full w-full object-contain" loading="lazy" src={product.imageUrl} />
                ) : <ImageOff aria-label="No Square image" className="text-secondary" size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-semibold text-primary">{product.name}</span>
                <span className="mt-1 block text-xs text-secondary">{formatCatalogMoney(product.firstVariation?.priceAmount, product.firstVariation?.currency)} · {product.assignableVariationCount} variation{product.assignableVariationCount === 1 ? "" : "s"}</span>
                <span className={`mt-1.5 inline-flex rounded-pill px-2 py-0.5 text-[10px] font-black uppercase ${assignmentTone(product.assignmentStatus)}`}>{assignmentLabel(product.assignmentStatus)}</span>
              </span>
            </label>
          );
        })}
        {!isLoading && catalog?.products.length === 0 ? <p className="bg-surface p-8 text-center text-sm text-secondary sm:col-span-2">No products found.</p> : null}
      </div>

      <div className="grid gap-3 p-4 xl:grid-cols-[auto_1fr_auto] xl:items-end">
        <div className="flex gap-2">
          <button className="min-h-10 rounded-md border border-border px-3 text-xs font-semibold disabled:opacity-40" disabled={disabled || !catalog?.products.some(isAssignableProduct)} onClick={selectPage} type="button">Select page</button>
          <button className="min-h-10 rounded-md border border-border px-3 text-xs font-semibold disabled:opacity-40" disabled={selectedItemIds.size === 0} onClick={() => setSelectedItemIds(new Set())} type="button">Clear</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold">Starts<input className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" max={holiday.endDate} min={holiday.startDate} onChange={(event) => setStartsAt(event.target.value)} type="date" value={startsAt} /></label>
          <label className="text-xs font-semibold">Ends<input className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" max={holiday.endDate} min={holiday.startDate} onChange={(event) => setEndsAt(event.target.value)} type="date" value={endsAt} /></label>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <button className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-40" disabled={disabled || isApplying || selectedItemIds.size === 0} onClick={() => void apply("assign")} type="button"><Check className="mr-2" size={15} />Add {selectedItemIds.size || ""}</button>
          <button className="min-h-10 rounded-md border border-border px-4 text-sm font-semibold disabled:opacity-40" disabled={disabled || isApplying || selectedItemIds.size === 0} onClick={() => void apply("remove")} type="button">Remove</button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <button className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs font-semibold disabled:opacity-40" disabled={isLoading || !catalog || catalog.page <= 1} onClick={() => { beginLoad(); setPage((current) => Math.max(1, current - 1)); }} type="button"><ChevronLeft className="mr-1" size={14} />Previous</button>
        <span className="text-xs font-semibold text-secondary">{catalog?.page.toLocaleString() ?? 1} / {Math.max(catalog?.pageCount ?? 1, 1).toLocaleString()}</span>
        <button className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs font-semibold disabled:opacity-40" disabled={isLoading || !catalog || catalog.page >= catalog.pageCount} onClick={() => { beginLoad(); setPage((current) => current + 1); }} type="button">Next<ChevronRight className="ml-1" size={14} /></button>
      </div>
    </section>
  );
}

function isAssignableProduct(product: HolidayCatalogProduct) {
  return !product.isArchived && product.assignableVariationCount > 0;
}

function assignmentLabel(status: HolidayCatalogProduct["assignmentStatus"]) {
  if (status === "all") return "Included";
  if (status === "partial") return "Partial";
  return "Not included";
}

function assignmentTone(status: HolidayCatalogProduct["assignmentStatus"]) {
  if (status === "all") return "bg-green/15 text-green";
  if (status === "partial") return "bg-yellow/30 text-primary";
  return "bg-surface-muted text-secondary";
}

function formatCatalogMoney(amount: string | null | undefined, currency: string | null | undefined) {
  if (!amount || !currency) return "No price";
  const cents = Number(amount);
  if (!Number.isFinite(cents)) return "No price";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}
