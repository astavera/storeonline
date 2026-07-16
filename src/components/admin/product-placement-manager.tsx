/*
STORE AREA: Admin
SECTION: Product Merchandising Workspace
SECTION ID: admin.product-placement-manager
CUSTOMER-FACING: No
ADMIN-EDITABLE: No
WHAT THIS CONTROLS: Explicit website publishing, categories, holidays, placement, age, and fulfillment for read-only Square products.
SAFE TO EDIT: Website merchandising controls and presentation.
DO NOT EDIT HERE: Square categories, prices, inventory, payment logic, or token handling.
RELATED FILES: src/features/catalog/services/website-merchandising-service.ts, src/server/admin/website-merchandising-store.ts
BUSINESS LOGIC FILES: src/features/catalog/services/website-merchandising-service.ts
*/

"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Download, Eye, EyeOff, FileSpreadsheet, Folder, FolderTree, Palette, Plus, Save, Search, Trash2, Upload } from "lucide-react";
import { SectionFrame } from "@/components/sections/section-frame";
import { Button } from "@/components/ui/button";
import { BrandGtinImporter, type BrandGtinMutation } from "@/components/admin/brand-gtin-importer";
import { HolidayProductManager, type HolidayProductMutation } from "@/components/admin/holiday-product-manager";
import { SquareCatalogTestPanel } from "@/components/admin/square-catalog-test-panel";
import { SquareCategoryBulkEditor } from "@/components/admin/square-category-bulk-editor";
import { FullCatalogProductManager } from "@/components/admin/full-catalog-product-manager";
import {
  productAgeGroups,
  type FulfillmentMode,
  type ProductAgeGroup,
  type StorefrontProduct
} from "@/features/catalog/product-catalog";
import {
  orderWebsiteCategories,
  slugifyWebsiteCategory,
  websiteCategoryLabel,
  websitePlacementReadinessIssues,
  websiteSurfaceOptions,
  type WebsiteBrand,
  type WebsiteCategory,
  type WebsiteHoliday,
  type WebsiteProductPlacement,
  type WebsiteSurface,
  type WebsiteMerchandisingConfig
} from "@/features/catalog/services/website-merchandising-service";
import {
  applyWebsiteBulkEdit,
  type BulkHolidayMode,
  type BulkValueMode,
  type BulkVisibilityMode,
  type WebsiteBulkEdit
} from "@/features/catalog/services/bulk-merchandising-service";
import {
  applyWebsiteMerchandisingSpreadsheetRows,
  createWebsiteMerchandisingCsv,
  parseCsvTable,
  parseWebsiteMerchandisingTable,
  type MerchandisingSpreadsheetParseResult,
  type MerchandisingSpreadsheetPatch
} from "@/features/catalog/services/merchandising-spreadsheet-service";
import { formatMoney } from "@/lib/utils";
import type { SquareVendorReference } from "@/server/square/read-only-catalog";

