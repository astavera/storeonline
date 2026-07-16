"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, ImageOff, Images, Layers3, LoaderCircle, Search, ShieldCheck, X } from "lucide-react";
import {
  productAgeGroups,
  type FulfillmentMode,
  type ProductAgeGroup
} from "@/features/catalog/product-catalog";
import type {
  SquareCatalogCachePage,
  SquareCatalogCategorySummary
} from "@/features/catalog/square-catalog-cache";
import type {
  BulkValueMode,
  BulkVisibilityMode,
  WebsiteBulkEdit
} from "@/features/catalog/services/bulk-merchandising-service";
import {
  websiteCategoryLabel,
  websiteSurfaceOptions,
  type WebsiteBrand,
  type WebsiteCategory,
  type WebsiteSurface
} from "@/features/catalog/services/website-merchandising-service";

type CategoryListResponse = { ok: boolean; categories: SquareCatalogCategorySummary[]; error?: string };
type CatalogPreviewResponse = SquareCatalogCachePage & { ok: boolean; error?: string };
type ApplyResponse = {
  ok: boolean;
  error?: string;
  matchedVariationCount?: number;
  updatedCount?: number;
  createdPlacementCount?: number;
  publishedCount?: number;
  skippedPublishCount?: number;
};

const fulfillmentOptions: Array<{ id: FulfillmentMode; label: string }> = [
  { id: "pickup", label: "Pickup" },
  { id: "local-delivery", label: "Local delivery" },
  { id: "shipping", label: "Shipping" }
];

const inputClassName = "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary";

