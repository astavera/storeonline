"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, ChevronLeft, ChevronRight, ImageIcon, ListChecks, LoaderCircle, PencilLine, Search, Save, Trash2, X } from "lucide-react";
import {
  productAgeGroups,
  type FulfillmentMode,
  type ProductAgeGroup,
  type StorefrontProduct
} from "@/features/catalog/product-catalog";
import type { SquareCatalogCacheSummary, SquareCatalogCategorySummary } from "@/features/catalog/square-catalog-cache";
import {
  websiteCategoryLabel,
  websitePlacementReadinessIssues,
  websiteSurfaceOptions,
  type WebsiteBrand,
  type WebsiteCategory,
  type WebsiteHoliday,
  type WebsiteProductPlacement,
  type WebsiteSurface
} from "@/features/catalog/services/website-merchandising-service";
import { formatMoney } from "@/lib/utils";
import type {
  BulkHolidayMode,
  BulkValueMode,
  BulkVisibilityMode,
  WebsiteBulkEdit
} from "@/features/catalog/services/bulk-merchandising-service";

type FullCatalogRecord = {
  product: StorefrontProduct;
  placement: WebsiteProductPlacement;
  saved: boolean;
};

type FullCatalogResponse = {
  ok: boolean;
  error?: string;
  records: FullCatalogRecord[];
  summary: SquareCatalogCacheSummary;
  query: string;
  categoryId: string;
  websiteCategoryId: string;
  imageFilter: ImageFilter;
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
};

type ImageFilter = "all" | "with" | "without";

type CategoryResponse = { ok: boolean; categories: SquareCatalogCategorySummary[]; error?: string };

const fulfillmentOptions: Array<{ id: FulfillmentMode; label: string }> = [
  { id: "pickup", label: "Pickup" },
  { id: "local-delivery", label: "Local delivery" },
  { id: "shipping", label: "Shipping" }
];

const inputClassName = "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary";