type ProductPlacementManagerProps = {
  products: StorefrontProduct[];
  initialConfig: WebsiteMerchandisingConfig;
  fetchedAt: string;
  hasMoreItems: boolean;
  squareVendors: SquareVendorReference[];
  initialBrandProductCounts: Record<string, number>;
  initialCategoryProductCounts: Record<string, number>;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type ProductFilter = "all" | "needs-setup" | "ready" | "live";
type WorkspaceModule = "overview" | "structure" | "products" | "catalog-test" | "bulk";
type StructureModule = "brands" | "categories" | "holidays";

const fulfillmentOptions: Array<{ id: FulfillmentMode; label: string }> = [
  { id: "pickup", label: "Pickup" },
  { id: "local-delivery", label: "Local delivery" },
  { id: "shipping", label: "Shipping" }
];

export function ProductPlacementManager({ products, initialConfig, fetchedAt, hasMoreItems, initialBrandProductCounts, initialCategoryProductCounts, squareVendors }: ProductPlacementManagerProps) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialConfig.categories);
  const [brands, setBrands] = useState(initialConfig.brands);
  const [holidays, setHolidays] = useState(initialConfig.holidays);
  const [placements, setPlacements] = useState(initialConfig.placements);
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialConfig.categories[0]?.id ?? "");
  const [selectedBrandId, setSelectedBrandId] = useState(initialConfig.brands[0]?.id ?? "");
  const [selectedHolidayId, setSelectedHolidayId] = useState(initialConfig.holidays[0]?.id ?? "");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [newCategoryParentId, setNewCategoryParentId] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandDescription, setNewBrandDescription] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayDescription, setNewHolidayDescription] = useState("");
  const [newHolidayStartDate, setNewHolidayStartDate] = useState("");
  const [newHolidayEndDate, setNewHolidayEndDate] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isDirty, setIsDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState("Square products are hidden until every website decision is complete.");
  const [brandProductCountOverrides, setBrandProductCountOverrides] = useState(initialBrandProductCounts);

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId) ?? null;
  const selectedHoliday = holidays.find((holiday) => holiday.id === selectedHolidayId) ?? null;
  const catalogPublishingHash = useSyncExternalStore(subscribeToCatalogHashChange, readCatalogPublishingHash, () => "#overview");
  const { activeModule, structureModule } = resolveCatalogPublishingModule(catalogPublishingHash);
  const placementByProduct = useMemo(() => new Map(placements.map((placement) => [placement.squareVariationId, placement])), [placements]);
  const liveProductCount = placements.filter((placement) => placement.visible && placementIssues(placement, categories, holidays).length === 0).length;
  const readyProductCount = placements.filter((placement) => !placement.visible && placementIssues(placement, categories, holidays).length === 0).length;
  const pendingProductCount = placements.length - liveProductCount - readyProductCount;
  const productCountByBrand = useMemo(() => Object.fromEntries(brands.map((brand) => [brand.id, brandProductCountOverrides[brand.id] ?? placements.filter((placement) => placement.brandIds.includes(brand.id)).length])), [brandProductCountOverrides, brands, placements]);
  const productCountByCategory = useMemo(() => Object.fromEntries(categories.map((category) => [category.id, initialCategoryProductCounts[category.id] ?? placements.filter((placement) => placement.categoryIds.includes(category.id)).length])), [categories, initialCategoryProductCounts, placements]);
  function markChanged(message = "Unsaved website merchandising changes.") {
    setIsDirty(true);
    setSaveState("idle");
    setSaveMessage(message);
  }

  function addCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      return showError("Enter a category name first.");
    }

    const parentId = newCategoryParentId || null;
    const parent = parentId ? categories.find((category) => category.id === parentId && !category.parentId) : null;
    if (parentId && !parent) {
      return showError("Choose a valid main category for this subcategory.");
    }
    const slug = uniqueSlug(name, categories.map((category) => category.slug));
    const siblings = categories.filter((category) => category.parentId === parentId);
    const category: WebsiteCategory = {
      id: `web-category-${slug}`,
      name,
      slug,
      description: newCategoryDescription.trim(),
      parentId,
      visible: false,
      sortOrder: siblings.length
    };

    setCategories((current) => orderWebsiteCategories([...current, category]));
    setSelectedCategoryId(category.id);
    setNewCategoryName("");
    setNewCategoryDescription("");
    setNewCategoryParentId("");
    markChanged("Website category created as hidden. Enable it when it is ready.");
  }

  function updateCategory(patch: Partial<WebsiteCategory>) {
    if (!selectedCategory) return;
    if (patch.parentId !== undefined && patch.parentId !== selectedCategory.parentId) {
      if (patch.parentId && categories.some((category) => category.parentId === selectedCategory.id)) {
        return showError("Move or remove this category's subcategories before turning it into a subcategory.");
      }
      const parent = patch.parentId ? categories.find((category) => category.id === patch.parentId) : null;
      if (patch.parentId && (!parent || parent.parentId)) {
        return showError("Subcategories can only be placed under a main category.");
      }
      const nextSortOrder = categories.filter((category) => category.parentId === (patch.parentId ?? null) && category.id !== selectedCategory.id).length;
      patch = { ...patch, sortOrder: nextSortOrder };
    }

    setCategories((current) => normalizeCategorySiblingOrder(current.map((category) => (category.id === selectedCategory.id ? { ...category, ...patch } : category))));
    if (patch.visible === false || patch.parentId !== undefined) {
      const affectedCategoryIds = new Set([selectedCategory.id, ...categories.filter((category) => category.parentId === selectedCategory.id).map((category) => category.id)]);
      setPlacements((current) => current.map((placement) => (placement.categoryIds.some((id) => affectedCategoryIds.has(id)) ? { ...placement, visible: false } : placement)));
    }
    markChanged();
  }

  function moveCategory(direction: "up" | "down") {
    if (!selectedCategory) return;
    const siblings = categories.filter((category) => category.parentId === selectedCategory.parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const currentIndex = siblings.findIndex((category) => category.id === selectedCategory.id);
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= siblings.length) return;

    const reorderedSiblings = [...siblings];
    [reorderedSiblings[currentIndex], reorderedSiblings[nextIndex]] = [reorderedSiblings[nextIndex], reorderedSiblings[currentIndex]];
    const sortOrderById = new Map(reorderedSiblings.map((category, index) => [category.id, index]));
    setCategories((current) => orderWebsiteCategories(current.map((category) => sortOrderById.has(category.id) ? { ...category, sortOrder: sortOrderById.get(category.id) ?? category.sortOrder } : category)));
    markChanged("Website category order updated.");
  }

  function addBrand(squareVendor?: SquareVendorReference) {
    const name = (squareVendor?.name ?? newBrandName).trim();
    if (!name) return showError("Enter a brand name or choose a Square vendor first.");
    const slug = uniqueSlug(name, brands.map((brand) => brand.slug));
    const brand: WebsiteBrand = {
      id: `web-brand-${slug}`,
      name,
      slug,
      description: newBrandDescription.trim(),
      logoUrl: "",
      imageAlt: `${name} logo`,
      squareVendorIds: squareVendor ? [squareVendor.id] : [],
      visible: false,
      featuredOnHomepage: false,
      sortOrder: brands.length
    };
    setBrands((current) => [...current, brand]);
    setSelectedBrandId(brand.id);
    setNewBrandName("");
    setNewBrandDescription("");
    markChanged("Website brand created as hidden. Add its logo, assign products, and enable it when ready.");
  }

  function updateBrand(patch: Partial<WebsiteBrand>) {
    if (!selectedBrand) return;
    const normalizedPatch = patch.visible === false || patch.logoUrl === "" ? { ...patch, featuredOnHomepage: false } : patch;
    setBrands((current) => current.map((brand) => (brand.id === selectedBrand.id ? { ...brand, ...normalizedPatch } : brand)));
    if (patch.visible === false) {
      setPlacements((current) => current.map((placement) => (placement.brandIds.includes(selectedBrand.id) ? { ...placement, visible: false } : placement)));
    }
    markChanged();
  }

  function removeBrand() {
    if (!selectedBrand || !window.confirm(`Remove “${selectedBrand.name}” from the website? Square will not change.`)) return;
    const remaining = brands.filter((brand) => brand.id !== selectedBrand.id);
    setBrands(remaining.map((brand, index) => ({ ...brand, sortOrder: index })));
    setPlacements((current) => current.map((placement) => ({ ...placement, brandIds: placement.brandIds.filter((id) => id !== selectedBrand.id), visible: false })));
    setSelectedBrandId(remaining[0]?.id ?? "");
    markChanged("Brand removed. Affected products returned to hidden review.");
  }

  function removeCategory() {
    if (!selectedCategory || !window.confirm(`Remove “${selectedCategory.name}” from the website? Square will not change.`)) return;
    if (categories.some((category) => category.parentId === selectedCategory.id)) {
      return showError("Move or remove this category's subcategories first.");
    }
    const remaining = categories.filter((category) => category.id !== selectedCategory.id);
    setCategories(normalizeCategorySiblingOrder(remaining));
    setPlacements((current) => current.map((placement) => ({ ...placement, categoryIds: placement.categoryIds.filter((id) => id !== selectedCategory.id), visible: false })));
    setSelectedCategoryId(remaining[0]?.id ?? "");
    markChanged("Category removed. Affected products returned to hidden review.");
  }

  function addHoliday() {
    const name = newHolidayName.trim();
    if (!name || !newHolidayStartDate || !newHolidayEndDate) {
      return showError("Enter a holiday name, start date, and end date.");
    }
    if (newHolidayStartDate > newHolidayEndDate) {
      return showError("Holiday end date must be on or after its start date.");
    }

    const slug = uniqueSlug(name, holidays.map((currentHoliday) => currentHoliday.slug));
    const holiday: WebsiteHoliday = {
      id: `web-holiday-${slug}`,
      name,
      slug,
      description: newHolidayDescription.trim(),
      startDate: newHolidayStartDate,
      endDate: newHolidayEndDate,
      visible: false,
      sortOrder: holidays.length
    };

    setHolidays((current) => [...current, holiday]);
    setSelectedHolidayId(holiday.id);
    setNewHolidayName("");
    setNewHolidayDescription("");
    setNewHolidayStartDate("");
    setNewHolidayEndDate("");
    markChanged("Holiday created as hidden. Product schedules default to this date range.");
  }

  function updateHoliday(patch: Partial<WebsiteHoliday>) {
    if (!selectedHoliday) return;
    setHolidays((current) => current.map((holiday) => (holiday.id === selectedHoliday.id ? { ...holiday, ...patch } : holiday)));
    if (patch.visible === false || patch.startDate !== undefined || patch.endDate !== undefined) {
      setPlacements((current) => current.map((placement) => (placement.holidayAssignments.some((assignment) => assignment.holidayId === selectedHoliday.id) ? { ...placement, visible: false } : placement)));
    }
    markChanged();
  }

  function removeHoliday() {
    if (!selectedHoliday || !window.confirm(`Remove the “${selectedHoliday.name}” holiday campaign?`)) return;
    const remaining = holidays.filter((holiday) => holiday.id !== selectedHoliday.id);
    setHolidays(remaining.map((holiday, index) => ({ ...holiday, sortOrder: index })));
    setPlacements((current) => current.map((placement) => ({
      ...placement,
      holidayAssignments: placement.holidayAssignments.filter((assignment) => assignment.holidayId !== selectedHoliday.id),
      surfaceIds: placement.holidayAssignments.some((assignment) => assignment.holidayId !== selectedHoliday.id) ? placement.surfaceIds : placement.surfaceIds.filter((surfaceId) => surfaceId !== "holiday-pages"),
      visible: false
    })));
    setSelectedHolidayId(remaining[0]?.id ?? "");
    markChanged("Holiday removed. Affected products returned to hidden review.");
  }

  function syncHolidayProducts(mutation: HolidayProductMutation) {
    const changedIds = new Set(mutation.variationIds);
    setPlacements((current) => current.map((placement) => {
      if (!changedIds.has(placement.squareVariationId) || !selectedHoliday) return placement;
      const otherAssignments = placement.holidayAssignments.filter((assignment) => assignment.holidayId !== selectedHoliday.id);

      if (mutation.action === "assign") {
        return {
          ...placement,
          holidayAssignments: [...otherAssignments, { holidayId: selectedHoliday.id, startsAt: mutation.startsAt, endsAt: mutation.endsAt }],
          surfaceIds: Array.from(new Set([...placement.surfaceIds, "holiday-pages" as const])),
          visible: false
        };
      }

      return {
        ...placement,
        holidayAssignments: otherAssignments,
        surfaceIds: otherAssignments.length > 0 ? placement.surfaceIds : placement.surfaceIds.filter((surfaceId) => surfaceId !== "holiday-pages"),
        visible: false
      };
    }));
    setSaveState("saved");
    setSaveMessage(`${mutation.variationIds.length} Square variation${mutation.variationIds.length === 1 ? "" : "s"} updated for ${selectedHoliday?.name ?? "holiday"}.`);
  }

  function syncBrandProducts(mutation: BrandGtinMutation) {
    if (!selectedBrand) return;
    const brandId = selectedBrand.id;
    const changedIds = new Set(mutation.variationIds);
    setPlacements((current) => current.map((placement) => {
      if (!changedIds.has(placement.squareVariationId)) return placement;
      return {
        ...placement,
        brandIds: mutation.action === "assign"
          ? Array.from(new Set([...placement.brandIds, brandId]))
          : placement.brandIds.filter((id) => id !== brandId),
        visible: false
      };
    }));
    setBrandProductCountOverrides((current) => ({ ...current, [brandId]: mutation.assignedVariationCount }));
    setSaveState("saved");
    setSaveMessage(`${mutation.variationIds.length.toLocaleString()} Square variation${mutation.variationIds.length === 1 ? "" : "s"} updated for ${selectedBrand.name}.`);
  }

  function applyBulkEdit(selectedVariationIds: Iterable<string>, edit: WebsiteBulkEdit) {
    const selectedIds = Array.from(selectedVariationIds);

    if (selectedIds.length === 0) {
      return showError("Select at least one Square product for bulk editing.");
    }

    if (edit.holidayMode !== "keep" && !edit.holidayId) {
      return showError("Choose a holiday before applying the bulk edit.");
    }

    if (edit.holidayMode === "assign") {
      const holiday = holidays.find((current) => current.id === edit.holidayId);
      if (!holiday || !edit.holidayStartsAt || !edit.holidayEndsAt) {
        return showError("Choose a holiday and valid product dates before applying the bulk edit.");
      }
      if (edit.holidayStartsAt < holiday.startDate || edit.holidayEndsAt > holiday.endDate || edit.holidayStartsAt > edit.holidayEndsAt) {
        return showError("Bulk product dates must stay inside the selected holiday campaign.");
      }
    }

    const result = applyWebsiteBulkEdit(placements, selectedIds, edit, categories, holidays);
    setPlacements(result.placements);
    setIsDirty(true);
    setSaveState("idle");
    setSaveMessage(
      edit.visibilityMode === "publish-ready"
        ? `Bulk draft applied to ${result.updatedCount} products. ${result.publishedCount} ready to publish; ${result.skippedPublishCount} kept hidden for review.`
        : `Bulk draft applied to ${result.updatedCount} products. Review the changes, then save merchandising.`
    );
  }

  function applySpreadsheetEdit(rows: MerchandisingSpreadsheetPatch[]) {
    const result = applyWebsiteMerchandisingSpreadsheetRows(placements, rows, categories, holidays);
    setPlacements(result.placements);
    setIsDirty(true);
    setSaveState("idle");
    setSaveMessage(
      `Spreadsheet draft applied to ${result.updatedCount} products. ${result.publishedCount} ready to publish; ${result.skippedPublishCount} kept hidden. Review and save merchandising.`
    );
  }

  async function saveConfiguration() {
    setSaveState("saving");
    setSaveMessage("Saving website merchandising…");

    try {
      const response = await fetch("/api/admin/merchandising", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config: {
            version: 3,
            updatedAt: initialConfig.updatedAt,
            categories: normalizeCategorySiblingOrder(categories),
            brands: brands.map((brand, index) => ({ ...brand, sortOrder: index })),
            holidays: holidays.map((holiday, index) => ({ ...holiday, sortOrder: index })),
            placements
          }
        })
      });
      const result = (await response.json()) as { ok?: boolean; config?: WebsiteMerchandisingConfig; error?: string; issues?: Array<{ message: string }> };
      if (!response.ok || !result.ok || !result.config) throw new Error(result.issues?.[0]?.message ?? result.error ?? "Unable to save merchandising.");

      setCategories(result.config.categories);
      setBrands(result.config.brands);
      setHolidays(result.config.holidays);
      setPlacements(result.config.placements);
      setIsDirty(false);
      setSaveState("saved");
      setSaveMessage("Saved. Only products explicitly marked live can now reach the website.");
      router.refresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to save merchandising.");
    }
  }

  function showError(message: string) {
    setSaveState("error");
    setSaveMessage(message);
  }

  return (
    <main className="p-4 md:p-6">
      <SectionFrame area="Admin" className="surface-card overflow-hidden" component="ProductPlacementManager" sectionId="admin.product-placement-manager" variant="manager">
        <header className="border-b border-border p-4 md:px-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-semibold">Catalog Publishing</h1>
                <span className="rounded-pill bg-green/15 px-2 py-1 text-[10px] font-black uppercase text-green">Square read only</span>
              </div>
              <p className="mt-1 text-xs text-secondary">Snapshot {formatSnapshotDate(fetchedAt)}{hasMoreItems ? " · partial" : ""}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="inline-flex min-h-10 items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-muted" href="/shop" target="_blank">Preview</Link>
              <Button disabled={saveState === "saving" || !isDirty} onClick={saveConfiguration} type="button"><Save className="mr-2" size={17} />{saveState === "saving" ? "Saving…" : isDirty ? "Save changes" : "No changes"}</Button>
            </div>
          </div>
          {isDirty || saveState === "error" || saveState === "saved" ? <p aria-live="polite" className={`mt-3 rounded-md px-3 py-2 text-xs font-semibold ${saveState === "error" ? "bg-red/10 text-red" : saveState === "saved" ? "bg-green/10 text-green" : "bg-surface-muted text-primary"}`}>{saveMessage}</p> : null}
        </header>

        {activeModule === "overview" ? <section className="p-4 md:p-6" aria-labelledby="publishing-overview-heading">
          <h2 className="font-display text-xl font-semibold" id="publishing-overview-heading">Overview</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Square inbox" value={placements.length} />
            <Metric emphasis={pendingProductCount > 0} label="Needs setup" value={pendingProductCount} />
            <Metric label="Ready, hidden" value={readyProductCount} />
            <Metric label="Live on website" value={liveProductCount} />
          </div>
          <div className={`mt-5 rounded-md border p-5 ${liveProductCount === 0 ? "border-dashed border-border bg-surface" : "border-green/30 bg-green/10"}`}>
            <p className="mt-1 font-display text-2xl font-semibold">{liveProductCount === 0 ? "Blank by design" : `${liveProductCount} products published`}</p>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <ModuleLaunchCard action="Open" body="Brands, categories and holidays" onClick={() => navigateCatalogPublishing("structure-brands")} title="Website structure" />
            <ModuleLaunchCard action="Open" body={`${pendingProductCount} need setup`} onClick={() => navigateCatalogPublishing("products")} title="Products" />
            <ModuleLaunchCard action="Open" body="CSV, Excel and multi-select" onClick={() => navigateCatalogPublishing("bulk")} title="Bulk & import" />
          </div>
        </section> : null}

        {activeModule === "structure" ? <section className="bg-surface-muted p-4 md:p-5" aria-label="Website structure">
          <div>
            {structureModule === "brands" ? <BrandManager brands={brands} disabled={isDirty || saveState === "saving"} newDescription={newBrandDescription} newName={newBrandName} onAdd={addBrand} onDescriptionChange={setNewBrandDescription} onNameChange={setNewBrandName} onProductsApplied={syncBrandProducts} onRemove={removeBrand} onSelect={setSelectedBrandId} onUpdate={updateBrand} productCountByBrand={productCountByBrand} selected={selectedBrand} squareVendors={squareVendors} /> : null}
            {structureModule === "categories" ? <CategoryManager categories={categories} newDescription={newCategoryDescription} newName={newCategoryName} newParentId={newCategoryParentId} onAdd={addCategory} onDescriptionChange={setNewCategoryDescription} onMove={moveCategory} onNameChange={setNewCategoryName} onParentChange={setNewCategoryParentId} onRemove={removeCategory} onSelect={setSelectedCategoryId} onUpdate={updateCategory} productCountByCategory={productCountByCategory} selected={selectedCategory} /> : null}
            {structureModule === "holidays" ? <HolidayManager disabled={isDirty || saveState === "saving"} endDate={newHolidayEndDate} holidays={holidays} newDescription={newHolidayDescription} newName={newHolidayName} onAdd={addHoliday} onDescriptionChange={setNewHolidayDescription} onEndDateChange={setNewHolidayEndDate} onNameChange={setNewHolidayName} onProductsApplied={syncHolidayProducts} onRemove={removeHoliday} onSelect={setSelectedHolidayId} onStartDateChange={setNewHolidayStartDate} onUpdate={updateHoliday} selected={selectedHoliday} startDate={newHolidayStartDate} /> : null}
          </div>
        </section> : null}

        {activeModule === "products" ? <>
          <SquareCategoryBulkEditor brands={brands} categories={categories} disabled={isDirty || saveState === "saving"} />
          <FullCatalogProductManager brands={brands} categories={categories} disabled={isDirty || saveState === "saving"} holidays={holidays} />
        </> : null}

        {activeModule === "catalog-test" ? <SquareCatalogTestPanel /> : null}

        {activeModule === "bulk" ? <section className="p-4 md:p-6" aria-labelledby="bulk-publishing-heading">
          <h2 className="font-display text-xl font-semibold" id="bulk-publishing-heading">Bulk &amp; import</h2>
          <BulkMerchandisingEditor brands={brands} categories={categories} holidays={holidays} onApply={applyBulkEdit} onApplySpreadsheet={applySpreadsheetEdit} placementByProduct={placementByProduct} products={products} />
        </section> : null}
      </SectionFrame>
      {isDirty ? <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-md border border-primary/20 bg-primary p-3 text-white shadow-xl"><div className="hidden min-w-0 sm:block"><p className="text-sm font-semibold">Unsaved changes</p><p className="max-w-sm truncate text-xs text-white/75">Review the draft, then save it to update the website.</p></div><Button className="shrink-0 bg-white text-primary hover:bg-surface-muted" disabled={saveState === "saving"} onClick={saveConfiguration} type="button"><Save className="mr-2" size={16} />{saveState === "saving" ? "Saving…" : "Save changes"}</Button></div> : null}
    </main>
  );
}

