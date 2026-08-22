/**
 * Integrates Party Supplies recommendations into the existing Catalog Publishing draft.
 */

"use client";

import Image from "next/image";
import { Check, ImageOff, LoaderCircle, Palette, PencilLine, Shapes, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import {
  isApprovedPersistentPartyAsset,
  partyCategoriesByKind,
  type PartyCategoryKind
} from "@/features/catalog/services/party-merchandising-service";
import type { WebsiteCategory, WebsiteProductPlacement } from "@/features/catalog/services/website-merchandising-service";

export type PartyRecommendationDraft = {
  squareVariationId: string;
  categoryIds: string[];
};

type RecommendationRecord = PartyRecommendationDraft & {
  confidence: number;
  reasons: string[];
  product: StorefrontProduct;
};

type PartyMerchandisingManagerProps = {
  categories: WebsiteCategory[];
  placements: WebsiteProductPlacement[];
  disabled: boolean;
  onApplyRecommended: (recommendations: PartyRecommendationDraft[]) => void;
  onEditCategory: (categoryId: string) => void;
  onInitialize: () => void;
};

const sections: Array<{ kind: PartyCategoryKind; label: string; icon: typeof Sparkles }> = [
  { kind: "party-theme", label: "Themes", icon: Sparkles },
  { kind: "party-solid-color", label: "Solid Colors", icon: Palette },
  { kind: "party-product-type", label: "Product Types", icon: Shapes }
];

export function PartyMerchandisingManager({ categories, placements, disabled, onApplyRecommended, onEditCategory, onInitialize }: PartyMerchandisingManagerProps) {
  const [activeKind, setActiveKind] = useState<PartyCategoryKind>("party-theme");
  const availableCategories = useMemo(() => partyCategoriesByKind(categories, activeKind), [activeKind, categories]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(availableCategories[0]?.id ?? "");
  const [recommendations, setRecommendations] = useState<RecommendationRecord[]>([]);
  const [selectedVariationIds, setSelectedVariationIds] = useState<Set<string>>(new Set());
  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [message, setMessage] = useState("");
  const effectiveSelectedCategoryId = availableCategories.some((category) => category.id === selectedCategoryId)
    ? selectedCategoryId
    : availableCategories[0]?.id ?? "";
  const selectedCategory = categories.find((category) => category.id === effectiveSelectedCategoryId) ?? null;
  const placementByVariationId = useMemo(() => new Map(placements.map((placement) => [placement.squareVariationId, placement])), [placements]);

  useEffect(() => {
    if (!selectedCategory) return;

    const controller = new AbortController();
    void fetch("/api/admin/party-recommendations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetCategoryId: selectedCategory.id, categories }),
      signal: controller.signal
    }).then(async (response) => {
      const result = await response.json() as { ok?: boolean; recommendations?: RecommendationRecord[]; error?: string };
      if (!response.ok || !result.ok || !result.recommendations) throw new Error(result.error ?? "Unable to load recommendations.");
      const nextRecommendations = result.recommendations;
      setRecommendations(nextRecommendations);
      setSelectedVariationIds(new Set(nextRecommendations
        .filter((record) => !placementByVariationId.get(record.squareVariationId)?.categoryIds.includes(selectedCategory.id))
        .map((record) => record.squareVariationId)));
      setLoadState("loaded");
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setRecommendations([]);
      setSelectedVariationIds(new Set());
      setLoadState("error");
      setMessage(error instanceof Error ? error.message : "Unable to load recommendations.");
    });

    return () => controller.abort();
  }, [categories, placementByVariationId, selectedCategory]);

  const selectableRecommendations = recommendations.filter((record) => !placementByVariationId.get(record.squareVariationId)?.categoryIds.includes(selectedCategory?.id ?? ""));
  const allSelected = selectableRecommendations.length > 0 && selectableRecommendations.every((record) => selectedVariationIds.has(record.squareVariationId));

  function applyRecommended() {
    const selected = recommendations.filter((record) => selectedVariationIds.has(record.squareVariationId));
    if (selected.length === 0) return;
    onApplyRecommended(selected.map(({ squareVariationId, categoryIds }) => ({ squareVariationId, categoryIds })));
    setSelectedVariationIds(new Set());
    setMessage(`${selected.length.toLocaleString()} recommended product${selected.length === 1 ? "" : "s"} added to the current draft.`);
  }

  function chooseKind(kind: PartyCategoryKind) {
    setActiveKind(kind);
    chooseCategory(partyCategoriesByKind(categories, kind)[0]?.id ?? "");
  }

  function chooseCategory(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setRecommendations([]);
    setSelectedVariationIds(new Set());
    setLoadState(categoryId ? "loading" : "idle");
    setMessage("");
  }

  if (!categories.some((category) => category.slug === "party-supplies") || sections.every((section) => partyCategoriesByKind(categories, section.kind).length === 0)) {
    return (
      <section className="rounded-md border border-border bg-surface p-6">
        <div className="max-w-2xl">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-cyan text-blue"><WandSparkles size={20} /></span>
          <h2 className="mt-4 font-display text-2xl font-semibold">Set up Party Supplies merchandising</h2>
          <p className="mt-2 text-sm text-secondary">Create the hidden Themes, Solid Colors, and Product Types structure inside the existing website categories. Nothing is published until you review and save it.</p>
          <button className="mt-5 inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-white" disabled={disabled} onClick={onInitialize} type="button"><WandSparkles className="mr-2" size={17} />Create party structure</button>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-md border border-border bg-surface">
      <header className="border-b border-border p-3 sm:p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Party merchandising categories">
            {sections.map((section) => {
              const Icon = section.icon;
              const active = activeKind === section.kind;
              return <button aria-selected={active} className={`inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-semibold ${active ? "border-primary bg-primary text-white" : "border-border text-secondary hover:bg-surface-muted hover:text-primary"}`} key={section.kind} onClick={() => chooseKind(section.kind)} role="tab" type="button"><Icon className="mr-2" size={16} />{section.label}</button>;
            })}
          </div>
          <button className="inline-flex min-h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold hover:bg-surface-muted" disabled={disabled} onClick={onInitialize} type="button">Complete structure</button>
        </div>
      </header>

      <div className="grid min-h-[620px] lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-surface-muted p-4 lg:border-b-0 lg:border-r">
          <p className="px-1 text-xs font-semibold uppercase tracking-[0.1em] text-secondary">{sections.find((section) => section.kind === activeKind)?.label}</p>
          <div className="mt-3 space-y-2">
            {availableCategories.map((category) => {
              const active = category.id === effectiveSelectedCategoryId;
              const assignedCount = placements.filter((placement) => placement.categoryIds.includes(category.id)).length;
              return (
                <button aria-pressed={active} className={`flex w-full items-center gap-3 rounded-md border p-3 text-left ${active ? "border-primary bg-primary text-white" : "border-border bg-surface hover:border-primary"}`} key={category.id} onClick={() => chooseCategory(category.id)} type="button">
                  {category.kind === "party-solid-color" ? <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: category.swatchColor || "#D9DDE3" }} /> : <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${active ? "bg-white/15" : "bg-cyan text-blue"}`}>{category.kind === "party-theme" ? <Sparkles size={15} /> : <Shapes size={15} />}</span>}
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{category.name}</span><span className={`mt-0.5 block text-xs ${active ? "text-white/70" : "text-secondary"}`}>{assignedCount.toLocaleString()} assigned</span></span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 p-4 md:p-6">
          {selectedCategory ? <>
            <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-2xl font-semibold">{selectedCategory.name}</h3>
                  <span className={`rounded-pill px-2.5 py-1 text-xs font-semibold ${selectedCategory.visible ? "bg-green/10 text-green" : "bg-surface-muted text-secondary"}`}>{selectedCategory.visible ? "Visible" : "Hidden draft"}</span>
                  {selectedCategory.kind === "party-theme" && !isApprovedPersistentPartyAsset(selectedCategory.imageUrl) ? <span className="inline-flex items-center rounded-pill bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900"><ImageOff className="mr-1.5" size={14} />Missing valid image</span> : null}
                </div>
                <p className="mt-2 text-sm text-secondary">Recommended matches remain private until the existing Save changes workflow is completed.</p>
              </div>
              <button className="inline-flex min-h-10 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold hover:bg-surface-muted" onClick={() => onEditCategory(selectedCategory.id)} type="button"><PencilLine className="mr-2" size={16} />Edit category details</button>
            </div>

            <div className="mt-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <label className="inline-flex items-center gap-2 text-sm font-semibold"><input checked={allSelected} className="h-5 w-5 accent-primary" disabled={selectableRecommendations.length === 0} onChange={(event) => setSelectedVariationIds(event.target.checked ? new Set(selectableRecommendations.map((record) => record.squareVariationId)) : new Set())} type="checkbox" />Select all recommended</label>
              <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-semibold text-secondary">{selectedVariationIds.size.toLocaleString()} selected</span><button className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled || loadState === "loading" || selectedVariationIds.size === 0} onClick={applyRecommended} type="button"><Check className="mr-2" size={17} />Apply Recommended</button></div>
            </div>

            {selectedCategory.kind === "party-solid-color" ? <p className="mt-4 rounded-md border border-blue/20 bg-cyan p-3 text-sm text-primary">Eligibility is restricted to plain plates, napkins, cups, cutlery, and table covers with one color and no character, licensed theme, or pattern.</p> : null}
            {message ? <p aria-live="polite" className={`mt-4 rounded-md p-3 text-sm font-semibold ${loadState === "error" ? "bg-red/10 text-red" : "bg-green/10 text-green"}`}>{message}</p> : null}

            <div className="mt-5 overflow-hidden rounded-md border border-border">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-surface-muted px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-secondary"><span>Recommended catalog items</span><span>{recommendations.length.toLocaleString()}</span></div>
              {loadState === "loading" ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="animate-spin text-blue" size={26} /></div> : null}
              {loadState === "loaded" && recommendations.length === 0 ? <p className="p-10 text-center text-sm text-secondary">No catalog products match this recommendation rule yet.</p> : null}
              {loadState === "loaded" ? <div className="divide-y divide-border">{recommendations.map((record) => {
                const alreadyAssigned = placementByVariationId.get(record.squareVariationId)?.categoryIds.includes(selectedCategory.id) ?? false;
                const checked = selectedVariationIds.has(record.squareVariationId);
                const assignmentNames = record.categoryIds.map((id) => categories.find((category) => category.id === id)?.name).filter((name): name is string => Boolean(name));
                return (
                  <label className={`grid gap-3 p-4 sm:grid-cols-[auto_56px_minmax(0,1fr)_auto] sm:items-center ${alreadyAssigned ? "bg-green/5" : "cursor-pointer hover:bg-surface-muted"}`} key={record.squareVariationId}>
                    <input aria-label={`Select ${record.product.name}`} checked={checked} className="h-5 w-5 accent-primary" disabled={alreadyAssigned} onChange={() => setSelectedVariationIds((current) => { const next = new Set(current); if (next.has(record.squareVariationId)) next.delete(record.squareVariationId); else next.add(record.squareVariationId); return next; })} type="checkbox" />
                    <Image alt="" className="h-14 w-14 rounded-md border border-border bg-white object-contain" height={56} src={record.product.imageUrl} unoptimized width={56} />
                    <span className="min-w-0"><span className="block text-sm font-semibold text-primary">{record.product.name}</span><span className="mt-1 block text-xs text-secondary">{record.reasons.join(" · ")}</span><span className="mt-2 flex flex-wrap gap-1.5">{assignmentNames.map((name) => <span className="rounded-pill bg-cyan px-2 py-1 text-[11px] font-semibold text-primary" key={name}>{name}</span>)}</span></span>
                    <span className="justify-self-start text-xs font-semibold sm:justify-self-end">{alreadyAssigned ? <span className="text-green">Included</span> : `${record.confidence}% match`}</span>
                  </label>
                );
              })}</div> : null}
            </div>
          </> : <div className="grid min-h-[420px] place-items-center text-center text-sm text-secondary">Choose a Party Supplies category.</div>}
        </div>
      </div>
    </section>
  );
}