export function FullCatalogProductManager({
  brands,
  categories,
  holidays,
  disabled = false,
  initialWebsiteCategoryId = "",
  onCategoryAssignmentsRemoved,
  onWebsiteCategoryChange
}: {
  brands: WebsiteBrand[];
  categories: WebsiteCategory[];
  holidays: WebsiteHoliday[];
  disabled?: boolean;
  initialWebsiteCategoryId?: string;
  onCategoryAssignmentsRemoved?: (categoryId: string, removedCount: number) => void;
  onWebsiteCategoryChange?: (categoryId: string) => void;
}) {
  const [catalog, setCatalog] = useState<FullCatalogResponse | null>(null);
  const [squareCategories, setSquareCategories] = useState<SquareCatalogCategorySummary[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [squareCategoryId, setSquareCategoryId] = useState("");
  const [websiteCategoryId, setWebsiteCategoryId] = useState(initialWebsiteCategoryId);
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const selectedIdRef = useRef("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<WebsiteProductPlacement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isSelectingImages, setIsSelectingImages] = useState(false);
  const [isSelectingMatches, setIsSelectingMatches] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/square-category-bulk", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as CategoryResponse;
        if (!response.ok || !result.ok) throw new Error(result.error || "Square categories could not be loaded.");
        return result;
      })
      .then((result) => setSquareCategories(result.categories))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Square categories could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({ page: String(page), pageSize: "24" });
    if (query) parameters.set("q", query);
    if (squareCategoryId) parameters.set("categoryId", squareCategoryId);
    if (websiteCategoryId) parameters.set("websiteCategoryId", websiteCategoryId);
    if (imageFilter !== "all") parameters.set("images", imageFilter);
    fetch(`/api/admin/full-catalog-products?${parameters}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as FullCatalogResponse;
        if (!response.ok || !result.ok) throw new Error(result.error || "The full catalog could not be loaded.");
        return result;
      })
      .then((result) => {
        setCatalog(result);
        const nextSelected = result.records.find((record) => record.product.squareVariationId === selectedIdRef.current) ?? result.records[0];
        selectedIdRef.current = nextSelected?.product.squareVariationId ?? "";
        setSelectedId(nextSelected?.product.squareVariationId ?? "");
        setDraft(nextSelected ? clonePlacement(nextSelected.placement) : null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "The full catalog could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [imageFilter, page, query, reloadKey, squareCategoryId, websiteCategoryId]);

  const selectedRecord = catalog?.records.find((record) => record.product.squareVariationId === selectedId) ?? null;
  const currentPageIds = catalog?.records.map((record) => record.product.squareVariationId) ?? [];
  const currentPageImageIds = catalog?.records.filter((record) => hasProductImage(record.product)).map((record) => record.product.squareVariationId) ?? [];
  const isCurrentPageSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.has(id));
  const areCurrentPageImagesSelected = currentPageImageIds.length > 0 && currentPageImageIds.every((id) => selectedIds.has(id));
  const readinessIssues = useMemo(
    () => draft ? websitePlacementReadinessIssues(draft, categories, holidays) : [],
    [categories, draft, holidays]
  );
  const selectedWebsiteCategory = categories.find((category) => category.id === websiteCategoryId) ?? null;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = queryInput.trim();
    setIsLoading(true);
    setError("");
    setPage(1);
    if (nextQuery === query && page === 1) setReloadKey((current) => current + 1);
    else setQuery(nextQuery);
  }

  function selectRecord(record: FullCatalogRecord) {
    selectedIdRef.current = record.product.squareVariationId;
    setSelectedId(record.product.squareVariationId);
    setDraft(clonePlacement(record.placement));
    setError("");
    setSuccess("");
  }

  function toggleSelected(variationId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(variationId)) next.delete(variationId);
      else next.add(variationId);
      return next;
    });
    setSuccess("");
  }

  function toggleCurrentPageSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (isCurrentPageSelected) currentPageIds.forEach((id) => next.delete(id));
      else currentPageIds.forEach((id) => next.add(id));
      return next;
    });
    setSuccess("");
  }

  function toggleCurrentPageImageSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (areCurrentPageImagesSelected) currentPageImageIds.forEach((id) => next.delete(id));
      else currentPageImageIds.forEach((id) => next.add(id));
      return next;
    });
    setSuccess("");
  }

  function changeWebsiteCategoryFilter(categoryId: string) {
    setIsLoading(true);
    setError("");
    setSuccess("");
    setSelectedIds(new Set());
    setWebsiteCategoryId(categoryId);
    setPage(1);
    onWebsiteCategoryChange?.(categoryId);
  }

  async function selectAllMatchingProducts() {
    setIsSelectingMatches(true);
    setError("");
    setSuccess("");

    try {
      const parameters = new URLSearchParams({ selection: "matching", images: imageFilter });
      if (query) parameters.set("q", query);
      if (squareCategoryId) parameters.set("categoryId", squareCategoryId);
      if (websiteCategoryId) parameters.set("websiteCategoryId", websiteCategoryId);
      const response = await fetch(`/api/admin/full-catalog-products?${parameters}`, { cache: "no-store" });
      const result = await response.json() as { ok: boolean; error?: string; variationIds?: string[]; total?: number; truncated?: boolean };
      if (!response.ok || !result.ok || !result.variationIds) throw new Error(result.error || "Matching products could not be selected.");
      if (result.truncated) {
        throw new Error(`${formatCount(result.total ?? result.variationIds.length)} products match. Refine the filters until there are 5,000 or fewer.`);
      }

      setSelectedIds(new Set(result.variationIds));
      setSuccess(result.variationIds.length ? `${formatCount(result.variationIds.length)} matching products selected.` : "No products match these filters.");
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Matching products could not be selected.");
    } finally {
      setIsSelectingMatches(false);
    }
  }

  async function selectAllMatchingImages() {
    setIsSelectingImages(true);
    setError("");
    setSuccess("");

    try {
      const parameters = new URLSearchParams({ selection: "matching", images: "with" });
      if (query) parameters.set("q", query);
      if (squareCategoryId) parameters.set("categoryId", squareCategoryId);
      if (websiteCategoryId) parameters.set("websiteCategoryId", websiteCategoryId);
      const response = await fetch(`/api/admin/full-catalog-products?${parameters}`, { cache: "no-store" });
      const result = await response.json() as { ok: boolean; error?: string; variationIds?: string[]; total?: number; truncated?: boolean };
      if (!response.ok || !result.ok || !result.variationIds) throw new Error(result.error || "Products with images could not be selected.");
      if (result.truncated) {
        throw new Error(`${formatCount(result.total ?? result.variationIds.length)} products with images match. Refine by Square category or search until there are 5,000 or fewer.`);
      }

      const next = new Set(selectedIds);
      result.variationIds.forEach((id) => next.add(id));
      if (next.size > 5_000) throw new Error("This would exceed the 5,000-product editing limit. Clear the current selection or refine the catalog first.");
      setSelectedIds(next);
      setSuccess(result.variationIds.length ? `${formatCount(result.variationIds.length)} products with images selected.` : "No products with images match these filters.");
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Products with images could not be selected.");
    } finally {
      setIsSelectingImages(false);
    }
  }

  async function removeSelectedFromWebsiteCategory() {
    if (!selectedWebsiteCategory || selectedIds.size === 0 || disabled) return;
    const variationIds = Array.from(selectedIds);
    if (!window.confirm(`Remove ${formatCount(variationIds.length)} selected products from “${selectedWebsiteCategory.name}”? The products will stay in Square and return to private review.`)) return;

    setIsBulkSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/full-catalog-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variationIds, edit: createCategoryRemovalEdit(selectedWebsiteCategory.id) })
      });
      const result = await response.json() as { ok: boolean; error?: string; updatedCount?: number };
      if (!response.ok || !result.ok) throw new Error(result.error || "The selected products could not be removed from this category.");

      const removedCount = result.updatedCount ?? variationIds.length;
      setSelectedIds(new Set());
      setSuccess(`${formatCount(removedCount)} products removed from ${selectedWebsiteCategory.name}. They remain in Square and are now private for review.`);
      onCategoryAssignmentsRemoved?.(selectedWebsiteCategory.id, removedCount);
      setIsLoading(true);
      setReloadKey((current) => current + 1);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "The selected products could not be removed from this category.");
    } finally {
      setIsBulkSaving(false);
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSuccess("");
  }

  async function applyBulkEdit(edit: WebsiteBulkEdit) {
    if (selectedIds.size === 0 || disabled) return;
    setIsBulkSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/full-catalog-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variationIds: Array.from(selectedIds), edit })
      });
      const result = await response.json() as { ok: boolean; error?: string; updatedCount?: number; publishedCount?: number; skippedPublishCount?: number };
      if (!response.ok || !result.ok) throw new Error(result.error || "The selected products could not be updated.");
      const publishedMessage = result.publishedCount ? ` ${result.publishedCount} published.` : "";
      const skippedMessage = result.skippedPublishCount ? ` ${result.skippedPublishCount} kept private because they need setup.` : "";
      setSuccess(`${result.updatedCount ?? selectedIds.size} products updated.${publishedMessage}${skippedMessage} Selection kept open for review.`);
      setIsLoading(true);
      setReloadKey((current) => current + 1);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "The selected products could not be updated.");
    } finally {
      setIsBulkSaving(false);
    }
  }

  async function savePlacement() {
    if (!draft || disabled) return;
    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/full-catalog-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placement: draft })
      });
      const result = await response.json() as { ok: boolean; error?: string; placement?: WebsiteProductPlacement; issues?: string[] };
      if (!response.ok || !result.ok || !result.placement) throw new Error(result.error || "The product could not be saved.");
      setDraft(clonePlacement(result.placement));
      setSuccess(result.placement.visible ? "Saved and visible on the website." : "Saved as a private website draft.");
      setIsLoading(true);
      setReloadKey((current) => current + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The product could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateDraft(patch: Partial<WebsiteProductPlacement>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
    setSuccess("");
  }

  function toggleHoliday(holiday: WebsiteHoliday) {
    if (!draft) return;
    const assigned = draft.holidayAssignments.some((assignment) => assignment.holidayId === holiday.id);
    updateDraft({
      holidayAssignments: assigned
        ? draft.holidayAssignments.filter((assignment) => assignment.holidayId !== holiday.id)
        : [...draft.holidayAssignments, { holidayId: holiday.id, startsAt: holiday.startDate, endsAt: holiday.endDate }]
    });
  }

  function updateHolidayDate(holidayId: string, field: "startsAt" | "endsAt", value: string) {
    if (!draft) return;
    updateDraft({
      holidayAssignments: draft.holidayAssignments.map((assignment) => assignment.holidayId === holidayId ? { ...assignment, [field]: value } : assignment)
    });
  }

  return (
    <section className="border-t border-border bg-surface p-4 md:p-6" aria-labelledby="full-catalog-products-heading" id="full-catalog-products">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-blue">Product publishing</p>
          <h2 className="mt-1 font-display text-xl font-semibold" id="full-catalog-products-heading">Full Square catalog</h2>
        </div>
        <p className="text-sm font-semibold text-secondary">
          {catalog?.summary.available ? `${formatCount(catalog.summary.variationCount)} variations · ${formatCount(catalog.summary.imageCount)} images` : "Catalog unavailable"}
        </p>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(220px,310px)_minmax(220px,310px)_180px]">
        <form className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 focus-within:border-primary" onSubmit={submitSearch}>
          <Search className="shrink-0 text-secondary" size={17} />
          <input className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" onChange={(event) => setQueryInput(event.target.value)} placeholder="Search name, SKU or GTIN" type="search" value={queryInput} />
          <button className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={isLoading} type="submit">Search</button>
        </form>
        <select aria-label="Filter by Square category" className={inputClassName} onChange={(event) => { setIsLoading(true); setError(""); setSquareCategoryId(event.target.value); setPage(1); }} value={squareCategoryId}>
          <option value="">All Square categories</option>
          {squareCategories.map((category) => <option key={category.id} value={category.id}>{category.path} ({formatCount(category.variationCount)})</option>)}
        </select>
        <select aria-label="Filter by website category" className={inputClassName} onChange={(event) => changeWebsiteCategoryFilter(event.target.value)} value={websiteCategoryId}>
          <option value="">All website category assignments</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{websiteCategoryLabel(category, categories)}</option>)}
        </select>
        <select aria-label="Filter by image" className={inputClassName} onChange={(event) => { setIsLoading(true); setError(""); setImageFilter(event.target.value as ImageFilter); setPage(1); }} value={imageFilter}>
          <option value="all">All images</option>
          <option value="with">With images</option>
          <option value="without">Without images</option>
        </select>
      </div>

      {selectedWebsiteCategory ? <div className="mt-4 rounded-md border border-blue/25 bg-cyan p-3 text-sm text-primary"><span className="font-semibold">Reviewing {selectedWebsiteCategory.name}.</span> Select the products placed here by mistake, then use “Remove from {selectedWebsiteCategory.name}”. The products are not deleted from Square.</div> : null}

      {error ? <p className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
      {success ? <p className="mt-4 rounded-md border border-green/30 bg-green/10 p-3 text-sm font-semibold text-primary" role="status">{success}</p> : null}

      <div className="mt-5 grid min-h-[700px] overflow-hidden rounded-md border border-border xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-surface-muted xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 text-xs font-semibold text-secondary">
            <span>{isLoading ? "Loading…" : `${formatCount(catalog?.total ?? 0)} matches`}</span>
            <span>{catalog?.pageCount ? `${catalog.page} / ${catalog.pageCount}` : "0 / 0"}</span>
          </div>
          <div className="border-b border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold hover:border-primary disabled:opacity-40" disabled={isLoading || currentPageIds.length === 0} onClick={toggleCurrentPageSelection} type="button"><ListChecks size={15} />{isCurrentPageSelected ? "Unselect page" : "Select page"}</button>
              <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold hover:border-primary disabled:opacity-40" disabled={isLoading || isSelectingMatches} onClick={selectAllMatchingProducts} type="button">{isSelectingMatches ? <LoaderCircle className="animate-spin" size={15} /> : <ListChecks size={15} />}All matches</button>
              <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold hover:border-primary disabled:opacity-40" disabled={isLoading || currentPageImageIds.length === 0} onClick={toggleCurrentPageImageSelection} type="button"><ImageIcon size={15} />{areCurrentPageImagesSelected ? "Unselect images" : `Select images (${currentPageImageIds.length})`}</button>
              <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold hover:border-primary disabled:opacity-40" disabled={isLoading || isSelectingImages} onClick={selectAllMatchingImages} type="button">{isSelectingImages ? <LoaderCircle className="animate-spin" size={15} /> : <ImageIcon size={15} />}All with images</button>
              {selectedIds.size > 0 ? <span className="inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-white"><PencilLine size={15} />Editing {formatCount(selectedIds.size)}</span> : null}
              {selectedIds.size > 0 && selectedWebsiteCategory ? <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-red/40 bg-red/5 px-3 text-xs font-semibold text-red hover:bg-red/10 disabled:opacity-40" disabled={disabled || isBulkSaving} onClick={removeSelectedFromWebsiteCategory} type="button"><Trash2 size={15} />Remove from {selectedWebsiteCategory.name}</button> : null}
              {selectedIds.size > 0 ? <button aria-label="Clear product selection" className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-secondary hover:bg-surface-muted" onClick={clearSelection} type="button"><X size={14} />Clear</button> : null}
            </div>
            <p className="mt-2 text-[11px] text-secondary">{selectedIds.size ? `${formatCount(selectedIds.size)} selected across all pages.` : "Select products with the checkboxes."}</p>
          </div>
          <div className="max-h-[620px] space-y-2 overflow-y-auto p-3">
            {isLoading ? <div className="flex min-h-40 items-center justify-center"><LoaderCircle className="animate-spin text-blue" size={26} /></div> : null}
            {!isLoading && catalog?.records.map((record) => {
              const active = selectedId === record.product.squareVariationId;
              const selectedForBulk = selectedIds.has(record.product.squareVariationId);
              return (
                <div className={`flex w-full items-center rounded-md border transition ${active ? "border-primary bg-surface shadow-sm" : selectedForBulk ? "border-blue/50 bg-cyan/30" : "border-border bg-surface/70 hover:border-primary"}`} key={record.product.squareVariationId}>
                  <label className="grid min-h-[72px] cursor-pointer place-items-center px-3"><span className="sr-only">Select {record.product.name}</span><input aria-label={`Select ${record.product.name}`} checked={selectedForBulk} className="h-5 w-5 accent-primary" onChange={() => toggleSelected(record.product.squareVariationId)} type="checkbox" /></label>
                  <button className="flex min-w-0 flex-1 items-center gap-3 py-2 pr-2 text-left" onClick={() => selectRecord(record)} type="button">
                  <Image alt="" className="h-14 w-14 shrink-0 rounded-md border border-border bg-white object-contain" height={56} src={record.product.imageUrl} unoptimized width={56} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-semibold text-primary">{record.product.name}</span>
                    <span className="mt-1 block truncate text-xs text-secondary">{record.product.department} · {formatMoney(record.product.priceCents)}</span>
                  </span>
                  <StatusPill placement={record.placement} saved={record.saved} />
                  </button>
                </div>
              );
            })}
            {!isLoading && catalog?.records.length === 0 ? <p className="p-8 text-center text-sm text-secondary">No Square products match this search.</p> : null}
          </div>
          <div className="flex items-center justify-between border-t border-border p-3">
            <button className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-semibold disabled:opacity-40" disabled={isLoading || (catalog?.page ?? 1) <= 1} onClick={() => { setIsLoading(true); setError(""); setPage((current) => Math.max(1, current - 1)); }} type="button"><ChevronLeft size={16} /> Previous</button>
            <button className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-semibold disabled:opacity-40" disabled={isLoading || !catalog?.pageCount || catalog.page >= catalog.pageCount} onClick={() => { setIsLoading(true); setError(""); setPage((current) => current + 1); }} type="button">Next <ChevronRight size={16} /></button>
          </div>
        </aside>

        <div className="min-w-0 bg-surface p-4 md:p-6">
          {selectedIds.size > 0 ? <FullCatalogBulkEditor brands={brands} categories={categories} disabled={disabled || isBulkSaving} holidays={holidays} isApplying={isBulkSaving} onApply={applyBulkEdit} onCancel={clearSelection} selectedCount={selectedIds.size} /> : selectedRecord && draft ? (
            <div>
              <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center">
                <Image alt={selectedRecord.product.name} className="h-24 w-24 shrink-0 rounded-md border border-border bg-white object-contain" height={96} src={selectedRecord.product.imageUrl} unoptimized width={96} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-blue">{selectedRecord.product.department}</p>
                  <h3 className="mt-1 font-display text-2xl font-semibold">{selectedRecord.product.name}</h3>
                  <p className="mt-1 text-sm text-secondary">{formatMoney(selectedRecord.product.priceCents)} · Square read only</p>
                </div>
                <StatusPill placement={draft} saved={selectedRecord.saved} />
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <ChoiceSection label="Website categories">
                  {categories.length ? categories.map((category) => <ChoiceChip checked={draft.categoryIds.includes(category.id)} disabled={disabled} key={category.id} label={websiteCategoryLabel(category, categories)} onChange={() => updateDraft({ categoryIds: toggleValue(draft.categoryIds, category.id) })} />) : <EmptyChoice href="#structure-categories" label="Create a website category first." />}
                </ChoiceSection>

                <ChoiceSection label="Visible in">
                  {websiteSurfaceOptions.map((surface) => <ChoiceChip checked={draft.surfaceIds.includes(surface.id)} disabled={disabled} key={surface.id} label={surface.label} onChange={() => updateDraft({ surfaceIds: toggleValue<WebsiteSurface>(draft.surfaceIds, surface.id) })} />)}
                </ChoiceSection>

                <ChoiceSection label="Fulfillment">
                  {fulfillmentOptions.map((option) => <ChoiceChip checked={draft.fulfillmentModes.includes(option.id)} disabled={disabled} key={option.id} label={option.label} onChange={() => updateDraft({ fulfillmentModes: toggleValue<FulfillmentMode>(draft.fulfillmentModes, option.id) })} />)}
                </ChoiceSection>

                <ChoiceSection label="Age range">
                  {productAgeGroups.map((age) => <ChoiceChip checked={draft.ageGroups.includes(age.id)} disabled={disabled} key={age.id} label={age.shortLabel} onChange={() => updateDraft({ ageGroups: toggleValue<ProductAgeGroup>(draft.ageGroups, age.id) })} />)}
                </ChoiceSection>

                <ChoiceSection label="Brands">
                  {brands.length ? brands.map((brand) => <ChoiceChip checked={draft.brandIds.includes(brand.id)} disabled={disabled} key={brand.id} label={brand.name} onChange={() => updateDraft({ brandIds: toggleValue(draft.brandIds, brand.id) })} />) : <EmptyChoice href="#structure-brands" label="No website brands yet." />}
                </ChoiceSection>

                <ChoiceSection label="Holidays">
                  {holidays.length ? holidays.map((holiday) => {
                    const assignment = draft.holidayAssignments.find((current) => current.holidayId === holiday.id);
                    return <div className="w-full" key={holiday.id}><ChoiceChip checked={Boolean(assignment)} disabled={disabled} label={holiday.name} onChange={() => toggleHoliday(holiday)} />{assignment ? <div className="mt-2 grid grid-cols-2 gap-2"><input aria-label={`${holiday.name} starts`} className={inputClassName} max={holiday.endDate} min={holiday.startDate} onChange={(event) => updateHolidayDate(holiday.id, "startsAt", event.target.value)} type="date" value={assignment.startsAt} /><input aria-label={`${holiday.name} ends`} className={inputClassName} max={holiday.endDate} min={holiday.startDate} onChange={(event) => updateHolidayDate(holiday.id, "endsAt", event.target.value)} type="date" value={assignment.endsAt} /></div> : null}</div>;
                  }) : <EmptyChoice href="#structure-holidays" label="No website holidays yet." />}
                </ChoiceSection>
              </div>

              <div className="mt-5 flex flex-col gap-4 rounded-md border border-border bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <label className="inline-flex cursor-pointer items-center gap-3 font-semibold"><input checked={draft.visible} className="h-5 w-5 accent-primary" disabled={disabled || readinessIssues.length > 0} onChange={(event) => updateDraft({ visible: event.target.checked })} type="checkbox" /> Visible on website</label>
                  {readinessIssues.length ? <p className="mt-1 text-xs text-secondary">{readinessIssues[0]}</p> : <p className="mt-1 text-xs text-secondary">Ready to publish when you choose.</p>}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-secondary">Order <input className="ml-2 min-h-10 w-24 rounded-md border border-border bg-surface px-3 text-sm text-primary" min={0} onChange={(event) => updateDraft({ sortOrder: Number(event.target.value) || 0 })} type="number" value={draft.sortOrder} /></label>
                  <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled || isSaving} onClick={savePlacement} type="button">{isSaving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />} {isSaving ? "Saving…" : "Save product"}</button>
                </div>
              </div>
            </div>
          ) : <div className="flex min-h-[480px] items-center justify-center text-sm text-secondary">Choose a Square product to classify it.</div>}
        </div>
      </div>
    </section>
  );
}

function FullCatalogBulkEditor({
  brands,
  categories,
  disabled,
  holidays,
  isApplying,
  onApply,
  onCancel,
  selectedCount
}: {
  brands: WebsiteBrand[];
  categories: WebsiteCategory[];
  disabled: boolean;
  holidays: WebsiteHoliday[];
  isApplying: boolean;
  onApply: (edit: WebsiteBulkEdit) => Promise<void>;
  onCancel: () => void;
  selectedCount: number;
}) {
  const [categoryMode, setCategoryMode] = useState<BulkValueMode>("keep");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [brandMode, setBrandMode] = useState<BulkValueMode>("keep");
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [surfaceMode, setSurfaceMode] = useState<BulkValueMode>("keep");
  const [surfaceIds, setSurfaceIds] = useState<WebsiteSurface[]>([]);
  const [ageMode, setAgeMode] = useState<BulkValueMode>("keep");
  const [ageGroups, setAgeGroups] = useState<ProductAgeGroup[]>([]);
  const [fulfillmentMode, setFulfillmentMode] = useState<BulkValueMode>("keep");
  const [fulfillmentModes, setFulfillmentModes] = useState<FulfillmentMode[]>([]);
  const [holidayMode, setHolidayMode] = useState<BulkHolidayMode>("keep");
  const [holidayId, setHolidayId] = useState("");
  const [holidayStartsAt, setHolidayStartsAt] = useState("");
  const [holidayEndsAt, setHolidayEndsAt] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [sortStep, setSortStep] = useState("0");
  const [visibilityMode, setVisibilityMode] = useState<BulkVisibilityMode>("keep");
  const [localError, setLocalError] = useState("");

  const hasAction =
    hasBulkValueAction(categoryMode, categoryIds.length) ||
    hasBulkValueAction(brandMode, brandIds.length) ||
    hasBulkValueAction(surfaceMode, surfaceIds.length) ||
    hasBulkValueAction(ageMode, ageGroups.length) ||
    hasBulkValueAction(fulfillmentMode, fulfillmentModes.length) ||
    (holidayMode !== "keep" && Boolean(holidayId)) ||
    sortOrder.trim() !== "" ||
    visibilityMode !== "keep";

  function selectHoliday(value: string) {
    setHolidayId(value);
    const holiday = holidays.find((candidate) => candidate.id === value);
    setHolidayStartsAt(holiday?.startDate ?? "");
    setHolidayEndsAt(holiday?.endDate ?? "");
  }

  async function apply() {
    setLocalError("");
    if (!hasAction) return setLocalError("Choose at least one change.");
    if (holidayMode === "assign" && (!holidayId || !holidayStartsAt || !holidayEndsAt)) return setLocalError("Choose the holiday and its product dates.");
    if (!window.confirm(`Apply this edit to ${selectedCount.toLocaleString()} selected products?`)) return;

    await onApply({
      categoryMode,
      categoryIds,
      brandMode,
      brandIds,
      surfaceMode,
      surfaceIds,
      ageMode,
      ageGroups,
      fulfillmentMode,
      fulfillmentModes,
      holidayMode,
      holidayId: holidayId || undefined,
      holidayStartsAt: holidayStartsAt || undefined,
      holidayEndsAt: holidayEndsAt || undefined,
      sortOrder: sortOrder.trim() === "" ? undefined : Math.max(0, Number.parseInt(sortOrder, 10) || 0),
      sortStep: sortOrder.trim() === "" ? undefined : Math.max(0, Number.parseInt(sortStep, 10) || 0),
      visibilityMode
    });
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-blue">Multi-product edit</p>
          <h3 className="mt-1 font-display text-2xl font-semibold">Edit {formatCount(selectedCount)} selected products</h3>
          <p className="mt-1 text-sm text-secondary">Only the fields you choose below will change.</p>
        </div>
        <button className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold" disabled={isApplying} onClick={onCancel} type="button"><X size={16} />Close</button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <BulkModeSection disabled={disabled} mode={categoryMode} onModeChange={setCategoryMode} title="Website categories">
          {categories.length ? categories.map((category) => <ChoiceChip checked={categoryIds.includes(category.id)} disabled={disabled} key={category.id} label={`${websiteCategoryLabel(category, categories)}${category.visible ? "" : " (hidden)"}`} onChange={() => { if (categoryMode === "keep") setCategoryMode("add"); setCategoryIds(toggleValue(categoryIds, category.id)); }} />) : <EmptyChoice href="#structure-categories" label="Create a website category first." />}
        </BulkModeSection>

        <BulkModeSection disabled={disabled} mode={surfaceMode} onModeChange={setSurfaceMode} title="Visible in">
          {websiteSurfaceOptions.map((surface) => <ChoiceChip checked={surfaceIds.includes(surface.id)} disabled={disabled} key={surface.id} label={surface.label} onChange={() => { if (surfaceMode === "keep") setSurfaceMode("add"); setSurfaceIds(toggleValue<WebsiteSurface>(surfaceIds, surface.id)); }} />)}
        </BulkModeSection>

        <BulkModeSection disabled={disabled} mode={fulfillmentMode} onModeChange={setFulfillmentMode} title="Fulfillment">
          {fulfillmentOptions.map((option) => <ChoiceChip checked={fulfillmentModes.includes(option.id)} disabled={disabled} key={option.id} label={option.label} onChange={() => { if (fulfillmentMode === "keep") setFulfillmentMode("add"); setFulfillmentModes(toggleValue<FulfillmentMode>(fulfillmentModes, option.id)); }} />)}
        </BulkModeSection>

        <BulkModeSection disabled={disabled} mode={ageMode} onModeChange={setAgeMode} title="Age range">
          {productAgeGroups.map((age) => <ChoiceChip checked={ageGroups.includes(age.id)} disabled={disabled} key={age.id} label={age.shortLabel} onChange={() => { if (ageMode === "keep") setAgeMode("add"); setAgeGroups(toggleValue<ProductAgeGroup>(ageGroups, age.id)); }} />)}
        </BulkModeSection>

        <BulkModeSection disabled={disabled} mode={brandMode} onModeChange={setBrandMode} title="Brands">
          {brands.length ? brands.map((brand) => <ChoiceChip checked={brandIds.includes(brand.id)} disabled={disabled} key={brand.id} label={`${brand.name}${brand.visible ? "" : " (hidden)"}`} onChange={() => { if (brandMode === "keep") setBrandMode("add"); setBrandIds(toggleValue(brandIds, brand.id)); }} />) : <EmptyChoice href="#structure-brands" label="No website brands yet." />}
        </BulkModeSection>

        <fieldset className="rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-semibold">Holiday</legend>
          <select aria-label="Holiday operation" className={inputClassName} disabled={disabled || holidays.length === 0} onChange={(event) => setHolidayMode(event.target.value as BulkHolidayMode)} value={holidayMode}>
            <option value="keep">Do not change</option>
            <option value="assign">Assign</option>
            <option value="remove">Remove</option>
          </select>
          {holidayMode !== "keep" ? <select aria-label="Holiday campaign" className={`${inputClassName} mt-3`} disabled={disabled} onChange={(event) => selectHoliday(event.target.value)} value={holidayId}><option value="">Choose holiday</option>{holidays.map((holiday) => <option key={holiday.id} value={holiday.id}>{holiday.name}</option>)}</select> : null}
          {holidayMode === "assign" && holidayId ? <div className="mt-3 grid grid-cols-2 gap-2"><input aria-label="Bulk holiday starts" className={inputClassName} onChange={(event) => setHolidayStartsAt(event.target.value)} type="date" value={holidayStartsAt} /><input aria-label="Bulk holiday ends" className={inputClassName} onChange={(event) => setHolidayEndsAt(event.target.value)} type="date" value={holidayEndsAt} /></div> : null}
        </fieldset>

        <fieldset className="rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-semibold">Publishing</legend>
          <label className="text-xs font-semibold text-secondary">Visibility<select className={`${inputClassName} mt-2`} disabled={disabled} onChange={(event) => setVisibilityMode(event.target.value as BulkVisibilityMode)} value={visibilityMode}><option value="keep">Do not change</option><option value="hidden">Keep private</option><option value="publish-ready">Publish complete products</option></select></label>
          <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-secondary">First order<input className={`${inputClassName} mt-2`} min={0} onChange={(event) => setSortOrder(event.target.value)} placeholder="No change" type="number" value={sortOrder} /></label><label className="text-xs font-semibold text-secondary">Order step<input className={`${inputClassName} mt-2`} disabled={!sortOrder} min={0} onChange={(event) => setSortStep(event.target.value)} type="number" value={sortStep} /></label></div>
        </fieldset>
      </div>

      <div className="mt-5 flex flex-col justify-between gap-4 rounded-md border border-border bg-surface-muted p-4 sm:flex-row sm:items-center">
        <div><p className="font-semibold">{formatCount(selectedCount)} products selected</p><p className="mt-1 text-xs text-secondary">Structural changes return products to a private draft unless “Publish complete products” is selected.</p>{localError ? <p className="mt-2 text-sm font-semibold text-red" role="alert">{localError}</p> : null}</div>
        <button className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled || isApplying || !hasAction} onClick={apply} type="button">{isApplying ? <LoaderCircle className="animate-spin" size={16} /> : <PencilLine size={16} />}{isApplying ? "Applying…" : `Apply to ${formatCount(selectedCount)}`}</button>
      </div>
    </div>
  );
}

function BulkModeSection({ children, disabled, mode, onModeChange, title }: { children: React.ReactNode; disabled: boolean; mode: BulkValueMode; onModeChange: (mode: BulkValueMode) => void; title: string }) {
  return <fieldset className="rounded-md border border-border p-4"><legend className="px-1 text-sm font-semibold">{title}</legend><select aria-label={`${title} operation`} className={inputClassName} disabled={disabled} onChange={(event) => onModeChange(event.target.value as BulkValueMode)} value={mode}><option value="keep">Do not change</option><option value="add">Add selected</option><option value="replace">Replace with selected</option><option value="remove">Remove selected</option></select><div className="mt-3 flex flex-wrap gap-2">{children}</div></fieldset>;
}

function hasBulkValueAction(mode: BulkValueMode, selectedCount: number) {
  return mode === "replace" || ((mode === "add" || mode === "remove") && selectedCount > 0);
}

function createCategoryRemovalEdit(categoryId: string): WebsiteBulkEdit {
  return {
    categoryMode: "remove",
    categoryIds: [categoryId],
    brandMode: "keep",
    brandIds: [],
    surfaceMode: "keep",
    surfaceIds: [],
    ageMode: "keep",
    ageGroups: [],
    fulfillmentMode: "keep",
    fulfillmentModes: [],
    holidayMode: "keep",
    visibilityMode: "keep"
  };
}

function ChoiceSection({ children, label }: { children: React.ReactNode; label: string }) {
  return <fieldset className="rounded-md border border-border p-4"><legend className="px-1 text-sm font-semibold">{label}</legend><div className="flex flex-wrap gap-2">{children}</div></fieldset>;
}

function ChoiceChip({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return <button aria-checked={checked} className={`inline-flex min-h-9 items-center gap-2 rounded-pill border px-3 text-xs font-semibold ${checked ? "border-primary bg-primary text-white" : "border-border bg-surface text-primary"} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`} disabled={disabled} onClick={onChange} role="checkbox" type="button">{checked ? <Check size={13} /> : null}{label}</button>;
}

function EmptyChoice({ href, label }: { href: string; label: string }) {
  return <a className="text-xs font-semibold text-blue underline" href={href}>{label}</a>;
}

function StatusPill({ placement, saved }: { placement: WebsiteProductPlacement; saved: boolean }) {
  const label = placement.visible ? "Live" : saved ? "Draft" : "New";
  return <span className={`shrink-0 rounded-pill px-2 py-1 text-[10px] font-black uppercase tracking-wide ${placement.visible ? "bg-green/15 text-green-800" : "bg-surface-muted text-secondary"}`}>{label}</span>;
}

function clonePlacement(placement: WebsiteProductPlacement): WebsiteProductPlacement {
  return { ...placement, categoryIds: [...placement.categoryIds], brandIds: [...placement.brandIds], holidayAssignments: placement.holidayAssignments.map((assignment) => ({ ...assignment })), ageGroups: [...placement.ageGroups], fulfillmentModes: [...placement.fulfillmentModes], surfaceIds: [...placement.surfaceIds] };
}

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((current) => current !== value) : [...values, value];
}

function hasProductImage(product: StorefrontProduct) {
  return Boolean(product.imageUrl && product.imageUrl !== "/images/product-fallback.svg");
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