function BulkMerchandisingEditor({
  brands,
  categories,
  holidays,
  onApply,
  onApplySpreadsheet,
  placementByProduct,
  products
}: {
  brands: WebsiteBrand[];
  categories: WebsiteCategory[];
  holidays: WebsiteHoliday[];
  onApply: (selectedVariationIds: Iterable<string>, edit: WebsiteBulkEdit) => void;
  onApplySpreadsheet: (rows: MerchandisingSpreadsheetPatch[]) => void;
  placementByProduct: Map<string, WebsiteProductPlacement>;
  products: StorefrontProduct[];
}) {
  const [query, setQuery] = useState("");
  const [sourceCategory, setSourceCategory] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
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
  const [visibilityMode, setVisibilityMode] = useState<BulkVisibilityMode>("keep");
  const [sortOrderEnabled, setSortOrderEnabled] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [sortStep, setSortStep] = useState(0);
  const sourceCategories = useMemo(() => Array.from(new Set(products.map((product) => product.department))).sort((a, b) => a.localeCompare(b)), [products]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    const placement = placementByProduct.get(product.squareVariationId);
    const issues = placement ? placementIssues(placement, categories, holidays) : ["Missing placement"];
    const matchesQuery = !normalizedQuery || `${product.name} ${product.department} ${product.squareVariationId}`.toLowerCase().includes(normalizedQuery);
    const matchesSource = !sourceCategory || product.department === sourceCategory;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "needs-setup" && issues.length > 0) ||
      (statusFilter === "ready" && issues.length === 0 && !placement?.visible) ||
      (statusFilter === "live" && issues.length === 0 && placement?.visible);
    return matchesQuery && matchesSource && matchesStatus;
  });
  const displayedProducts = filteredProducts.slice(0, 250);
  const hasBulkAction =
    hasBulkValueSelection(categoryMode, categoryIds.length) ||
    hasBulkValueSelection(brandMode, brandIds.length) ||
    hasBulkValueSelection(surfaceMode, surfaceIds.length) ||
    hasBulkValueSelection(ageMode, ageGroups.length) ||
    hasBulkValueSelection(fulfillmentMode, fulfillmentModes.length) ||
    (holidayMode !== "keep" && Boolean(holidayId)) ||
    visibilityMode !== "keep" ||
    sortOrderEnabled;

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectAllMatching() {
    setSelectedIds(new Set(filteredProducts.map((product) => product.squareVariationId)));
  }

  function selectHoliday(id: string) {
    setHolidayId(id);
    const holiday = holidays.find((current) => current.id === id);
    setHolidayStartsAt(holiday?.startDate ?? "");
    setHolidayEndsAt(holiday?.endDate ?? "");
  }

  function applyChanges() {
    onApply(selectedIds, {
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
      sortOrder: sortOrderEnabled ? sortOrder : undefined,
      sortStep: sortOrderEnabled ? sortStep : undefined,
      visibilityMode
    });
  }

  return (
    <div className="mt-5 overflow-hidden rounded-md border border-border bg-surface">
      <SpreadsheetMerchandisingPanel brands={brands} categories={categories} holidays={holidays} onApply={onApplySpreadsheet} placements={Array.from(placementByProduct.values())} products={products} />
      <div className="border-b border-border bg-surface-muted p-4 md:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_minmax(220px,0.7fr)_180px]">
          <label className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-surface px-3 focus-within:border-primary"><Search className="text-secondary" size={17} /><input className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Search name, Square category, or variation ID" type="search" value={query} /></label>
          <select aria-label="Square source category" className={inputClassName} onChange={(event) => setSourceCategory(event.target.value)} value={sourceCategory}><option value="">All Square categories</option>{sourceCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
          <select aria-label="Publishing status" className={inputClassName} onChange={(event) => setStatusFilter(event.target.value as ProductFilter)} value={statusFilter}>{(["all", "needs-setup", "ready", "live"] as ProductFilter[]).map((filter) => <option key={filter} value={filter}>{productFilterLabel(filter)}</option>)}</select>
        </div>
        <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-sm font-semibold"><span className="text-blue">{selectedIds.size} selected</span> · {filteredProducts.length} matching</p>
          <div className="flex flex-wrap gap-2"><button className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold hover:border-primary" disabled={filteredProducts.length === 0} onClick={selectAllMatching} type="button">Select all {filteredProducts.length} matching</button><button className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold hover:border-primary" disabled={selectedIds.size === 0} onClick={() => setSelectedIds(new Set())} type="button">Clear selection</button></div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(420px,0.95fr)_minmax(0,1.25fr)]">
        <section className="border-b border-border p-4 xl:border-b-0 xl:border-r" aria-label="Bulk product selection">
          <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-display text-xl font-semibold">Products</h3><p className="text-xs text-secondary">Showing {displayedProducts.length} of {filteredProducts.length}</p></div>
          {filteredProducts.length > 250 ? <p className="mb-3 rounded-md border border-blue/20 bg-cyan p-3 text-xs text-secondary">The list renders the first 250 matches for speed. “Select all matching” still includes every loaded result.</p> : null}
          <div className="max-h-[920px] space-y-2 overflow-y-auto pr-1">
            {displayedProducts.map((product) => {
              const placement = placementByProduct.get(product.squareVariationId);
              const issues = placement ? placementIssues(placement, categories, holidays) : ["Missing placement"];
              const assignedCategories = placement?.categoryIds.map((id) => categories.find((category) => category.id === id)?.name).filter(Boolean) ?? [];
              const assignedBrands = placement?.brandIds.map((id) => brands.find((brand) => brand.id === id)?.name).filter(Boolean) ?? [];
              return (
                <label className={`flex cursor-pointer gap-3 rounded-md border p-3 ${selectedIds.has(product.squareVariationId) ? "border-blue bg-cyan" : "border-border bg-surface hover:border-primary"}`} key={product.squareVariationId}>
                  <input checked={selectedIds.has(product.squareVariationId)} className="mt-1 h-5 w-5 shrink-0" onChange={(event) => toggleSelected(product.squareVariationId, event.target.checked)} type="checkbox" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold text-primary">{product.name}</span><StatusBadge issues={issues} visible={Boolean(placement?.visible)} /></span>
                    <span className="mt-1 block truncate text-xs text-secondary">Square: {product.department}</span>
                    <span className="mt-1 block truncate text-xs text-secondary">Categories: {assignedCategories.length ? assignedCategories.join(", ") : "Unassigned"}</span>
                    <span className="mt-1 block truncate text-xs text-secondary">Brands: {assignedBrands.length ? assignedBrands.join(", ") : "Unassigned"}</span>
                  </span>
                </label>
              );
            })}
            {displayedProducts.length === 0 ? <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-secondary">No products match these filters.</p> : null}
          </div>
        </section>

        <section className="min-w-0 p-4 md:p-6" aria-label="Bulk actions">
          <div className="rounded-md border border-blue/25 bg-cyan p-4"><p className="font-semibold text-primary">Safe bulk draft</p><p className="mt-1 text-sm text-secondary">Structural edits return affected products to hidden. “Publish ready” publishes only records that pass every placement rule.</p></div>
          <div className="mt-5 grid gap-4">
            <BulkValueEditor description="Add, remove, or replace website-only category assignments." mode={categoryMode} onModeChange={setCategoryMode} title="Website categories"><ChoiceGrid>{categories.map((category) => <Choice checked={categoryIds.includes(category.id)} key={category.id} label={`${websiteCategoryLabel(category, categories)}${category.visible ? "" : " (hidden)"}`} onChange={(checked) => setCategoryIds(toggleValue(categoryIds, category.id, checked))} />)}</ChoiceGrid>{categories.length === 0 ? <EmptyDecision>Create website categories before assigning them in bulk.</EmptyDecision> : null}</BulkValueEditor>
            <BulkValueEditor description="Add, remove, or replace the public brands that contain the selected products." mode={brandMode} onModeChange={setBrandMode} title="Website brands"><ChoiceGrid>{brands.map((brand) => <Choice checked={brandIds.includes(brand.id)} key={brand.id} label={`${brand.name}${brand.visible ? "" : " (hidden)"}`} onChange={(checked) => setBrandIds(toggleValue(brandIds, brand.id, checked))} />)}</ChoiceGrid>{brands.length === 0 ? <EmptyDecision>Create website brands before assigning them in bulk.</EmptyDecision> : null}</BulkValueEditor>
            <BulkValueEditor description="Control every public destination where the selected products may appear." mode={surfaceMode} onModeChange={setSurfaceMode} title="Website surfaces"><ChoiceGrid>{websiteSurfaceOptions.map((surface) => <Choice checked={surfaceIds.includes(surface.id)} key={surface.id} label={surface.label} onChange={(checked) => setSurfaceIds(toggleValue(surfaceIds, surface.id, checked))} />)}</ChoiceGrid></BulkValueEditor>
            <BulkValueEditor description="Apply recommended age ranges to all selected products." mode={ageMode} onModeChange={setAgeMode} title="Age ranges"><ChoiceGrid>{productAgeGroups.map((age) => <Choice checked={ageGroups.includes(age.id)} key={age.id} label={age.label} onChange={(checked) => setAgeGroups(toggleValue(ageGroups, age.id, checked))} />)}</ChoiceGrid></BulkValueEditor>
            <BulkValueEditor description="Set pickup, local delivery, and shipping eligibility." mode={fulfillmentMode} onModeChange={setFulfillmentMode} title="Fulfillment"><ChoiceGrid>{fulfillmentOptions.map((mode) => <Choice checked={fulfillmentModes.includes(mode.id)} key={mode.id} label={mode.label} onChange={(checked) => setFulfillmentModes(toggleValue(fulfillmentModes, mode.id, checked))} />)}</ChoiceGrid></BulkValueEditor>

            <fieldset className="rounded-md border border-border bg-surface-muted p-4"><legend className="px-1 font-display text-lg font-semibold">Holiday campaign</legend><p className="mb-3 text-xs text-secondary">Assign or remove one holiday campaign across the selection.</p><div className="grid gap-3 sm:grid-cols-2"><Field label="Operation"><select className={inputClassName} onChange={(event) => setHolidayMode(event.target.value as BulkHolidayMode)} value={holidayMode}><option value="keep">No change</option><option value="assign">Assign / update</option><option value="remove">Remove</option></select></Field><Field label="Holiday"><select className={inputClassName} disabled={holidayMode === "keep"} onChange={(event) => selectHoliday(event.target.value)} value={holidayId}><option value="">Choose holiday</option>{holidays.map((holiday) => <option key={holiday.id} value={holiday.id}>{holiday.name}{holiday.visible ? "" : " (hidden)"}</option>)}</select></Field>{holidayMode === "assign" ? <><Field label="Product starts"><input className={inputClassName} onChange={(event) => setHolidayStartsAt(event.target.value)} type="date" value={holidayStartsAt} /></Field><Field label="Product ends"><input className={inputClassName} onChange={(event) => setHolidayEndsAt(event.target.value)} type="date" value={holidayEndsAt} /></Field></> : null}</div></fieldset>

            <fieldset className="rounded-md border border-border bg-surface-muted p-4"><legend className="px-1 font-display text-lg font-semibold">Sort order</legend><label className="flex items-center gap-3 text-sm font-semibold"><input checked={sortOrderEnabled} className="h-5 w-5" onChange={(event) => setSortOrderEnabled(event.target.checked)} type="checkbox" />Set sequential sort order</label>{sortOrderEnabled ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Start at"><input className={inputClassName} min={0} onChange={(event) => setSortOrder(Number(event.target.value) || 0)} type="number" value={sortOrder} /></Field><Field label="Increment"><input className={inputClassName} min={0} onChange={(event) => setSortStep(Number(event.target.value) || 0)} type="number" value={sortStep} /></Field></div> : null}</fieldset>

            <fieldset className="rounded-md border border-border bg-surface-muted p-4"><legend className="px-1 font-display text-lg font-semibold">Website publishing</legend><p className="mb-3 text-xs text-secondary">Keep the current state, force hidden, or publish only complete records.</p><select className={inputClassName} onChange={(event) => setVisibilityMode(event.target.value as BulkVisibilityMode)} value={visibilityMode}><option value="keep">No change</option><option value="hidden">Set hidden</option><option value="publish-ready">Publish ready products only</option></select></fieldset>
          </div>
          <div className="mt-6 rounded-md border border-border bg-surface-muted p-4"><p className="text-sm text-secondary">This edits the current Admin draft. Use <span className="font-semibold text-primary">Save merchandising</span> at the top to persist the bulk operation.</p><Button className="mt-4 w-full" disabled={selectedIds.size === 0 || !hasBulkAction} onClick={applyChanges} type="button">Apply bulk draft to {selectedIds.size} products</Button></div>
        </section>
      </div>
    </div>
  );
}

function SpreadsheetMerchandisingPanel({
  brands,
  categories,
  holidays,
  onApply,
  placements,
  products
}: {
  brands: WebsiteBrand[];
  categories: WebsiteCategory[];
  holidays: WebsiteHoliday[];
  onApply: (rows: MerchandisingSpreadsheetPatch[]) => void;
  placements: WebsiteProductPlacement[];
  products: StorefrontProduct[];
}) {
  const [fileName, setFileName] = useState("");
  const [importResult, setImportResult] = useState<MerchandisingSpreadsheetParseResult | null>(null);
  const [importError, setImportError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);

  function downloadTemplate() {
    const csv = createWebsiteMerchandisingCsv(products, placements, categories, brands, holidays);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `website-merchandising-guided-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function readSpreadsheet(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);
    setImportError("");
    setHasApplied(false);
    if (file.size > 50 * 1024 * 1024) {
      setImportError("File is larger than 50 MB. Split it into smaller batches before importing.");
      return;
    }

    setIsReading(true);
    try {
      const extension = file.name.toLowerCase().split(".").pop();
      let table: unknown[][];
      if (extension === "csv") {
        table = parseCsvTable(await file.text());
      } else if (extension === "xlsx") {
        const { readSheet } = await import("read-excel-file/browser");
        table = await readSheet(file);
      } else {
        throw new Error("Use a .csv or .xlsx file.");
      }
      setImportResult(parseWebsiteMerchandisingTable(table, { products, categories, brands, holidays }));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The spreadsheet could not be read.");
    } finally {
      setIsReading(false);
    }
  }

  function applyImport() {
    if (!importResult?.rows.length) return;
    onApply(importResult.rows);
    setHasApplied(true);
  }

  return (
    <section className="border-b border-border bg-surface p-4 md:p-6" aria-label="Spreadsheet import">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md bg-green/10 text-green"><FileSpreadsheet size={20} /></span><div><h3 className="font-display text-xl font-semibold">CSV & Excel import</h3><p className="text-sm text-secondary">Download the catalog template or upload a completed spreadsheet.</p></div></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-semibold hover:border-primary" onClick={downloadTemplate} type="button"><Download className="mr-2" size={17} />Download CSV template</button>
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white"><Upload className="mr-2" size={17} />{isReading ? "Reading file..." : "Upload CSV or Excel"}<input accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={isReading} onChange={readSpreadsheet} type="file" /></label>
        </div>
      </div>
      {importError ? <p className="mt-4 flex items-start gap-2 rounded-md border border-red/30 bg-red/5 p-3 text-sm text-red"><AlertTriangle className="mt-0.5 shrink-0" size={17} />{importError}</p> : null}
      {importResult ? (
        <div className="mt-4 rounded-md border border-border bg-surface-muted p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="font-semibold text-primary">{fileName}</p><p className="mt-1 text-sm text-secondary">{importResult.rows.length} APPLY rows ready · {importResult.errors.length} errors · {importResult.ignoredRowCount} SKIP/EXAMPLE rows ignored</p></div><Button disabled={importResult.rows.length === 0 || hasApplied} onClick={applyImport} type="button">{hasApplied ? "Applied to draft" : `Apply ${importResult.rows.length} validated rows`}</Button></div>
          {importResult.errors.length > 0 ? <div className="mt-4 rounded-md border border-yellow/40 bg-yellow/10 p-3"><p className="text-sm font-semibold text-primary">Rows with errors will be skipped</p><ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-secondary">{importResult.errors.slice(0, 50).map((error, index) => <li key={`${error.row}-${index}`}><span className="font-semibold text-red">Row {error.row}</span>{error.squareVariationId ? ` · ${error.squareVariationId}` : ""}: {error.message}</li>)}</ul>{importResult.errors.length > 50 ? <p className="mt-2 text-xs font-semibold text-secondary">Showing the first 50 errors.</p> : null}</div> : <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-green"><Check size={17} />All rows passed validation.</p>}
        </div>
      ) : null}
    </section>
  );
}

function BulkValueEditor({ children, mode, onModeChange, title }: { children: ReactNode; description: string; mode: BulkValueMode; onModeChange: (mode: BulkValueMode) => void; title: string }) {
  return <fieldset className="rounded-md border border-border bg-surface-muted p-4"><legend className="px-1 font-display text-lg font-semibold">{title}</legend><Field label="Operation"><select className={`${inputClassName} max-w-56`} onChange={(event) => onModeChange(event.target.value as BulkValueMode)} value={mode}><option value="keep">No change</option><option value="add">Add selected</option><option value="remove">Remove selected</option><option value="replace">Replace with selected</option></select></Field>{mode !== "keep" ? <div className="mt-3">{children}</div> : null}</fieldset>;
}

function BrandManager({
  brands,
  disabled,
  newDescription,
  newName,
  onAdd,
  onDescriptionChange,
  onNameChange,
  onProductsApplied,
  onRemove,
  onSelect,
  onUpdate,
  productCountByBrand,
  selected,
  squareVendors
}: {
  brands: WebsiteBrand[];
  disabled: boolean;
  newDescription: string;
  newName: string;
  onAdd: (vendor?: SquareVendorReference) => void;
  onDescriptionChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onProductsApplied: (mutation: BrandGtinMutation) => void;
  onRemove: () => void;
  onSelect: (id: string) => void;
  onUpdate: (patch: Partial<WebsiteBrand>) => void;
  productCountByBrand: Record<string, number>;
  selected: WebsiteBrand | null;
  squareVendors: SquareVendorReference[];
}) {
  const [vendorToImport, setVendorToImport] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const importedVendorIds = new Set(brands.flatMap((brand) => brand.squareVendorIds));
  const selectedProductCount = selected ? productCountByBrand[selected.id] ?? 0 : 0;
  const heroEligible = Boolean(selected?.visible && selected.logoUrl);

  async function uploadLogo(file: File) {
    setUploadMessage("Uploading logo...");
    try {
      const asset = await uploadBrandImage(file, selected?.id ?? "website-brand");
      onUpdate({ logoUrl: asset.url, imageAlt: selected?.imageAlt || `${selected?.name ?? "Brand"} logo` });
      setUploadMessage(`Uploaded ${asset.originalName}.`);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Logo upload failed.");
    }
  }

  return (
    <section className="scroll-mt-6 rounded-md border border-green/30 bg-surface p-5 2xl:col-span-2" id="website-brands">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-green text-sm font-black text-primary">B</span>
          <div>
            <h3 className="font-display text-xl font-semibold">Website brands</h3>
          </div>
        </div>
        <span className="w-fit rounded-pill bg-green/10 px-3 py-1.5 text-xs font-semibold text-primary">{brands.length} brand{brands.length === 1 ? "" : "s"}</span>
      </div>

      <div className="mt-5 rounded-md border border-border bg-surface-muted p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue">Create a website brand</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <input className={inputClassName} maxLength={80} onChange={(event) => onNameChange(event.target.value)} placeholder="Public brand name, e.g. Crayola" value={newName} />
          <input className={inputClassName} maxLength={240} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="Short customer-facing description" value={newDescription} />
          <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!newName.trim()} onClick={() => onAdd()} type="button"><Plus className="mr-2" size={16} />Add brand</button>
        </div>
      </div>

      {squareVendors.length > 0 ? (
        <div className="mt-3 grid gap-3 rounded-md border border-blue/20 bg-cyan p-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-secondary" htmlFor="square-vendor-import">Or start from a Square vendor</label>
            <select className={inputClassName} id="square-vendor-import" onChange={(event) => setVendorToImport(event.target.value)} value={vendorToImport}><option value="">Choose a Square vendor</option>{squareVendors.map((vendor) => <option disabled={importedVendorIds.has(vendor.id)} key={vendor.id} value={vendor.id}>{vendor.name}{importedVendorIds.has(vendor.id) ? " (already imported)" : ""}</option>)}</select>
          </div>
          <button className="self-end rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={!vendorToImport} onClick={() => { const vendor = squareVendors.find((item) => item.id === vendorToImport); if (vendor) { onAdd(vendor); setVendorToImport(""); } }} type="button">Create from Square</button>
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-blue/20 bg-cyan p-3 text-xs font-semibold">Square vendors unavailable.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {brands.map((brand) => (
          <button aria-pressed={selected?.id === brand.id} className={`rounded-pill border px-3 py-2 text-sm font-semibold ${selected?.id === brand.id ? "border-primary bg-primary text-white" : "border-border bg-surface-muted text-secondary hover:border-primary"}`} key={brand.id} onClick={() => onSelect(brand.id)} type="button">
            {brand.name} · {productCountByBrand[brand.id] ?? 0} items · {brand.visible ? "Shop" : "Hidden"}{brand.featuredOnHomepage ? " · Hero" : ""}
          </button>
        ))}
        {brands.length === 0 ? <p className="w-full rounded-md border border-dashed border-border p-5 text-center text-sm text-secondary">No website brands yet. Create the first one above.</p> : null}
      </div>

      {selected ? (
        <div className="mt-5 border-t border-border pt-5">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue">Editing brand</p>
              <h4 className="mt-1 font-display text-xl font-semibold">{selected.name}</h4>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-pill bg-surface-muted px-3 py-1.5">{selectedProductCount} assigned items</span>
              <span className={`rounded-pill px-3 py-1.5 ${selected.logoUrl ? "bg-green/10 text-green" : "bg-yellow/20 text-primary"}`}>{selected.logoUrl ? "Logo ready" : "Logo needed"}</span>
              <span className={`rounded-pill px-3 py-1.5 ${selected.visible ? "bg-green/10 text-green" : "bg-surface-muted text-secondary"}`}>{selected.visible ? "Shown in Shop" : "Hidden"}</span>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="rounded-md border border-border bg-surface-muted p-3">
              <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-md bg-white">
                {selected.logoUrl ? <Image alt={selected.imageAlt || `${selected.name} logo`} className="h-full w-full object-contain p-4" height={180} src={selected.logoUrl} unoptimized width={220} /> : <span className="text-sm font-semibold text-secondary">Upload a brand logo</span>}
              </div>
              <label className="mt-3 inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-semibold"><Upload className="mr-2" size={16} />Upload logo<input accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadLogo(file); }} type="file" /></label>
              {uploadMessage ? <p className="mt-2 text-xs text-secondary">{uploadMessage}</p> : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Display name"><input className={inputClassName} onChange={(event) => onUpdate({ name: event.target.value })} value={selected.name} /></Field>
              <Field label="URL slug"><input className={inputClassName} onChange={(event) => onUpdate({ slug: slugifyWebsiteCategory(event.target.value) })} value={selected.slug} /></Field>
              <Field className="sm:col-span-2" label="Description"><textarea className={inputClassName} onChange={(event) => onUpdate({ description: event.target.value })} rows={2} value={selected.description} /></Field>
              {squareVendors.length > 0 ? <Field label="Square vendor reference"><select className={inputClassName} onChange={(event) => onUpdate({ squareVendorIds: event.target.value ? [event.target.value] : [] })} value={selected.squareVendorIds[0] ?? ""}><option value="">No linked Square vendor</option>{squareVendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></Field> : null}
              <Field className={squareVendors.length > 0 ? "" : "sm:col-span-2"} label="Logo URL"><input className={inputClassName} onChange={(event) => onUpdate({ logoUrl: event.target.value })} placeholder="/uploads/admin/..." value={selected.logoUrl} /></Field>
              <Field className="sm:col-span-2" label="Image alt text"><input className={inputClassName} onChange={(event) => onUpdate({ imageAlt: event.target.value })} value={selected.imageAlt} /></Field>

              <label className="flex items-center gap-3 rounded-md border border-border bg-surface-muted p-3 text-sm font-semibold"><input checked={selected.visible} className="h-5 w-5" onChange={(event) => onUpdate({ visible: event.target.checked })} type="checkbox" /><span>Visible in Shop</span></label>
              <label className={`flex items-center gap-3 rounded-md border border-border bg-surface-muted p-3 text-sm font-semibold ${heroEligible ? "" : "cursor-not-allowed opacity-60"}`}><input checked={selected.featuredOnHomepage} className="h-5 w-5" disabled={!heroEligible} onChange={(event) => onUpdate({ featuredOnHomepage: event.target.checked })} type="checkbox" /><span>Homepage hero</span></label>

              <button className="inline-flex items-center justify-center rounded-md border border-red/30 p-3 text-sm font-semibold text-red sm:col-span-2" onClick={onRemove} type="button"><Trash2 className="mr-2" size={16} />Remove brand</button>
            </div>
          </div>
          <BrandGtinImporter brand={selected} disabled={disabled} key={selected.id} onApplied={onProductsApplied} />
        </div>
      ) : null}
    </section>
  );
}

function CategoryManager({
  categories,
  newDescription,
  newName,
  newParentId,
  onAdd,
  onDescriptionChange,
  onMove,
  onNameChange,
  onParentChange,
  onRemove,
  onSelect,
  onUpdate,
  productCountByCategory,
  selected
}: {
  categories: WebsiteCategory[];
  newDescription: string;
  newName: string;
  newParentId: string;
  onAdd: () => void;
  onDescriptionChange: (value: string) => void;
  onMove: (direction: "up" | "down") => void;
  onNameChange: (value: string) => void;
  onParentChange: (value: string) => void;
  onRemove: () => void;
  onSelect: (id: string) => void;
  onUpdate: (patch: Partial<WebsiteCategory>) => void;
  productCountByCategory: Record<string, number>;
  selected: WebsiteCategory | null;
}) {
  const [categoryQuery, setCategoryQuery] = useState("");
  const [expandedRootId, setExpandedRootId] = useState(() => selected?.parentId ?? (selected && !selected.parentId ? selected.id : categories.find((category) => !category.parentId)?.id ?? ""));
  const normalizedCategoryQuery = categoryQuery.trim().toLowerCase();
  const filteredCategories = categories.filter((category) => !normalizedCategoryQuery || `${category.name} ${category.slug}`.toLowerCase().includes(normalizedCategoryQuery));
  const rootCategories = categories.filter((category) => !category.parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const visibleRoots = rootCategories.filter((root) => !normalizedCategoryQuery || `${root.name} ${root.slug}`.toLowerCase().includes(normalizedCategoryQuery) || categories.some((category) => category.parentId === root.id && `${category.name} ${category.slug}`.toLowerCase().includes(normalizedCategoryQuery)));
  const selectedSiblings = selected ? categories.filter((category) => category.parentId === selected.parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)) : [];
  const selectedIndex = selected ? selectedSiblings.findIndex((category) => category.id === selected.id) : -1;
  const selectedChildren = selected ? categories.filter((category) => category.parentId === selected.id) : [];
  const selectedParent = selected?.parentId ? categories.find((category) => category.id === selected.parentId) ?? null : null;
  const newCategorySlug = newName.trim() ? slugifyWebsiteCategory(newName) || "collection" : "new-category";

  return (
    <section className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-col justify-between gap-4 border-b border-border p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue text-white"><FolderTree size={19} /></span>
          <div>
            <h3 className="font-display text-xl font-semibold">Website categories</h3>
          </div>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="rounded-pill bg-surface-muted px-3 py-1.5">{rootCategories.length} main</span>
          <span className="rounded-pill bg-surface-muted px-3 py-1.5">{categories.length - rootCategories.length} subcategories</span>
          <span className="rounded-pill bg-green/10 px-3 py-1.5 text-green">{categories.filter((category) => category.visible).length} visible</span>
        </div>
      </div>

      <form
        className="border-b border-border bg-cyan/40 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd();
        }}
      >
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue">Quick create</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,0.65fr)_minmax(0,1fr)_minmax(0,1.15fr)_auto] xl:items-end">
          <Field label="Place under">
            <select className={inputClassName} onChange={(event) => onParentChange(event.target.value)} value={newParentId}>
              <option value="">Main category</option>
              {rootCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <Field label="Category name">
            <input autoComplete="off" className={inputClassName} maxLength={80} onChange={(event) => onNameChange(event.target.value)} placeholder="Example: Arts & Crafts" value={newName} />
          </Field>
          <Field label="Short description (optional)">
            <input className={inputClassName} maxLength={240} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="What customers will find here" value={newDescription} />
          </Field>
          <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={!newName.trim()} type="submit">
            <Plus className="mr-2" size={16} />Create {newParentId ? "subcategory" : "category"}
          </button>
        </div>
        <p className="mt-2 text-xs text-secondary">{newParentId ? "Subcategory" : "Main category"} · URL preview: <span className="font-semibold text-primary">/categories/{newCategorySlug}</span></p>
      </form>

      <div className="grid min-h-[540px] lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-surface-muted p-4 lg:border-b-0 lg:border-r">
          <label className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-surface px-3 focus-within:border-primary">
            <Search aria-hidden="true" className="text-secondary" size={17} />
            <span className="sr-only">Search website categories</span>
            <input className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" onChange={(event) => setCategoryQuery(event.target.value)} placeholder="Search categories" type="search" value={categoryQuery} />
          </label>
          <div className="mt-3 flex items-center justify-between px-1 text-xs text-secondary">
            <span>{filteredCategories.length} shown</span>
            <span>Website order</span>
          </div>
          <div className="mt-2 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {visibleRoots.map((root) => {
              const children = categories.filter((category) => category.parentId === root.id).filter((category) => !normalizedCategoryQuery || `${category.name} ${category.slug}`.toLowerCase().includes(normalizedCategoryQuery)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
              const expanded = Boolean(normalizedCategoryQuery) || expandedRootId === root.id;
              const active = selected?.id === root.id;
              return (
                <div className="overflow-hidden rounded-md border border-border bg-surface" key={root.id}>
                  <div className={`flex items-stretch ${active ? "bg-cyan" : ""}`}>
                    <button aria-pressed={active} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left hover:bg-surface-muted" onClick={() => { onSelect(root.id); setExpandedRootId(root.id); }} type="button">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${active ? "bg-primary text-white" : "bg-surface-muted text-secondary"}`}><Folder size={17} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-primary">{root.name}</span>
                        <span className="mt-1 block text-xs text-secondary">{formatProductCount(productCountByCategory[root.id] ?? 0)} · {formatSubcategoryCount(categories.filter((category) => category.parentId === root.id).length)}</span>
                      </span>
                    </button>
                    {categories.some((category) => category.parentId === root.id) ? <button aria-label={`${expanded ? "Collapse" : "Expand"} ${root.name}`} className="grid w-11 place-items-center border-l border-border text-secondary hover:bg-surface-muted" onClick={() => setExpandedRootId((current) => current === root.id ? "" : root.id)} type="button"><ChevronDown className={`transition-transform ${expanded ? "rotate-180" : ""}`} size={17} /></button> : null}
                  </div>
                  {expanded && children.length ? <div className="space-y-1 border-t border-border bg-surface-muted p-2 pl-5">
                    {children.map((category) => {
                      const childActive = selected?.id === category.id;
                      return <button aria-pressed={childActive} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left ${childActive ? "bg-primary text-white" : "bg-surface text-primary hover:bg-cyan"}`} key={category.id} onClick={() => onSelect(category.id)} type="button"><span className={`h-2 w-2 shrink-0 rounded-full ${category.visible ? "bg-green" : "bg-border"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{category.name}</span><span className={`mt-0.5 block text-xs ${childActive ? "text-white/70" : "text-secondary"}`}>{formatProductCount(productCountByCategory[category.id] ?? 0)}</span></span><ChevronRight size={15} /></button>;
                    })}
                  </div> : null}
                </div>
              );
            })}
            {visibleRoots.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-surface p-5 text-center text-sm text-secondary">
                {categories.length === 0 ? "Create your first website category above." : "No categories match this search."}
              </p>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0 p-5 md:p-6">
          {selected ? (
            <div>
              <div className="flex flex-col justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-blue">{selected.parentId ? "Editing subcategory" : "Editing main category"}</p>
                  <h4 className="mt-1 font-display text-2xl font-semibold">{selected.name}</h4>
                  <p className="mt-1 text-xs text-secondary">{selectedParent ? `${selectedParent.name} › ` : ""}{formatProductCount(productCountByCategory[selected.id] ?? 0)}{selectedChildren.length ? ` · ${formatSubcategoryCount(selectedChildren.length)}` : ""}</p>
                </div>
                <span className={`w-fit rounded-pill px-3 py-1.5 text-xs font-semibold ${selected.visible ? "bg-green/10 text-green" : "bg-surface-muted text-secondary"}`}>{selected.visible ? "Visible in Shop" : "Hidden draft"}</span>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Display name">
                  <input className={inputClassName} maxLength={80} onChange={(event) => onUpdate({ name: event.target.value })} value={selected.name} />
                </Field>
                <Field label="URL slug">
                  <input className={inputClassName} maxLength={100} onChange={(event) => onUpdate({ slug: slugifyWebsiteCategory(event.target.value) })} value={selected.slug} />
                  <span className="mt-1.5 block text-xs text-secondary">/categories/{selected.slug || "category"}</span>
                </Field>
                <Field className="sm:col-span-2" label="Category structure">
                  <select className={inputClassName} disabled={selectedChildren.length > 0} onChange={(event) => onUpdate({ parentId: event.target.value || null })} value={selected.parentId ?? ""}>
                    <option value="">Main category</option>
                    {rootCategories.filter((category) => category.id !== selected.id).map((category) => <option key={category.id} value={category.id}>Subcategory of {category.name}</option>)}
                  </select>
                  <span className="mt-1.5 block text-xs text-secondary">{selectedChildren.length ? "Move or remove its subcategories before changing this level." : "Use one main level and one subcategory level."}</span>
                </Field>
                <Field className="sm:col-span-2" label="Customer-facing description">
                  <textarea className={inputClassName} maxLength={240} onChange={(event) => onUpdate({ description: event.target.value })} placeholder="Describe what shoppers will find in this category." rows={3} value={selected.description} />
                </Field>
              </div>

              {selectedParent && !selectedParent.visible ? <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">This subcategory stays hidden while its main category is hidden.</p> : null}

              <label className={`mt-5 flex cursor-pointer items-center gap-4 rounded-md border p-4 ${selected.visible ? "border-green/30 bg-green/10" : "border-border bg-surface-muted"}`}>
                <input checked={selected.visible} className="h-5 w-5" onChange={(event) => onUpdate({ visible: event.target.checked })} type="checkbox" />
                  <span className="block text-sm font-semibold">Visible on website</span>
              </label>

              <div className="mt-5 flex flex-col justify-between gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-semibold">Website order</p>
                  <p className="mt-1 text-xs text-secondary">Position {selectedIndex + 1} of {selectedSiblings.length} {selected.parentId ? "under its main category" : "among main categories"}</p>
                </div>
                <div className="flex gap-2">
                  <button className="inline-flex min-h-10 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40" disabled={selectedIndex <= 0} onClick={() => onMove("up")} type="button"><ArrowUp className="mr-2" size={15} />Move up</button>
                  <button className="inline-flex min-h-10 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40" disabled={selectedIndex < 0 || selectedIndex >= selectedSiblings.length - 1} onClick={() => onMove("down")} type="button"><ArrowDown className="mr-2" size={15} />Move down</button>
                </div>
              </div>

              <div className="mt-6 border-t border-border pt-5">
                <button className="inline-flex min-h-10 items-center justify-center rounded-md border border-red/30 px-4 text-sm font-semibold text-red hover:bg-red/5 disabled:cursor-not-allowed disabled:opacity-40" disabled={selectedChildren.length > 0} onClick={onRemove} type="button"><Trash2 className="mr-2" size={16} />Remove category</button>
              </div>
            </div>
          ) : (
            <div className="grid min-h-[420px] place-items-center rounded-md border border-dashed border-border bg-surface-muted p-8 text-center">
              <div>
                <p className="font-display text-xl font-semibold">No category selected</p>
                <p className="mt-2 max-w-sm text-sm text-secondary">Create a category above or choose one from the list to edit its name, visibility and website order.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function HolidayManager({ disabled, endDate, holidays, newDescription, newName, onAdd, onDescriptionChange, onEndDateChange, onNameChange, onProductsApplied, onRemove, onSelect, onStartDateChange, onUpdate, selected, startDate }: {
  disabled: boolean;
  endDate: string;
  holidays: WebsiteHoliday[];
  newDescription: string;
  newName: string;
  onAdd: () => void;
  onDescriptionChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onProductsApplied: (mutation: HolidayProductMutation) => void;
  onRemove: () => void;
  onSelect: (id: string) => void;
  onStartDateChange: (value: string) => void;
  onUpdate: (patch: Partial<WebsiteHoliday>) => void;
  selected: WebsiteHoliday | null;
  startDate: string;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="font-display text-xl font-semibold">Holidays</h3>
          <p className="text-xs text-secondary">{holidays.length} total · {holidays.filter((holiday) => holiday.visible).length} visible</p>
        </div>
        <span className="rounded-pill bg-surface-muted px-3 py-1 text-xs font-semibold">Website collections</span>
      </header>

      <details className="border-b border-border bg-surface-muted">
        <summary className="flex cursor-pointer list-none items-center px-4 py-3 text-sm font-semibold"><Plus className="mr-2" size={16} />New holiday</summary>
        <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2 xl:grid-cols-5">
          <input className={inputClassName} maxLength={80} onChange={(event) => onNameChange(event.target.value)} placeholder="Name" value={newName} />
          <input className={inputClassName} maxLength={240} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="Description" value={newDescription} />
          <input aria-label="Holiday starts" className={inputClassName} onChange={(event) => onStartDateChange(event.target.value)} type="date" value={startDate} />
          <input aria-label="Holiday ends" className={inputClassName} onChange={(event) => onEndDateChange(event.target.value)} type="date" value={endDate} />
          <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-40" disabled={!newName.trim() || !startDate || !endDate} onClick={onAdd} type="button">Create</button>
        </div>
      </details>

      <div className="grid min-h-[680px] lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-surface-muted p-3 lg:border-b-0 lg:border-r">
          <div className="grid gap-1.5">
            {holidays.map((holiday) => {
              const active = selected?.id === holiday.id;
              return (
                <button aria-pressed={active} className={`flex items-center gap-3 rounded-md border px-3 py-3 text-left ${active ? "border-primary bg-surface" : "border-transparent hover:border-border hover:bg-surface"}`} key={holiday.id} onClick={() => onSelect(holiday.id)} type="button">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${holiday.visible ? "bg-green" : "bg-border"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{holiday.name}</span>
                    <span className="mt-0.5 block text-xs text-secondary">{holiday.startDate} – {holiday.endDate}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="text-secondary" size={15} />
                </button>
              );
            })}
            {holidays.length === 0 ? <p className="p-6 text-center text-sm text-secondary">No holidays yet.</p> : null}
          </div>
        </aside>

        <div className="min-w-0">
          {selected ? (
            <>
              <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full ${selected.visible ? "bg-green" : "bg-border"}`} />
                  <div>
                    <h4 className="font-display text-xl font-semibold">{selected.name}</h4>
                    <p className="text-xs text-secondary">/holidays/{selected.slug}</p>
                  </div>
                </div>
                <Link className="inline-flex min-h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold hover:bg-surface-muted" href={`/admin/homepage?scope=holiday&id=${encodeURIComponent(selected.slug)}`}>
                  <Palette className="mr-2" size={16} />Edit design
                </Link>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <Field label="Name"><input className={inputClassName} maxLength={80} onChange={(event) => onUpdate({ name: event.target.value })} value={selected.name} /></Field>
                <Field label="URL"><input className={inputClassName} maxLength={80} onChange={(event) => onUpdate({ slug: slugifyWebsiteCategory(event.target.value) })} value={selected.slug} /></Field>
                <Field label="Starts"><input className={inputClassName} onChange={(event) => onUpdate({ startDate: event.target.value })} type="date" value={selected.startDate} /></Field>
                <Field label="Ends"><input className={inputClassName} onChange={(event) => onUpdate({ endDate: event.target.value })} type="date" value={selected.endDate} /></Field>
                <Field className="sm:col-span-2" label="Description"><textarea className={inputClassName} maxLength={240} onChange={(event) => onUpdate({ description: event.target.value })} rows={2} value={selected.description} /></Field>
                <label className={`flex cursor-pointer items-center justify-between rounded-md border p-3 text-sm font-semibold ${selected.visible ? "border-green/30 bg-green/10" : "border-border bg-surface-muted"}`}>
                  <span>Visible on website</span>
                  <input checked={selected.visible} className="h-5 w-5" onChange={(event) => onUpdate({ visible: event.target.checked })} type="checkbox" />
                </label>
                <button className="inline-flex items-center justify-center rounded-md border border-red/30 p-3 text-sm font-semibold text-red" onClick={onRemove} type="button"><Trash2 className="mr-2" size={16} />Delete holiday</button>
              </div>

              <HolidayProductManager disabled={disabled} holiday={selected} key={selected.id} onApplied={onProductsApplied} />
            </>
          ) : <div className="grid min-h-[560px] place-items-center p-8 text-sm text-secondary">Select a holiday.</div>}
        </div>
      </div>
    </section>
  );
}

export function ProductMerchandisingEditor({ brands, categories, holidays, onHolidayAssignmentChange, onPublishChange, onToggleAge, onToggleBrand, onToggleCategory, onToggleFulfillment, onToggleHoliday, onToggleSurface, onUpdatePlacement, placement, product }: { brands: WebsiteBrand[]; categories: WebsiteCategory[]; holidays: WebsiteHoliday[]; onHolidayAssignmentChange: (placement: WebsiteProductPlacement, holidayId: string, patch: { startsAt?: string; endsAt?: string }) => void; onPublishChange: (placement: WebsiteProductPlacement, checked: boolean) => void; onToggleAge: (placement: WebsiteProductPlacement, age: ProductAgeGroup, checked: boolean) => void; onToggleBrand: (placement: WebsiteProductPlacement, brandId: string, checked: boolean) => void; onToggleCategory: (placement: WebsiteProductPlacement, categoryId: string, checked: boolean) => void; onToggleFulfillment: (placement: WebsiteProductPlacement, mode: FulfillmentMode, checked: boolean) => void; onToggleHoliday: (placement: WebsiteProductPlacement, holiday: WebsiteHoliday, checked: boolean) => void; onToggleSurface: (placement: WebsiteProductPlacement, surface: WebsiteSurface, checked: boolean) => void; onUpdatePlacement: (id: string, patch: Partial<WebsiteProductPlacement>) => void; placement: WebsiteProductPlacement; product: StorefrontProduct }) {
  const issues = placementIssues(placement, categories, holidays);
  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center">
        <Image alt="" className="h-24 w-24 rounded-md border border-border bg-white object-contain" height={96} src={product.imageUrl} unoptimized width={96} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue">Square source product</p>
          <h3 className="mt-1 font-display text-2xl font-semibold">{product.name}</h3>
          <p className="mt-2 text-sm text-secondary">Square category: {product.department} · {formatMoney(product.priceCents)}</p>
          {product.squareVendorNames?.length ? <p className="mt-1 text-sm text-secondary">Square vendor: {product.squareVendorNames.join(", ")}</p> : null}
        </div>
        <StatusBadge issues={issues} visible={placement.visible} />
      </div>
      <div className="mt-6 grid gap-5">
        <DecisionGroup description="Choose every storefront surface where this product is allowed to appear." title="Where on the website?"><ChoiceGrid>{websiteSurfaceOptions.map((surface) => <Choice checked={placement.surfaceIds.includes(surface.id)} key={surface.id} label={surface.label} onChange={(checked) => onToggleSurface(placement, surface.id, checked)} />)}</ChoiceGrid></DecisionGroup>
        <DecisionGroup description="Square categories are reference-only. Choose from the website categories you created." title="Website categories"><ChoiceGrid>{categories.map((category) => { const effectivelyVisible = category.visible && (!category.parentId || categories.find((candidate) => candidate.id === category.parentId)?.visible); return <Choice checked={placement.categoryIds.includes(category.id)} disabled={!effectivelyVisible} key={category.id} label={`${websiteCategoryLabel(category, categories)}${effectivelyVisible ? "" : " (hidden)"}`} onChange={(checked) => onToggleCategory(placement, category.id, checked)} />; })}</ChoiceGrid>{categories.length === 0 ? <EmptyDecision>Create and enable a website category above before publishing products.</EmptyDecision> : null}</DecisionGroup>
        <DecisionGroup description="Assign the customer-facing brands that should contain this product. Square vendors remain read-only references." title="Website brands"><ChoiceGrid>{brands.map((brand) => <Choice checked={placement.brandIds.includes(brand.id)} disabled={!brand.visible} key={brand.id} label={`${brand.name}${brand.visible ? "" : " (hidden)"}`} onChange={(checked) => onToggleBrand(placement, brand.id, checked)} />)}</ChoiceGrid>{brands.length === 0 ? <EmptyDecision>Create and enable a website brand above before assigning products.</EmptyDecision> : null}</DecisionGroup>
        <DecisionGroup description="Optional. Each product can use a narrower date window than the holiday campaign." title="Holiday placement">{holidays.length ? <div className="grid gap-3">{holidays.map((holiday) => { const assignment = placement.holidayAssignments.find((current) => current.holidayId === holiday.id); return <div className="rounded-md border border-border bg-surface-muted p-3" key={holiday.id}><Choice checked={Boolean(assignment)} disabled={!holiday.visible} label={`${holiday.name}${holiday.visible ? "" : " (hidden)"}`} onChange={(checked) => onToggleHoliday(placement, holiday, checked)} />{assignment ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Product starts"><input className={inputClassName} onChange={(event) => onHolidayAssignmentChange(placement, holiday.id, { startsAt: event.target.value })} type="date" value={assignment.startsAt} /></Field><Field label="Product ends"><input className={inputClassName} onChange={(event) => onHolidayAssignmentChange(placement, holiday.id, { endsAt: event.target.value })} type="date" value={assignment.endsAt} /></Field></div> : null}</div>; })}</div> : <EmptyDecision>Create and enable a holiday above to schedule products.</EmptyDecision>}</DecisionGroup>
        <DecisionGroup description="Select all recommended customer age ranges that apply." title="Age range"><ChoiceGrid>{productAgeGroups.map((age) => <Choice checked={placement.ageGroups.includes(age.id)} key={age.id} label={age.label} onChange={(checked) => onToggleAge(placement, age.id, checked)} />)}</ChoiceGrid></DecisionGroup>
        <DecisionGroup description="These website rules are independent from Square location and inventory data." title="Fulfillment"><ChoiceGrid>{fulfillmentOptions.map((mode) => <Choice checked={placement.fulfillmentModes.includes(mode.id)} key={mode.id} label={mode.label} onChange={(checked) => onToggleFulfillment(placement, mode.id, checked)} />)}</ChoiceGrid></DecisionGroup>
        <DecisionGroup description="Lower numbers appear first within website product grids." title="Sort priority"><input className={`${inputClassName} max-w-40`} min={0} onChange={(event) => onUpdatePlacement(product.squareVariationId, { sortOrder: Number(event.target.value) || 0 })} type="number" value={placement.sortOrder} /></DecisionGroup>
      </div>
      <div className={`mt-6 rounded-md border p-5 ${issues.length ? "border-yellow/50 bg-yellow/10" : placement.visible ? "border-green/30 bg-green/10" : "border-blue/30 bg-cyan"}`}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="font-display text-xl font-semibold">Website publishing</p><p className="mt-1 text-sm text-secondary">{issues.length ? `${issues.length} decision${issues.length === 1 ? "" : "s"} remaining.` : placement.visible ? "This product is approved for the selected surfaces." : "All required decisions are complete. You can publish this product."}</p></div><label className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm font-semibold ${issues.length ? "cursor-not-allowed border-border bg-surface-muted text-secondary" : "cursor-pointer border-primary bg-surface"}`}><input checked={placement.visible} className="h-5 w-5" disabled={issues.length > 0} onChange={(event) => onPublishChange(placement, event.target.checked)} type="checkbox" />{placement.visible ? <><Eye size={17} />Live</> : <><EyeOff size={17} />Hidden</>}</label></div>
        {issues.length ? <ul className="mt-4 grid gap-2 text-sm text-secondary">{issues.map((issue) => <li className="flex items-start gap-2" key={issue}><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red" />{issue}</li>)}</ul> : <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-green"><Check size={17} />Ready to publish</p>}
      </div>
    </div>
  );
}

const inputClassName = "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary";

function ModuleLaunchCard({ action, body, onClick, title }: { action: string; body: string; onClick: () => void; title: string }) {
  return <button className="rounded-md border border-border bg-surface p-5 text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-sm" onClick={onClick} type="button"><span className="font-display text-xl font-semibold">{title}</span><span className="mt-2 block text-sm leading-6 text-secondary">{body}</span><span className="mt-4 inline-flex items-center text-sm font-semibold text-blue">{action}<ChevronRight className="ml-1" size={16} /></span></button>;
}

function Metric({ emphasis = false, label, value }: { emphasis?: boolean; label: string; value: number }) { return <div className="rounded-md border border-border bg-surface px-4 py-3"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary">{label}</p><p className={`mt-1 text-2xl font-black ${emphasis ? "text-red" : "text-primary"}`}>{value}</p></div>; }
function Field({ children, className, label }: { children: ReactNode; className?: string; label: string }) { return <label className={className}><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-secondary">{label}</span>{children}</label>; }
function DecisionGroup({ children, title }: { children: ReactNode; description: string; title: string }) { return <fieldset className="rounded-md border border-border bg-surface-muted p-4"><legend className="px-1 font-display text-lg font-semibold">{title}</legend>{children}</fieldset>; }
function ChoiceGrid({ children }: { children: ReactNode }) { return <div className="flex flex-wrap gap-2">{children}</div>; }
function Choice({ checked, disabled = false, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) { return <label className={`flex items-center gap-2 rounded-pill border px-3 py-2 text-xs font-semibold ${disabled ? "cursor-not-allowed border-border bg-surface-muted text-secondary opacity-60" : checked ? "cursor-pointer border-blue bg-cyan text-primary" : "cursor-pointer border-border bg-surface text-secondary hover:border-blue"}`}><input checked={checked} className="h-4 w-4" disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />{label}</label>; }
function EmptyDecision({ children }: { children: ReactNode }) { return <p className="rounded-md border border-dashed border-border bg-surface p-4 text-sm text-secondary">{children}</p>; }
export function EmptyEditor() { return <div className="grid min-h-[560px] place-items-center text-center"><div><h3 className="font-display text-2xl font-semibold">Select a Square product</h3><p className="mt-2 text-secondary">Its website merchandising record will open here.</p></div></div>; }
function StatusBadge({ issues, visible }: { issues: string[]; visible: boolean }) { const label = visible && issues.length === 0 ? "Live" : issues.length === 0 ? "Ready" : "Needs setup"; return <span className={`shrink-0 rounded-pill px-2 py-1 text-[10px] font-black uppercase tracking-[0.06em] ${visible && issues.length === 0 ? "bg-green/15 text-green" : issues.length === 0 ? "bg-cyan text-blue" : "bg-yellow/30 text-primary"}`}>{label}</span>; }
function productFilterLabel(filter: ProductFilter) { if (filter === "needs-setup") return "Needs setup"; if (filter === "ready") return "Ready"; if (filter === "live") return "Live"; return "All products"; }
function formatProductCount(value: number) { return `${value.toLocaleString()} ${value === 1 ? "product" : "products"}`; }
function formatSubcategoryCount(value: number) { return `${value.toLocaleString()} ${value === 1 ? "subcategory" : "subcategories"}`; }
function subscribeToCatalogHashChange(callback: () => void) { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); }
function readCatalogPublishingHash() { return window.location.hash || "#overview"; }
function navigateCatalogPublishing(module: "structure-brands" | "products" | "bulk") { window.location.hash = module; }
function resolveCatalogPublishingModule(hash: string): { activeModule: WorkspaceModule; structureModule: StructureModule } {
  if (hash === "#products") return { activeModule: "products", structureModule: "brands" };
  if (hash === "#catalog-test") return { activeModule: "catalog-test", structureModule: "brands" };
  if (hash === "#bulk") return { activeModule: "bulk", structureModule: "brands" };
  if (hash === "#structure-categories") return { activeModule: "structure", structureModule: "categories" };
  if (hash === "#structure-holidays") return { activeModule: "structure", structureModule: "holidays" };
  if (hash === "#structure-brands" || hash === "#website-brands") return { activeModule: "structure", structureModule: "brands" };
  return { activeModule: "overview", structureModule: "brands" };
}
function hasBulkValueSelection(mode: BulkValueMode, selectedCount: number) { return mode === "replace" || ((mode === "add" || mode === "remove") && selectedCount > 0); }
function toggleValue<T extends string>(values: T[], value: T, checked: boolean) { return checked ? Array.from(new Set([...values, value])) : values.filter((current) => current !== value); }
function normalizeCategorySiblingOrder(categories: WebsiteCategory[]) {
  const ordered = orderWebsiteCategories(categories);
  const nextPositionByParent = new Map<string | null, number>();
  return ordered.map((category) => {
    const sortOrder = nextPositionByParent.get(category.parentId) ?? 0;
    nextPositionByParent.set(category.parentId, sortOrder + 1);
    return { ...category, sortOrder };
  });
}
function uniqueSlug(name: string, usedSlugs: string[]) { const base = slugifyWebsiteCategory(name) || "collection"; if (!usedSlugs.includes(base)) return base; let suffix = 2; while (usedSlugs.includes(`${base}-${suffix}`)) suffix += 1; return `${base}-${suffix}`; }
function placementIssues(placement: WebsiteProductPlacement, categories: WebsiteCategory[], holidays: WebsiteHoliday[]) {
  return websitePlacementReadinessIssues(placement, categories, holidays);
}
async function uploadBrandImage(file: File, context: string) {
  if (!file.type.startsWith("image/")) throw new Error("Upload must be an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Upload must be 5 MB or smaller.");
  const formData = new FormData();
  formData.append("file", file);
  formData.append("context", context);
  const response = await fetch("/api/admin/media", { method: "POST", body: formData });
  const result = (await response.json()) as { ok?: boolean; asset?: { url: string; originalName: string }; errors?: string[] };
  if (!response.ok || !result.ok || !result.asset?.url) throw new Error(result.errors?.join(" ") || "Logo upload failed.");
  return result.asset;
}
function formatSnapshotDate(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(value)); }