export function SquareCategoryBulkEditor({
  brands,
  categories,
  disabled = false
}: {
  brands: WebsiteBrand[];
  categories: WebsiteCategory[];
  disabled?: boolean;
}) {
  const [squareCategories, setSquareCategories] = useState<SquareCatalogCategorySummary[]>([]);
  const [selectedSquareCategoryId, setSelectedSquareCategoryId] = useState("");
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [modalCatalog, setModalCatalog] = useState<CatalogPreviewResponse | null>(null);
  const [modalPage, setModalPage] = useState(1);
  const [modalQueryInput, setModalQueryInput] = useState("");
  const [modalQuery, setModalQuery] = useState("");
  const [modalReloadKey, setModalReloadKey] = useState(0);
  const [categoryMode, setCategoryMode] = useState<BulkValueMode>("add");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [brandMode, setBrandMode] = useState<BulkValueMode>("keep");
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [ageMode, setAgeMode] = useState<BulkValueMode>("keep");
  const [ageGroups, setAgeGroups] = useState<ProductAgeGroup[]>([]);
  const [fulfillmentMode, setFulfillmentMode] = useState<BulkValueMode>("keep");
  const [fulfillmentModes, setFulfillmentModes] = useState<FulfillmentMode[]>([]);
  const [surfaceMode, setSurfaceMode] = useState<BulkValueMode>("keep");
  const [surfaceIds, setSurfaceIds] = useState<WebsiteSurface[]>([]);
  const [visibilityMode, setVisibilityMode] = useState<BulkVisibilityMode>("keep");
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingModal, setIsLoadingModal] = useState(false);
  const [modalError, setModalError] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/admin/square-category-bulk", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as CategoryListResponse;
        if (!response.ok || !result.ok) throw new Error(result.error || "Square categories could not be loaded.");
        return result;
      })
      .then((result) => setSquareCategories(result.categories))
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Square categories could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingCategories(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isCatalogModalOpen || !selectedSquareCategoryId) return;

    const controller = new AbortController();
    const parameters = new URLSearchParams({ categoryId: selectedSquareCategoryId, page: String(modalPage), pageSize: "24" });
    if (modalQuery) parameters.set("q", modalQuery);

    fetch(`/api/admin/square-catalog-cache?${parameters}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as CatalogPreviewResponse;
        if (!response.ok || !result.ok) throw new Error(result.error || "The full category could not be loaded.");
        return result;
      })
      .then(setModalCatalog)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setModalError(requestError instanceof Error ? requestError.message : "The full category could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingModal(false);
      });

    return () => controller.abort();
  }, [isCatalogModalOpen, modalPage, modalQuery, modalReloadKey, selectedSquareCategoryId]);

  useEffect(() => {
    if (!isCatalogModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsCatalogModalOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isCatalogModalOpen]);

  const selectedSquareCategory = useMemo(
    () => squareCategories.find((category) => category.id === selectedSquareCategoryId) ?? null,
    [selectedSquareCategoryId, squareCategories]
  );
  const hasAction =
    hasValueChange(categoryMode, categoryIds.length) ||
    hasValueChange(brandMode, brandIds.length) ||
    hasValueChange(ageMode, ageGroups.length) ||
    hasValueChange(fulfillmentMode, fulfillmentModes.length) ||
    hasValueChange(surfaceMode, surfaceIds.length) ||
    visibilityMode !== "keep";

  function openCatalogModal() {
    if (!selectedSquareCategory) return;
    setModalCatalog(null);
    setModalError("");
    setModalPage(1);
    setModalQuery("");
    setModalQueryInput("");
    setIsLoadingModal(true);
    setIsCatalogModalOpen(true);
  }

  function submitModalSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError("");
    setIsLoadingModal(true);
    setModalPage(1);
    setModalQuery(modalQueryInput.trim());
    setModalReloadKey((value) => value + 1);
  }

  function changeModalPage(page: number) {
    setModalError("");
    setIsLoadingModal(true);
    setModalPage(page);
  }

  async function applyCategoryEdit() {
    if (!selectedSquareCategory || !hasAction || disabled) return;
    const confirmed = window.confirm(
      `Apply this website draft to all ${formatCount(selectedSquareCategory.variationCount, "variation")} in “${selectedSquareCategory.path}”? Square data will not change.`
    );
    if (!confirmed) return;

    setIsApplying(true);
    setError("");
    setSuccess("");

    const edit: WebsiteBulkEdit = {
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
      holidayMode: "keep",
      visibilityMode
    };

    try {
      const response = await fetch("/api/admin/square-category-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ squareCategoryId: selectedSquareCategory.id, edit })
      });
      const result = await response.json() as ApplyResponse;
      if (!response.ok || !result.ok) throw new Error(result.error || "The category bulk edit could not be saved.");

      const publishResult = visibilityMode === "publish-ready"
        ? ` ${Number(result.publishedCount ?? 0).toLocaleString()} published; ${Number(result.skippedPublishCount ?? 0).toLocaleString()} kept hidden for review.`
        : "";
      setSuccess(`${formatCount(Number(result.updatedCount ?? 0), "variation")} updated in the Admin draft.${publishResult}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The category bulk edit could not be saved.");
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <>
    <section className="border-b border-border bg-surface-muted p-4 md:p-6" aria-labelledby="square-category-bulk-heading">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue">Full catalog workflow</p>
            <span className="inline-flex items-center rounded-pill bg-green/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-green"><ShieldCheck className="mr-1" size={13} />Square read only</span>
          </div>
          <h3 className="mt-2 font-display text-xl font-semibold" id="square-category-bulk-heading">Edit by Square category</h3>
        </div>
        <p className="rounded-md border border-blue/20 bg-cyan px-3 py-2 text-xs font-semibold text-primary">Admin draft</p>
      </div>

      {disabled ? <p className="mt-4 rounded-md border border-yellow/50 bg-yellow/20 p-3 text-sm font-semibold text-primary">Save the pending website structure changes before running a category-wide edit.</p> : null}
      {error ? <p className="mt-4 rounded-md border border-red/30 bg-red/10 p-3 text-sm font-semibold text-red" role="alert">{error}</p> : null}
      {success ? <p className="mt-4 inline-flex w-full items-center rounded-md border border-green/25 bg-green/10 p-3 text-sm font-semibold text-green" role="status"><CheckCircle2 className="mr-2 shrink-0" size={17} />{success}</p> : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]">
        <div className="rounded-md border border-border bg-surface p-4">
          <label className="text-sm font-semibold" htmlFor="square-category-bulk-select">1. Square source category</label>
          <select
            className={`${inputClassName} mt-2`}
            disabled={disabled || isLoadingCategories}
            id="square-category-bulk-select"
            onChange={(event) => {
              setError("");
              setIsCatalogModalOpen(false);
              setModalCatalog(null);
              setModalError("");
              setSelectedSquareCategoryId(event.target.value);
              setSuccess("");
            }}
            value={selectedSquareCategoryId}
          >
            <option value="">{isLoadingCategories ? "Loading Square categories…" : "Choose a Square category"}</option>
            {squareCategories.map((category) => <option key={category.id} value={category.id}>{category.path} — {formatCount(category.itemCount, "product")}</option>)}
          </select>

          {selectedSquareCategory ? (
            <div className="mt-4 rounded-md border border-blue/20 bg-cyan p-4">
              <p className="font-semibold text-primary">{selectedSquareCategory.path}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Metric label="Products" value={selectedSquareCategory.itemCount} />
                <Metric label="Variations" value={selectedSquareCategory.variationCount} />
              </div>
            </div>
          ) : <p className="mt-4 text-xs text-secondary">Choose a category.</p>}
        </div>

        <div className="flex min-h-52 flex-col justify-between rounded-md border border-border bg-surface p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-cyan text-blue"><Images size={21} /></span>
            <div><p className="text-sm font-semibold">Category viewer</p></div>
          </div>
          {selectedSquareCategory ? (
            <div className="mt-5">
              <button className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-white hover:opacity-90" onClick={openCatalogModal} type="button"><Images className="mr-2" size={17} />View all {formatCount(selectedSquareCategory.itemCount, "product")}</button>
            </div>
          ) : <div className="mt-4 grid min-h-24 place-items-center rounded-md border border-dashed border-border bg-surface-muted p-5 text-center"><Layers3 className="text-secondary" size={24} /></div>}
        </div>
      </div>

      <div className="mt-4 rounded-md border border-border bg-surface p-4 md:p-5">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div><p className="text-sm font-semibold">2. Website categories</p></div>
          <ModeSelect ariaLabel="Website category operation" disabled={disabled} mode={categoryMode} onChange={setCategoryMode} />
        </div>
        <ChoiceList disabled={disabled || categoryMode === "keep"} onChange={setCategoryIds} options={categories.map((category) => ({ id: category.id, label: `${websiteCategoryLabel(category, categories)}${category.visible ? "" : " (hidden)"}` }))} selected={categoryIds} />
        {categories.length === 0 ? <p className="mt-3 rounded-md border border-dashed border-border p-3 text-xs text-secondary">Create website categories first, then return here to assign the Square group.</p> : null}
      </div>

      <details className="mt-4 rounded-md border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-4 text-sm font-semibold md:px-5">More settings</summary>
        <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2 md:p-5">
          <BulkChoiceField disabled={disabled} description="Assign customer-facing brands to the whole group." mode={brandMode} onModeChange={setBrandMode} onSelectionChange={setBrandIds} options={brands.map((brand) => ({ id: brand.id, label: `${brand.name}${brand.visible ? "" : " (hidden)"}` }))} selected={brandIds} title="Website brands" />
          <BulkChoiceField disabled={disabled} description="Set the recommended shopper age filters." mode={ageMode} onModeChange={setAgeMode} onSelectionChange={setAgeGroups} options={productAgeGroups.map((age) => ({ id: age.id, label: age.label }))} selected={ageGroups} title="Age ranges" />
          <BulkChoiceField disabled={disabled} description="Set pickup, delivery and shipping eligibility." mode={fulfillmentMode} onModeChange={setFulfillmentMode} onSelectionChange={setFulfillmentModes} options={fulfillmentOptions} selected={fulfillmentModes} title="Fulfillment" />
          <BulkChoiceField disabled={disabled} description="Choose where these products may appear." mode={surfaceMode} onModeChange={setSurfaceMode} onSelectionChange={setSurfaceIds} options={websiteSurfaceOptions} selected={surfaceIds} title="Website placement" />
          <fieldset className="rounded-md border border-border bg-surface-muted p-4 md:col-span-2">
            <legend className="px-1 text-sm font-semibold">Publishing</legend>
            <select className={inputClassName} disabled={disabled} onChange={(event) => setVisibilityMode(event.target.value as BulkVisibilityMode)} value={visibilityMode}>
              <option value="keep">No change</option>
              <option value="hidden">Keep the full group hidden</option>
              <option value="publish-ready">Publish only complete products</option>
            </select>
          </fieldset>
        </div>
      </details>

      <div className="mt-4 flex flex-col justify-between gap-3 rounded-md border border-primary/15 bg-primary p-4 text-white sm:flex-row sm:items-center">
        <div><p className="font-semibold">3. Apply</p></div>
        <button className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-white px-5 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-45" disabled={disabled || !selectedSquareCategory || !hasAction || isApplying} onClick={applyCategoryEdit} type="button">
          {isApplying ? <LoaderCircle className="mr-2 animate-spin" size={17} /> : null}
          {isApplying ? "Applying…" : `Apply to ${formatCount(selectedSquareCategory?.variationCount ?? 0, "variation")}`}
        </button>
      </div>
    </section>
    {isCatalogModalOpen && selectedSquareCategory && typeof document !== "undefined" ? createPortal(
      <div className="fixed inset-0 z-[100] grid place-items-center p-2 sm:p-5">
        <button aria-label="Close full category viewer" className="absolute inset-0 bg-primary/75 backdrop-blur-sm" onClick={() => setIsCatalogModalOpen(false)} type="button" />
        <section aria-labelledby="square-category-modal-heading" aria-modal="true" className="relative grid h-[min(94vh,980px)] w-full max-w-[1480px] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-white/20 bg-surface shadow-2xl" role="dialog">
          <header className="flex items-start justify-between gap-4 border-b border-border bg-surface px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue">Square category</p><span className="rounded-pill bg-green/15 px-2 py-1 text-[10px] font-black uppercase text-green">Read only</span></div>
              <h2 className="mt-1 truncate font-display text-2xl font-semibold" id="square-category-modal-heading">{selectedSquareCategory.path}</h2>
            </div>
            <button aria-label="Close category viewer" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-surface-muted text-primary hover:border-primary" onClick={() => setIsCatalogModalOpen(false)} type="button"><X size={20} /></button>
          </header>

          <div className="border-b border-border bg-surface-muted px-4 py-3 sm:px-6">
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submitModalSearch}>
              <label className="flex min-h-11 flex-1 items-center gap-3 rounded-md border border-border bg-surface px-3 focus-within:border-primary">
                <Search className="shrink-0 text-secondary" size={17} />
                <input aria-label="Search selected Square category" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" onChange={(event) => setModalQueryInput(event.target.value)} placeholder="Search product, variation, SKU or UPC" type="search" value={modalQueryInput} />
              </label>
              <button className="min-h-11 rounded-md bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={isLoadingModal} type="submit">Search category</button>
            </form>
            {modalCatalog ? <p className="mt-2 text-xs text-secondary">{formatCount(modalCatalog.total, "matching product")} · Page {modalCatalog.page.toLocaleString()} of {Math.max(modalCatalog.pageCount, 1).toLocaleString()}</p> : null}
          </div>

          <div className="min-h-0 overflow-y-auto bg-surface-muted p-3 sm:p-5" aria-busy={isLoadingModal}>
            {modalError ? <p className="mb-4 rounded-md border border-red/30 bg-red/10 p-4 text-sm font-semibold text-red" role="alert">{modalError}</p> : null}
            {modalCatalog ? (
              <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 ${isLoadingModal ? "opacity-55" : ""}`}>
                {modalCatalog.products.map((product) => (
                  <article className="min-w-0 overflow-hidden rounded-md border border-border bg-surface" key={product.id}>
                    <div className="grid aspect-[4/3] place-items-center overflow-hidden border-b border-border bg-white p-3">
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={product.name} className="h-full w-full object-contain" loading="lazy" src={product.imageUrl} />
                      ) : <div className="text-center text-secondary"><ImageOff className="mx-auto" size={28} /><p className="mt-2 text-xs">No Square image</p></div>}
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2"><h3 className="line-clamp-2 min-h-10 text-sm font-semibold text-primary">{product.name}</h3><span className="shrink-0 rounded-pill bg-cyan px-2 py-1 text-[9px] font-black uppercase text-blue">{formatCount(product.variationCount, "variation")}</span></div>
                      <p className="mt-3 font-display text-xl font-semibold">{formatCatalogMoney(product.firstVariation?.priceAmount, product.firstVariation?.currency)}</p>
                      <p className="mt-2 truncate text-xs text-secondary">Variation: {product.firstVariation?.name || "Not set"}</p>
                      <p className="mt-1 truncate text-xs text-secondary">SKU: {product.firstVariation?.sku || "Not set"}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">{product.categoryNames.slice(0, 3).map((categoryName) => <span className="rounded-pill bg-surface-muted px-2 py-1 text-[10px] font-semibold text-secondary" key={categoryName}>{categoryName}</span>)}</div>
                    </div>
                  </article>
                ))}
              </div>
            ) : <div className="grid min-h-72 place-items-center"><p className="inline-flex items-center text-sm font-semibold text-primary"><LoaderCircle className="mr-2 animate-spin text-blue" size={18} />Loading the full category…</p></div>}
            {!isLoadingModal && modalCatalog?.products.length === 0 ? <div className="grid min-h-72 place-items-center rounded-md border border-dashed border-border bg-surface p-8 text-center"><div><Search className="mx-auto text-secondary" size={26} /><p className="mt-3 font-semibold">No products found</p></div></div> : null}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 sm:px-6">
            <button className="inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40" disabled={!modalCatalog || modalCatalog.page <= 1 || isLoadingModal} onClick={() => modalCatalog && changeModalPage(Math.max(1, modalCatalog.page - 1))} type="button"><ChevronLeft className="mr-1" size={16} />Previous</button>
            <p className="text-center text-xs font-semibold text-secondary">{modalCatalog ? `${modalCatalog.page.toLocaleString()} / ${Math.max(modalCatalog.pageCount, 1).toLocaleString()}` : "Loading…"}</p>
            <button className="inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40" disabled={!modalCatalog || modalCatalog.page >= modalCatalog.pageCount || isLoadingModal} onClick={() => modalCatalog && changeModalPage(modalCatalog.page + 1)} type="button">Next<ChevronRight className="ml-1" size={16} /></button>
          </footer>
        </section>
      </div>,
      document.body
    ) : null}
    </>
  );
}

function BulkChoiceField<T extends string>({
  disabled,
  mode,
  onModeChange,
  onSelectionChange,
  options,
  selected,
  title
}: {
  description: string;
  disabled: boolean;
  mode: BulkValueMode;
  onModeChange: (mode: BulkValueMode) => void;
  onSelectionChange: (values: T[]) => void;
  options: ReadonlyArray<{ id: T; label: string }>;
  selected: T[];
  title: string;
}) {
  return (
    <fieldset className="rounded-md border border-border bg-surface-muted p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <ModeSelect ariaLabel={`${title} operation`} disabled={disabled} mode={mode} onChange={onModeChange} />
      <ChoiceList disabled={disabled || mode === "keep"} onChange={onSelectionChange} options={options} selected={selected} />
      {options.length === 0 ? <p className="mt-3 text-xs text-secondary">No options have been created yet.</p> : null}
    </fieldset>
  );
}

function ModeSelect({ ariaLabel, disabled, mode, onChange }: { ariaLabel: string; disabled: boolean; mode: BulkValueMode; onChange: (mode: BulkValueMode) => void }) {
  return (
    <select aria-label={ariaLabel} className={inputClassName} disabled={disabled} onChange={(event) => onChange(event.target.value as BulkValueMode)} value={mode}>
      <option value="keep">No change</option>
      <option value="add">Add selected</option>
      <option value="replace">Replace with selected</option>
      <option value="remove">Remove selected</option>
    </select>
  );
}

function ChoiceList<T extends string>({ disabled, onChange, options, selected }: { disabled: boolean; onChange: (values: T[]) => void; options: ReadonlyArray<{ id: T; label: string }>; selected: T[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {options.map((option) => {
        const checked = selected.includes(option.id);
        return <label className={`inline-flex items-center gap-2 rounded-pill border px-3 py-2 text-xs font-semibold ${checked ? "border-blue bg-cyan text-primary" : "border-border bg-surface text-secondary"} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`} key={option.id}><input checked={checked} disabled={disabled} onChange={(event) => onChange(toggleValue(selected, option.id, event.target.checked))} type="checkbox" />{option.label}</label>;
      })}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md bg-surface p-2"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">{label}</p><p className="mt-1 font-display text-xl font-semibold text-primary">{value.toLocaleString()}</p></div>;
}

function toggleValue<T extends string>(values: T[], value: T, checked: boolean) {
  return checked ? Array.from(new Set([...values, value])) : values.filter((current) => current !== value);
}

function hasValueChange(mode: BulkValueMode, selectedCount: number) {
  return mode === "replace" || ((mode === "add" || mode === "remove") && selectedCount > 0);
}

function formatCount(value: number, singular: string) {
  return `${value.toLocaleString()} ${value === 1 ? singular : `${singular}s`}`;
}

function formatCatalogMoney(amount: string | null | undefined, currency: string | null | undefined) {
  if (!amount || !currency) return "Price not set";
  const cents = Number(amount);
  if (!Number.isFinite(cents)) return "Price not set";

  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}
