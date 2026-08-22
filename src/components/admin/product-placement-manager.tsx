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
import { useMemo, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronRight, Download, FileSpreadsheet, Palette, PencilLine, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { SectionFrame } from "@/components/sections/section-frame";
import { Button } from "@/components/ui/button";
import { BrandGtinImporter, type BrandGtinMutation } from "@/components/admin/brand-gtin-importer";
import { AdminProductsNavigation } from "@/components/admin/admin-products-workspace";
import { HolidayProductManager, type HolidayProductMutation } from "@/components/admin/holiday-product-manager";
import { SearchableSingleSelect } from "@/components/admin/searchable-select";
import { FullCatalogProductManager } from "@/components/admin/full-catalog-product-manager";
import { PartyMerchandisingManager, type PartyRecommendationDraft } from "@/components/admin/party-merchandising-manager";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import { createPartyMerchandisingStructure, partyCategoriesByKind } from "@/features/catalog/services/party-merchandising-service";
import {
  MAX_WEBSITE_CATEGORY_DEPTH,
  orderWebsiteCategories,
  slugifyWebsiteCategory,
  websiteCategoryDepth,
  websiteCategoryDescendantIds,
  websiteCategoryKindIds,
  websiteCategoryLabel,
  websiteCategoryPath,
  websitePlacementReadinessIssues,
  type WebsiteBrand,
  type WebsiteCategory,
  type WebsiteHoliday,
  type WebsiteProductPlacement,
  type WebsiteMerchandisingConfig
} from "@/features/catalog/services/website-merchandising-service";
import {
  applyWebsiteMerchandisingSpreadsheetRows,
  createWebsiteMerchandisingCsv,
  parseCsvTable,
  parseWebsiteMerchandisingTable,
  type MerchandisingSpreadsheetParseResult,
  type MerchandisingSpreadsheetPatch
} from "@/features/catalog/services/merchandising-spreadsheet-service";
import type { SquareVendorReference } from "@/server/square/read-only-catalog";

type ProductPlacementManagerProps = {
  products: StorefrontProduct[];
  initialConfig: WebsiteMerchandisingConfig;
  squareInboxCount: number;
  squareVendors: SquareVendorReference[];
  initialBrandProductCounts: Record<string, number>;
  initialCategoryProductCounts: Record<string, number>;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type WorkspaceModule = "overview" | "structure" | "products" | "bulk";
type StructureModule = "brands" | "categories" | "holidays" | "party";

export function ProductPlacementManager({ products, initialConfig, squareInboxCount, initialBrandProductCounts, initialCategoryProductCounts, squareVendors }: ProductPlacementManagerProps) {
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
  const [categoryProductCountOverrides, setCategoryProductCountOverrides] = useState(initialCategoryProductCounts);
  const [catalogWebsiteCategoryId, setCatalogWebsiteCategoryId] = useState("");
  const [configUpdatedAt, setConfigUpdatedAt] = useState(initialConfig.updatedAt);

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId) ?? null;
  const selectedHoliday = holidays.find((holiday) => holiday.id === selectedHolidayId) ?? null;
  const catalogPublishingHash = useSyncExternalStore(subscribeToCatalogHashChange, readCatalogPublishingHash, () => "#overview");
  const { activeModule, structureModule } = resolveCatalogPublishingModule(catalogPublishingHash);
  const liveProductCount = placements.filter((placement) => placement.visible && placementIssues(placement, categories, holidays).length === 0).length;
  const readyProductCount = placements.filter((placement) => !placement.visible && placementIssues(placement, categories, holidays).length === 0).length;
  const pendingProductCount = Math.max(0, squareInboxCount - liveProductCount - readyProductCount);
  const productCountByBrand = useMemo(() => Object.fromEntries(brands.map((brand) => [brand.id, brandProductCountOverrides[brand.id] ?? placements.filter((placement) => placement.brandIds.includes(brand.id)).length])), [brandProductCountOverrides, brands, placements]);
  const productCountByCategory = useMemo(() => Object.fromEntries(categories.map((category) => [category.id, categoryProductCountOverrides[category.id] ?? placements.filter((placement) => placement.categoryIds.includes(category.id)).length])), [categories, categoryProductCountOverrides, placements]);
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
    const parent = parentId ? categories.find((category) => category.id === parentId) : null;
    if (parentId && (!parent || websiteCategoryDepth(parent, categories) >= MAX_WEBSITE_CATEGORY_DEPTH)) {
      return showError(`Choose a valid parent within the first ${MAX_WEBSITE_CATEGORY_DEPTH - 1} levels.`);
    }
    const slug = uniqueSlug(name, categories.map((category) => category.slug));
    const siblings = categories.filter((category) => category.parentId === parentId);
    const category: WebsiteCategory = {
      id: `web-category-${slug}`,
      name,
      slug,
      description: newCategoryDescription.trim(),
      imageUrl: "",
      imageAlt: "",
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
      const descendantIds = new Set(websiteCategoryDescendantIds(selectedCategory.id, categories));
      const parent = patch.parentId ? categories.find((category) => category.id === patch.parentId) : null;
      if (patch.parentId && (!parent || parent.id === selectedCategory.id || descendantIds.has(parent.id))) {
        return showError("A category cannot be placed inside itself or one of its subcategories.");
      }
      const nextDepth = parent ? websiteCategoryDepth(parent, categories) + 1 : 1;
      const subtreeHeight = websiteCategorySubtreeHeight(selectedCategory, categories);
      if (!Number.isFinite(nextDepth) || nextDepth + subtreeHeight - 1 > MAX_WEBSITE_CATEGORY_DEPTH) {
        return showError(`This move would exceed the ${MAX_WEBSITE_CATEGORY_DEPTH}-level category limit.`);
      }
      const nextSortOrder = categories.filter((category) => category.parentId === (patch.parentId ?? null) && category.id !== selectedCategory.id).length;
      patch = { ...patch, sortOrder: nextSortOrder };
    }

    setCategories((current) => normalizeCategorySiblingOrder(current.map((category) => (category.id === selectedCategory.id ? { ...category, ...patch } : category))));
    if (patch.visible === false || patch.parentId !== undefined) {
      const affectedCategoryIds = new Set([selectedCategory.id, ...websiteCategoryDescendantIds(selectedCategory.id, categories)]);
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
    if (!selectedBrand || !window.confirm(`Remove “${selectedBrand.name}” from the website? Square will not change.`)) return false;
    const remaining = brands.filter((brand) => brand.id !== selectedBrand.id);
    setBrands(remaining.map((brand, index) => ({ ...brand, sortOrder: index })));
    setPlacements((current) => current.map((placement) => ({ ...placement, brandIds: placement.brandIds.filter((id) => id !== selectedBrand.id), visible: false })));
    setSelectedBrandId(remaining[0]?.id ?? "");
    markChanged("Brand removed. Affected products returned to hidden review.");
    return true;
  }

  function removeCategory() {
    if (!selectedCategory || !window.confirm(`Remove “${selectedCategory.name}” from the website? Square will not change.`)) return false;
    if (categories.some((category) => category.parentId === selectedCategory.id)) {
      showError("Move or remove this category's subcategories first.");
      return false;
    }
    const remaining = categories.filter((category) => category.id !== selectedCategory.id);
    setCategories(normalizeCategorySiblingOrder(remaining));
    setPlacements((current) => current.map((placement) => ({ ...placement, categoryIds: placement.categoryIds.filter((id) => id !== selectedCategory.id), visible: false })));
    setSelectedCategoryId(remaining[0]?.id ?? "");
    markChanged("Category removed. Affected products returned to hidden review.");
    return true;
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
            navigationCategorySeedVersion: initialConfig.navigationCategorySeedVersion,
            updatedAt: configUpdatedAt,
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
      setConfigUpdatedAt(result.config.updatedAt);
      setIsDirty(false);
      setSaveState("saved");
      setSaveMessage("Saved. Only products explicitly marked live can now reach the website.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to save merchandising.");
    }
  }

  function showError(message: string) {
    setSaveState("error");
    setSaveMessage(message);
  }

  function manageCategoryProducts(categoryId: string) {
    setCatalogWebsiteCategoryId(categoryId);
    navigateCatalogPublishing("products");
    window.setTimeout(() => document.getElementById("full-catalog-products")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function initializePartyMerchandising() {
    const result = createPartyMerchandisingStructure(categories);
    setCategories(result.categories);
    const firstTheme = partyCategoriesByKind(result.categories, "party-theme")[0];
    if (firstTheme) setSelectedCategoryId(firstTheme.id);
    markChanged(result.createdIds.length > 0
      ? `${result.createdIds.length} Party Supplies categories added to the current draft.`
      : "Party Supplies structure is already complete.");
  }

  function editPartyCategory(categoryId: string) {
    setSelectedCategoryId(categoryId);
    window.location.hash = "structure-categories";
  }

  function applyPartyRecommendations(recommendations: PartyRecommendationDraft[]) {
    if (recommendations.length === 0) return;
    const knownCategoryIds = new Set(categories.map((category) => category.id));
    const additionsByCategory = new Map<string, number>();
    const existingByVariationId = new Map(placements.map((placement) => [placement.squareVariationId, placement]));
    for (const recommendation of recommendations) {
      const existingIds = new Set(existingByVariationId.get(recommendation.squareVariationId)?.categoryIds ?? []);
      for (const categoryId of recommendation.categoryIds) {
        if (knownCategoryIds.has(categoryId) && !existingIds.has(categoryId)) {
          additionsByCategory.set(categoryId, (additionsByCategory.get(categoryId) ?? 0) + 1);
        }
      }
    }

    setPlacements((current) => {
      const byVariationId = new Map(current.map((placement) => [placement.squareVariationId, placement]));
      for (const recommendation of recommendations) {
        const categoryIds = recommendation.categoryIds.filter((categoryId) => knownCategoryIds.has(categoryId));
        if (categoryIds.length === 0) continue;
        const existing = byVariationId.get(recommendation.squareVariationId);
        const existingIds = new Set(existing?.categoryIds ?? []);
        for (const categoryId of categoryIds) {
          existingIds.add(categoryId);
        }
        byVariationId.set(recommendation.squareVariationId, existing
          ? { ...existing, categoryIds: Array.from(existingIds), visible: false }
          : {
              squareVariationId: recommendation.squareVariationId,
              categoryIds: Array.from(existingIds),
              brandIds: [],
              holidayAssignments: [],
              ageGroups: [],
              fulfillmentModes: [],
              surfaceIds: [],
              visible: false,
              sortOrder: current.length + byVariationId.size
            });
      }
      return Array.from(byVariationId.values());
    });
    setCategoryProductCountOverrides((current) => {
      const next = { ...current };
      for (const [categoryId, count] of additionsByCategory) next[categoryId] = (next[categoryId] ?? 0) + count;
      return next;
    });
    markChanged(`${recommendations.length.toLocaleString()} recommended product${recommendations.length === 1 ? "" : "s"} added to the Party Supplies draft.`);
  }

  function recordCategoryAssignmentsRemoved(categoryId: string, removedCount: number) {
    setCategoryProductCountOverrides((current) => ({
      ...current,
      [categoryId]: Math.max(0, (current[categoryId] ?? placements.filter((placement) => placement.categoryIds.includes(categoryId)).length) - removedCount)
    }));
  }

  return (
    <>
      <AdminProductsNavigation
        action={<Button className="admin-button" disabled={saveState === "saving" || !isDirty} onClick={saveConfiguration} type="button"><Save size={15} />{saveState === "saving" ? "Saving…" : isDirty ? "Save changes" : "No changes"}</Button>}
        activeTab="publishing"
      />
      <main className="admin-page admin-publishing">
      <SectionFrame area="Admin" className="admin-publishing-frame" component="ProductPlacementManager" sectionId="admin.product-placement-manager" variant="manager">
        <p aria-live="polite" className="sr-only">{saveMessage}</p>
        <nav aria-label="Website publishing sections" className="flex flex-wrap gap-1 border-b border-border py-3">
          <PublishingSectionButton active={activeModule === "overview"} label="Overview" onClick={() => navigateCatalogPublishing("overview")} />
          <PublishingSectionButton active={activeModule === "structure" && structureModule === "brands"} label="Brands" onClick={() => navigateCatalogPublishing("structure-brands")} />
          <PublishingSectionButton active={activeModule === "structure" && structureModule === "categories"} label="Categories" onClick={() => navigateCatalogPublishing("structure-categories")} />
          <PublishingSectionButton active={activeModule === "structure" && structureModule === "holidays"} label="Holidays" onClick={() => navigateCatalogPublishing("structure-holidays")} />
          <PublishingSectionButton active={activeModule === "structure" && structureModule === "party"} label="Party Supplies" onClick={() => navigateCatalogPublishing("structure-party")} />
          <PublishingSectionButton active={activeModule === "products"} label="Products" onClick={() => navigateCatalogPublishing("products")} />
          <PublishingSectionButton active={activeModule === "bulk"} label="Import & export" onClick={() => navigateCatalogPublishing("bulk")} />
        </nav>

        {activeModule === "overview" ? <section className="admin-publishing-overview" aria-labelledby="publishing-overview-heading">
          <div>
            <h2 className="admin-section-heading" id="publishing-overview-heading">Publishing overview</h2>
            <p className="admin-section-note">A product becomes visible only after its website setup is complete.</p>
          </div>
          <div className="admin-publishing-metrics">
            <Metric label="Square inbox" value={squareInboxCount} />
            <Metric emphasis={pendingProductCount > 0} label="Needs setup" value={pendingProductCount} />
            <Metric label="Ready, hidden" value={readyProductCount} />
            <Metric label="Live on website" value={liveProductCount} />
          </div>
          <div className="admin-publishing-state">
            <p className="admin-publishing-state-label">Current website state</p>
            <p className="admin-publishing-state-value">{liveProductCount === 0 ? "Nothing is published yet" : `${liveProductCount} products published`}</p>
            <p className="admin-publishing-state-note">{liveProductCount === 0 ? "Products remain hidden until every required merchandising decision is complete." : "Only fully configured products are included in the live website assortment."}</p>
          </div>
          <div className="admin-publishing-modules">
            <ModuleLaunchCard action="Open" body="Brands, categories and holidays" onClick={() => navigateCatalogPublishing("structure-brands")} title="Website structure" />
            <ModuleLaunchCard action="Open" body={`${pendingProductCount} need setup`} onClick={() => navigateCatalogPublishing("products")} title="Products" />
            <ModuleLaunchCard action="Open" body="CSV and Excel import/export" onClick={() => navigateCatalogPublishing("bulk")} title="Import & export" />
          </div>
        </section> : null}

        {activeModule === "structure" ? <section className="admin-publishing-workspace" aria-label="Website structure">
          <div>
            {structureModule === "brands" ? <BrandManager brands={brands} disabled={isDirty || saveState === "saving"} newDescription={newBrandDescription} newName={newBrandName} onAdd={addBrand} onDescriptionChange={setNewBrandDescription} onNameChange={setNewBrandName} onProductsApplied={syncBrandProducts} onRemove={removeBrand} onSelect={setSelectedBrandId} onUpdate={updateBrand} productCountByBrand={productCountByBrand} selected={selectedBrand} squareVendors={squareVendors} /> : null}
            {structureModule === "categories" ? <CategoryManager categories={categories} newDescription={newCategoryDescription} newName={newCategoryName} newParentId={newCategoryParentId} onAdd={addCategory} onDescriptionChange={setNewCategoryDescription} onManageProducts={manageCategoryProducts} onMove={moveCategory} onNameChange={setNewCategoryName} onParentChange={setNewCategoryParentId} onRemove={removeCategory} onSelect={setSelectedCategoryId} onUpdate={updateCategory} productCountByCategory={productCountByCategory} selected={selectedCategory} /> : null}
            {structureModule === "holidays" ? <HolidayManager disabled={isDirty || saveState === "saving"} endDate={newHolidayEndDate} holidays={holidays} newDescription={newHolidayDescription} newName={newHolidayName} onAdd={addHoliday} onDescriptionChange={setNewHolidayDescription} onEndDateChange={setNewHolidayEndDate} onNameChange={setNewHolidayName} onProductsApplied={syncHolidayProducts} onRemove={removeHoliday} onSelect={setSelectedHolidayId} onStartDateChange={setNewHolidayStartDate} onUpdate={updateHoliday} selected={selectedHoliday} startDate={newHolidayStartDate} /> : null}
            {structureModule === "party" ? <PartyMerchandisingManager categories={categories} disabled={saveState === "saving"} onApplyRecommended={applyPartyRecommendations} onEditCategory={editPartyCategory} onInitialize={initializePartyMerchandising} placements={placements} /> : null}
          </div>
        </section> : null}

        {activeModule === "products" ? <>
          <FullCatalogProductManager brands={brands} categories={categories} disabled={isDirty || saveState === "saving"} holidays={holidays} initialWebsiteCategoryId={catalogWebsiteCategoryId} onCategoryAssignmentsRemoved={recordCategoryAssignmentsRemoved} onWebsiteCategoryChange={setCatalogWebsiteCategoryId} squareVendors={squareVendors} />
        </> : null}

        {activeModule === "bulk" ? <section className="admin-publishing-workspace" aria-labelledby="bulk-publishing-heading">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-xl font-semibold" id="bulk-publishing-heading">Bulk catalog tools</h2>
              <p className="mt-1 text-sm text-secondary">Use Products for manual bulk changes across the full Square catalog.</p>
            </div>
            <Button onClick={() => navigateCatalogPublishing("products")} type="button" variant="quiet">Open Products<ChevronRight className="ml-2" size={16} /></Button>
          </div>
          <div className="mt-5 overflow-hidden rounded-md border border-border bg-surface">
            <SpreadsheetMerchandisingPanel brands={brands} categories={categories} holidays={holidays} onApply={applySpreadsheetEdit} placements={placements} products={products} />
          </div>
        </section> : null}
      </SectionFrame>
      {isDirty ? <div className="admin-publishing-savebar"><div className="hidden min-w-0 sm:block"><p className="text-sm font-semibold">Unsaved changes</p><p className="max-w-sm truncate text-xs text-white/70">Review the draft, then save it to update the website.</p></div><Button className="shrink-0 bg-white text-primary hover:bg-surface-muted" disabled={saveState === "saving"} onClick={saveConfiguration} type="button"><Save size={15} />{saveState === "saving" ? "Saving…" : "Save changes"}</Button></div> : null}
      </main>
    </>
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
  onRemove: () => boolean;
  onSelect: (id: string) => void;
  onUpdate: (patch: Partial<WebsiteBrand>) => void;
  productCountByBrand: Record<string, number>;
  selected: WebsiteBrand | null;
  squareVendors: SquareVendorReference[];
}) {
  const [vendorToImport, setVendorToImport] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(brands.length === 0);
  const [editOpen, setEditOpen] = useState(false);
  const importedVendorIds = new Set(brands.flatMap((brand) => brand.squareVendorIds));
  const selectedProductCount = selected ? productCountByBrand[selected.id] ?? 0 : 0;
  const heroEligible = Boolean(selected?.visible && selected.logoUrl);

  function openEditor(brandId: string) {
    onSelect(brandId);
    setUploadMessage("");
    setCreateOpen(false);
    setEditOpen(true);
  }

  async function uploadLogo(file: File) {
    setUploadMessage("Uploading logo...");
    try {
      const asset = await uploadAdminImage(file, selected?.id ?? "website-brand");
      onUpdate({ logoUrl: asset.url, imageAlt: selected?.imageAlt || `${selected?.name ?? "Brand"} logo` });
      setUploadMessage(`Uploaded ${asset.originalName}.`);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Logo upload failed.");
    }
  }

  return (
    <section className="overflow-hidden rounded-md border border-border bg-surface" id="website-brands">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="font-display text-xl font-semibold">Brands</h3>
        <button
          className="inline-flex min-h-10 items-center rounded-md bg-primary px-3 text-sm font-semibold text-white"
          onClick={() => {
            setEditOpen(false);
            setCreateOpen(true);
          }}
          type="button"
        >
          <Plus className="mr-2" size={16} />
          New brand
        </button>
      </header>

      <div className="p-3 sm:p-4">
        {brands.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {brands.map((brand) => (
              <li key={brand.id}>
                <button className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-muted" onClick={() => openEditor(brand.id)} type="button">
                  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-white">
                    {brand.logoUrl ? <Image alt="" className="h-full w-full object-contain p-1" height={40} src={brand.logoUrl} unoptimized width={40} /> : <span className="text-sm font-black text-secondary">{brand.name.slice(0, 1).toUpperCase()}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-primary">{brand.name}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1 text-xs text-secondary">
                      <span>{formatProductCount(productCountByBrand[brand.id] ?? 0)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{brand.visible ? "Visible" : "Hidden"}</span>
                      {brand.featuredOnHomepage ? <><span aria-hidden="true">·</span><span>Homepage</span></> : null}
                    </span>
                  </span>
                  <ChevronRight className="shrink-0 text-secondary" size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-12 text-center text-sm text-secondary">No brands</p>
        )}
      </div>

      {createOpen ? (
        <EditorModal onClose={() => setCreateOpen(false)} title="New brand">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const vendor = squareVendors.find((item) => item.id === vendorToImport);
              onAdd(vendor);
              setVendorToImport("");
              setCreateOpen(false);
            }}
          >
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field className="sm:col-span-2" label="Name">
                <input autoFocus className={inputClassName} maxLength={80} onChange={(event) => onNameChange(event.target.value)} placeholder="e.g. Crayola" value={newName} />
              </Field>
              {squareVendors.length > 0 ? (
                <SearchableField className="sm:col-span-2" label="Square vendor (optional)">
                  <SearchableSingleSelect
                    allLabel="No Square vendor"
                    label="Square vendor"
                    onChange={setVendorToImport}
                    options={squareVendors.map((vendor) => ({
                      id: vendor.id,
                      label: `${vendor.name}${importedVendorIds.has(vendor.id) ? " (already imported)" : ""}`,
                      disabled: importedVendorIds.has(vendor.id)
                    }))}
                    searchLabel="Search Square vendors"
                    value={vendorToImport}
                  />
                </SearchableField>
              ) : null}
              <Field className="sm:col-span-2" label="Description">
                <textarea className={inputClassName} maxLength={240} onChange={(event) => onDescriptionChange(event.target.value)} rows={2} value={newDescription} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-border p-4">
              <button className="min-h-10 rounded-md px-4 text-sm font-semibold text-secondary hover:bg-surface-muted" onClick={() => setCreateOpen(false)} type="button">Cancel</button>
              <button className="min-h-10 rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-40" disabled={!newName.trim() && !vendorToImport} type="submit">Create</button>
            </div>
          </form>
        </EditorModal>
      ) : null}

      {editOpen && selected ? (
        <EditorModal onClose={() => setEditOpen(false)} title={`Edit ${selected.name}`}>
          <div className="grid gap-5 p-5 md:grid-cols-[150px_minmax(0,1fr)]">
            <div>
              <div className="relative grid aspect-square place-items-center overflow-hidden rounded-md border border-border bg-surface-muted">
                {selected.logoUrl ? <Image alt={selected.imageAlt || `${selected.name} logo`} className="h-full w-full object-contain p-3" height={150} src={selected.logoUrl} unoptimized width={150} /> : <span className="px-3 text-center text-sm font-semibold text-secondary">No logo</span>}
              </div>
              <label className="mt-2 inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-md border border-border px-3 text-sm font-semibold">
                <Upload className="mr-2" size={15} />
                {selected.logoUrl ? "Replace" : "Upload"}
                <input accept="image/gif,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadLogo(file); }} type="file" />
              </label>
              {selected.logoUrl ? <button className="mt-1 min-h-9 w-full rounded-md text-xs font-semibold text-red hover:bg-red/5" onClick={() => onUpdate({ logoUrl: "", imageAlt: "" })} type="button">Remove</button> : null}
              {uploadMessage ? <p aria-live="polite" className="mt-2 text-xs text-secondary">{uploadMessage}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2" label="Name">
                <input className={inputClassName} maxLength={80} onChange={(event) => onUpdate({ name: event.target.value })} value={selected.name} />
              </Field>
              <Field className="sm:col-span-2" label="Description">
                <textarea className={inputClassName} maxLength={240} onChange={(event) => onUpdate({ description: event.target.value })} rows={2} value={selected.description} />
              </Field>
              <label className="flex cursor-pointer items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm font-semibold sm:col-span-2">
                <span>Visible</span>
                <input checked={selected.visible} className="h-5 w-5" onChange={(event) => onUpdate({ visible: event.target.checked })} type="checkbox" />
              </label>
              <label className={`flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm font-semibold sm:col-span-2 ${heroEligible ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                <span>Featured on homepage</span>
                <input checked={selected.featuredOnHomepage} className="h-5 w-5" disabled={!heroEligible} onChange={(event) => onUpdate({ featuredOnHomepage: event.target.checked })} type="checkbox" />
              </label>

              <details className="rounded-md border border-border sm:col-span-2">
                <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">More settings</summary>
                <div className="grid gap-4 border-t border-border p-3 sm:grid-cols-2">
                  <Field className="sm:col-span-2" label="URL slug"><input className={inputClassName} maxLength={100} onChange={(event) => onUpdate({ slug: slugifyWebsiteCategory(event.target.value) })} value={selected.slug} /></Field>
                  {squareVendors.length > 0 ? <SearchableField className="sm:col-span-2" label="Square vendor reference"><SearchableSingleSelect allLabel="No linked Square vendor" label="Square vendor reference" onChange={(vendorId) => onUpdate({ squareVendorIds: vendorId ? [vendorId] : [] })} options={squareVendors.map((vendor) => ({ id: vendor.id, label: vendor.name }))} searchLabel="Search Square vendors" value={selected.squareVendorIds[0] ?? ""} /></SearchableField> : null}
                  <Field className="sm:col-span-2" label="Logo URL"><input className={inputClassName} maxLength={500} onChange={(event) => onUpdate({ logoUrl: event.target.value })} value={selected.logoUrl} /></Field>
                  <Field className="sm:col-span-2" label="Image alt"><input className={inputClassName} maxLength={160} onChange={(event) => onUpdate({ imageAlt: event.target.value })} placeholder={`${selected.name} logo`} value={selected.imageAlt} /></Field>
                </div>
              </details>
            </div>
          </div>

          <div className="border-t border-border px-5 pb-5">
            <BrandGtinImporter brand={selected} disabled={disabled} key={selected.id} onApplied={onProductsApplied} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-secondary">Products ({selectedProductCount})</span>
              <button className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold text-red hover:bg-red/5" onClick={() => { if (onRemove()) setEditOpen(false); }} type="button"><Trash2 className="mr-2" size={15} />Delete</button>
            </div>
            <button className="min-h-10 rounded-md bg-primary px-4 text-sm font-semibold text-white" onClick={() => setEditOpen(false)} type="button">Done</button>
          </div>
        </EditorModal>
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
  onManageProducts,
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
  onManageProducts: (categoryId: string) => void;
  onMove: (direction: "up" | "down") => void;
  onNameChange: (value: string) => void;
  onParentChange: (value: string) => void;
  onRemove: () => boolean;
  onSelect: (id: string) => void;
  onUpdate: (patch: Partial<WebsiteCategory>) => void;
  productCountByCategory: Record<string, number>;
  selected: WebsiteCategory | null;
}) {
  const [uploadMessage, setUploadMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(categories.length === 0);
  const [editOpen, setEditOpen] = useState(false);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>([]);
  const orderedCategories = orderWebsiteCategories(categories);
  const categoryIds = new Set(categories.map((category) => category.id));
  const rootCategories = orderedCategories.filter((category) => !category.parentId || !categoryIds.has(category.parentId));
  const createParentCategories = orderedCategories.filter((category) => websiteCategoryDepth(category, categories) < MAX_WEBSITE_CATEGORY_DEPTH);
  const selectedSiblings = selected
    ? categories
      .filter((category) => category.parentId === selected.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    : [];
  const selectedIndex = selected ? selectedSiblings.findIndex((category) => category.id === selected.id) : -1;
  const selectedChildren = selected ? categories.filter((category) => category.parentId === selected.id) : [];
  const selectedPath = selected ? websiteCategoryPath(selected, categories) : [];
  const hiddenAncestor = selectedPath.slice(0, -1).find((category) => !category.visible);
  const selectedDescendantIds = new Set(selected ? websiteCategoryDescendantIds(selected.id, categories) : []);
  const selectedSubtreeHeight = selected ? websiteCategorySubtreeHeight(selected, categories) : 1;
  const availableParentCategories = selected
    ? orderedCategories.filter((category) => {
      if (category.id === selected.id || selectedDescendantIds.has(category.id)) return false;
      const parentDepth = websiteCategoryDepth(category, categories);
      return Number.isFinite(parentDepth) && parentDepth + selectedSubtreeHeight <= MAX_WEBSITE_CATEGORY_DEPTH;
    })
    : [];

  function openEditor(categoryId: string) {
    onSelect(categoryId);
    setUploadMessage("");
    setCreateOpen(false);
    setEditOpen(true);
  }

  function toggleCategory(categoryId: string) {
    setExpandedCategoryIds((current) => current.includes(categoryId)
      ? current.filter((id) => id !== categoryId)
      : [...current, categoryId]);
  }

  async function uploadCategoryImage(file: File) {
    setUploadMessage("Uploading...");
    try {
      const asset = await uploadAdminImage(file, selected?.id ?? "website-category");
      onUpdate({
        imageUrl: asset.url,
        imageAlt: selected?.imageAlt || selected?.name || "Category image"
      });
      setUploadMessage("Uploaded " + asset.originalName + ".");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  return (
    <section className="overflow-hidden rounded-md border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="font-display text-xl font-semibold">Categories</h3>
        <button
          className="inline-flex min-h-10 items-center rounded-md bg-primary px-3 text-sm font-semibold text-white"
          onClick={() => {
            setEditOpen(false);
            setCreateOpen(true);
          }}
          type="button"
        >
          <Plus className="mr-2" size={16} />
          New category
        </button>
      </header>

      <div className="p-3 sm:p-4">
        {rootCategories.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border" role="tree">
            {rootCategories.map((category) => (
              <CategoryTreeItem
                categories={orderedCategories}
                category={category}
                depth={1}
                expandedCategoryIds={expandedCategoryIds}
                key={category.id}
                onEdit={openEditor}
                onToggle={toggleCategory}
              />
            ))}
          </ul>
        ) : (
          <p className="py-12 text-center text-sm text-secondary">No categories</p>
        )}
      </div>

      {createOpen ? (
        <EditorModal onClose={() => setCreateOpen(false)} title="New category">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const parentId = newParentId;
              onAdd();
              if (parentId) {
                setExpandedCategoryIds((current) => current.includes(parentId) ? current : [...current, parentId]);
              }
              setCreateOpen(false);
            }}
          >
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field className="sm:col-span-2" label="Name">
                <input autoFocus className={inputClassName} maxLength={80} onChange={(event) => onNameChange(event.target.value)} value={newName} />
              </Field>
              <SearchableField className="sm:col-span-2" label="Parent">
                <SearchableSingleSelect
                  allLabel="Main category"
                  label="Parent category"
                  onChange={onParentChange}
                  options={createParentCategories.map((category) => ({
                    id: category.id,
                    label: websiteCategoryLabel(category, categories)
                  }))}
                  searchLabel="Search categories"
                  value={newParentId}
                />
              </SearchableField>
              <Field className="sm:col-span-2" label="Description">
                <textarea className={inputClassName} maxLength={240} onChange={(event) => onDescriptionChange(event.target.value)} rows={2} value={newDescription} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-border p-4">
              <button className="min-h-10 rounded-md px-4 text-sm font-semibold text-secondary hover:bg-surface-muted" onClick={() => setCreateOpen(false)} type="button">Cancel</button>
              <button className="min-h-10 rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-40" disabled={!newName.trim()} type="submit">Create</button>
            </div>
          </form>
        </EditorModal>
      ) : null}

      {editOpen && selected ? (
        <EditorModal onClose={() => setEditOpen(false)} title={"Edit " + selected.name}>
          <div className="grid gap-5 p-5 md:grid-cols-[150px_minmax(0,1fr)]">
            <div>
              <div className="relative grid aspect-square overflow-hidden rounded-md border border-border bg-surface-muted">
                {selected.imageUrl ? (
                  <Image
                    alt={selected.imageAlt || selected.name}
                    className="h-full w-full object-contain"
                    height={150}
                    src={
                      selected.slug === "outdoor" && !/cutout|transparent/i.test(selected.imageUrl)
                        ? "/images/categories/outdoor-toys-collage-cutout-v5.png"
                        : selected.imageUrl
                    }
                    unoptimized
                    width={150}
                  />
                ) : null}
              </div>
              <label className="mt-2 inline-flex min-h-10 w-full cursor-pointer items-center justify-center rounded-md border border-border px-3 text-sm font-semibold">
                <Upload className="mr-2" size={15} />
                {selected.imageUrl ? "Replace" : "Upload"}
                <input
                  accept="image/gif,image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadCategoryImage(file);
                  }}
                  type="file"
                />
              </label>
              {selected.imageUrl ? (
                <button className="mt-1 min-h-9 w-full rounded-md text-xs font-semibold text-red hover:bg-red/5" onClick={() => onUpdate({ imageUrl: "", imageAlt: "" })} type="button">Remove</button>
              ) : null}
              {uploadMessage ? <p aria-live="polite" className="mt-2 text-xs text-secondary">{uploadMessage}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2" label="Name">
                <input className={inputClassName} maxLength={80} onChange={(event) => onUpdate({ name: event.target.value })} value={selected.name} />
              </Field>
              <SearchableField className="sm:col-span-2" label="Parent">
                <SearchableSingleSelect
                  allLabel="Main category"
                  label="Parent category"
                  onChange={(parentId) => onUpdate({ parentId: parentId || null })}
                  options={availableParentCategories.map((category) => ({
                    id: category.id,
                    label: websiteCategoryLabel(category, categories)
                  }))}
                  searchLabel="Search categories"
                  value={selected.parentId ?? ""}
                />
              </SearchableField>
              <Field className="sm:col-span-2" label="Description">
                <textarea className={inputClassName} maxLength={240} onChange={(event) => onUpdate({ description: event.target.value })} rows={2} value={selected.description} />
              </Field>
              <label className="flex cursor-pointer items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm font-semibold sm:col-span-2">
                <span>Visible</span>
                <input checked={selected.visible} className="h-5 w-5" onChange={(event) => onUpdate({ visible: event.target.checked })} type="checkbox" />
              </label>
              {hiddenAncestor ? <p className="text-xs font-semibold text-amber-700 sm:col-span-2">Hidden by {hiddenAncestor.name}.</p> : null}

              <details className="rounded-md border border-border sm:col-span-2">
                <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">More settings</summary>
                <div className="grid gap-4 border-t border-border p-3 sm:grid-cols-2">
                  <Field label="URL slug">
                    <input className={inputClassName} maxLength={100} onChange={(event) => onUpdate({ slug: slugifyWebsiteCategory(event.target.value) })} value={selected.slug} />
                  </Field>
                  <Field label="Image alt">
                    <input className={inputClassName} maxLength={160} onChange={(event) => onUpdate({ imageAlt: event.target.value })} placeholder={selected.name + " category"} value={selected.imageAlt} />
                  </Field>
                  <Field className="sm:col-span-2" label="Image URL">
                    <input className={inputClassName} maxLength={500} onChange={(event) => onUpdate({ imageUrl: event.target.value })} value={selected.imageUrl} />
                  </Field>
                  <Field label="Purpose">
                    <select className={inputClassName} onChange={(event) => onUpdate({ kind: event.target.value as WebsiteCategory["kind"] })} value={selected.kind ?? "standard"}>
                      {websiteCategoryKindIds.map((kind) => <option key={kind} value={kind}>{formatCategoryKind(kind)}</option>)}
                    </select>
                  </Field>
                  <Field label="Recommendation terms">
                    <input
                      className={inputClassName}
                      maxLength={500}
                      onChange={(event) => onUpdate({
                        recommendationTerms: event.target.value
                          .split(",")
                          .map((term) => term.trim().slice(0, 80))
                          .filter(Boolean)
                          .slice(0, 20)
                      })}
                      value={(selected.recommendationTerms ?? []).join(", ")}
                    />
                  </Field>
                  {selected.kind === "party-solid-color" ? (
                    <Field label="Color">
                      <input className={inputClassName} onChange={(event) => onUpdate({ swatchColor: event.target.value.toUpperCase() })} pattern="^#[0-9A-Fa-f]{6}$" placeholder="#D94149" value={selected.swatchColor ?? ""} />
                    </Field>
                  ) : null}
                </div>
              </details>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
            <div className="flex flex-wrap gap-2">
              <button className="min-h-10 rounded-md border border-border px-3 text-sm font-semibold hover:border-primary" onClick={() => onManageProducts(selected.id)} type="button">
                Products ({productCountByCategory[selected.id] ?? 0})
              </button>
              <button
                className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold text-red hover:bg-red/5 disabled:cursor-not-allowed disabled:opacity-35"
                disabled={selectedChildren.length > 0}
                onClick={() => {
                  if (onRemove()) setEditOpen(false);
                }}
                title={selectedChildren.length ? "Remove subcategories first" : undefined}
                type="button"
              >
                <Trash2 className="mr-2" size={15} />
                Delete
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button aria-label="Move up" className="grid h-10 w-10 place-items-center rounded-md border border-border disabled:opacity-30" disabled={selectedIndex <= 0} onClick={() => onMove("up")} type="button"><ArrowUp size={16} /></button>
              <button aria-label="Move down" className="grid h-10 w-10 place-items-center rounded-md border border-border disabled:opacity-30" disabled={selectedIndex < 0 || selectedIndex >= selectedSiblings.length - 1} onClick={() => onMove("down")} type="button"><ArrowDown size={16} /></button>
              <button className="min-h-10 rounded-md bg-primary px-4 text-sm font-semibold text-white" onClick={() => setEditOpen(false)} type="button">Done</button>
            </div>
          </div>
        </EditorModal>
      ) : null}
    </section>
  );
}

function CategoryTreeItem({
  categories,
  category,
  depth,
  expandedCategoryIds,
  onEdit,
  onToggle
}: {
  categories: WebsiteCategory[];
  category: WebsiteCategory;
  depth: number;
  expandedCategoryIds: string[];
  onEdit: (categoryId: string) => void;
  onToggle: (categoryId: string) => void;
}) {
  const children = categories
    .filter((candidate) => candidate.parentId === category.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const hasChildren = children.length > 0;
  const expanded = expandedCategoryIds.includes(category.id);

  return (
    <li role="none">
      <div className="flex min-h-12 items-center">
        <button
          aria-expanded={hasChildren ? expanded : undefined}
          aria-level={depth}
          aria-selected={false}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 text-left hover:bg-surface-muted"
          onClick={() => hasChildren ? onToggle(category.id) : onEdit(category.id)}
          role="treeitem"
          type="button"
        >
          {hasChildren ? <ChevronRight className={expanded ? "rotate-90 transition-transform" : "transition-transform"} size={16} /> : <span className="w-4" />}
          <span aria-hidden="true" className={category.visible ? "h-2 w-2 shrink-0 rounded-full bg-green" : "h-2 w-2 shrink-0 rounded-full bg-border"} />
          <span className="truncate text-sm font-semibold">{category.name}</span>
        </button>
        <button aria-label={"Edit " + category.name} className="mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-md text-secondary hover:bg-surface-muted hover:text-primary" onClick={() => onEdit(category.id)} type="button">
          <PencilLine size={15} />
        </button>
      </div>
      {hasChildren && expanded ? (
        <ul className="ml-6 divide-y divide-border border-l border-t border-border" role="group">
          {children.map((child) => (
            <CategoryTreeItem
              categories={categories}
              category={child}
              depth={depth + 1}
              expandedCategoryIds={expandedCategoryIds}
              key={child.id}
              onEdit={onEdit}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function EditorModal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-black/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section aria-label={title} aria-modal="true" className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-lg bg-surface shadow-2xl" role="dialog">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-display text-xl font-semibold">{title}</h3>
          <button aria-label="Close" className="grid h-9 w-9 place-items-center rounded-md text-secondary hover:bg-surface-muted hover:text-primary" onClick={onClose} type="button"><X size={17} /></button>
        </header>
        {children}
      </section>
    </div>
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
  const [createOpen, setCreateOpen] = useState(holidays.length === 0);

  return (
    <section className="overflow-hidden rounded-md border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="font-display text-xl font-semibold">Holidays</h3>
          <p className="text-xs text-secondary">{holidays.length} total · {holidays.filter((holiday) => holiday.visible).length} visible</p>
        </div>
        <button aria-expanded={createOpen} className="inline-flex min-h-10 items-center rounded-md border border-border bg-surface px-3 text-sm font-semibold hover:border-primary" onClick={() => setCreateOpen((current) => !current)} type="button"><Plus className="mr-2" size={16} />New holiday</button>
      </header>

      {createOpen ? (
        <div className="border-b border-border bg-surface-muted">
        <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2 xl:grid-cols-5">
          <input className={inputClassName} maxLength={80} onChange={(event) => onNameChange(event.target.value)} placeholder="Name" value={newName} />
          <input className={inputClassName} maxLength={240} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="Description" value={newDescription} />
          <input aria-label="Holiday starts" className={inputClassName} onChange={(event) => onStartDateChange(event.target.value)} type="date" value={startDate} />
          <input aria-label="Holiday ends" className={inputClassName} onChange={(event) => onEndDateChange(event.target.value)} type="date" value={endDate} />
          <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white disabled:opacity-40" disabled={disabled || !newName.trim() || !startDate || !endDate || startDate > endDate} onClick={() => { onAdd(); setCreateOpen(false); }} type="button">Create holiday</button>
        </div>
        </div>
      ) : null}

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

const inputClassName = "admin-form-control w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary";

function ModuleLaunchCard({ action, body, onClick, title }: { action: string; body: string; onClick: () => void; title: string }) {
  return <button className="admin-publishing-module" onClick={onClick} type="button"><span><span className="admin-publishing-module-title">{title}</span><span className="admin-publishing-module-note">{body}</span></span><span className="admin-publishing-module-action">{action}<ChevronRight size={15} /></span></button>;
}

function PublishingSectionButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={`min-h-10 border-b-2 px-3 text-sm font-semibold transition-colors ${active ? "border-primary text-primary" : "border-transparent text-secondary hover:border-border hover:text-primary"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Metric({ emphasis = false, label, value }: { emphasis?: boolean; label: string; value: number }) { return <div className="admin-publishing-metric"><p className="admin-publishing-metric-label">{label}</p><p className={emphasis ? "admin-publishing-metric-value text-red" : "admin-publishing-metric-value"}>{value.toLocaleString()}</p></div>; }
function Field({ children, className, label }: { children: ReactNode; className?: string; label: string }) { return <label className={className}><span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-secondary">{label}</span>{children}</label>; }
function SearchableField({ children, className, label }: { children: ReactNode; className?: string; label: string }) { return <div className={className}><p className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-secondary">{label}</p>{children}</div>; }
function formatProductCount(value: number) { return `${value.toLocaleString()} ${value === 1 ? "product" : "products"}`; }
function formatCategoryKind(kind: string) {
  if (kind === "party-group") return "Party group";
  if (kind === "party-theme") return "Party theme";
  if (kind === "party-product-type") return "Party product type";
  if (kind === "party-solid-color") return "Party solid color";
  return "Standard category";
}
function subscribeToCatalogHashChange(callback: () => void) { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); }
function readCatalogPublishingHash() { return window.location.hash || "#overview"; }
function navigateCatalogPublishing(module: "overview" | "structure-brands" | "structure-categories" | "structure-holidays" | "structure-party" | "products" | "bulk") { window.location.hash = module; }
function resolveCatalogPublishingModule(hash: string): { activeModule: WorkspaceModule; structureModule: StructureModule } {
  if (hash === "#products") return { activeModule: "products", structureModule: "brands" };
  if (hash === "#bulk") return { activeModule: "bulk", structureModule: "brands" };
  if (hash === "#structure-categories") return { activeModule: "structure", structureModule: "categories" };
  if (hash === "#structure-holidays") return { activeModule: "structure", structureModule: "holidays" };
  if (hash === "#structure-party") return { activeModule: "structure", structureModule: "party" };
  if (hash === "#structure-brands" || hash === "#website-brands") return { activeModule: "structure", structureModule: "brands" };
  return { activeModule: "overview", structureModule: "brands" };
}
function normalizeCategorySiblingOrder(categories: WebsiteCategory[]) {
  const ordered = orderWebsiteCategories(categories);
  const nextPositionByParent = new Map<string | null, number>();
  return ordered.map((category) => {
    const sortOrder = nextPositionByParent.get(category.parentId) ?? 0;
    nextPositionByParent.set(category.parentId, sortOrder + 1);
    return { ...category, sortOrder };
  });
}
function websiteCategorySubtreeHeight(category: WebsiteCategory, categories: WebsiteCategory[]) {
  const baseDepth = websiteCategoryDepth(category, categories);
  let height = 1;
  for (const descendantId of websiteCategoryDescendantIds(category.id, categories)) {
    const descendant = categories.find((candidate) => candidate.id === descendantId);
    if (!descendant) continue;
    const descendantDepth = websiteCategoryDepth(descendant, categories);
    if (Number.isFinite(descendantDepth) && Number.isFinite(baseDepth)) height = Math.max(height, descendantDepth - baseDepth + 1);
  }
  return height;
}
function uniqueSlug(name: string, usedSlugs: string[]) { const base = slugifyWebsiteCategory(name) || "collection"; if (!usedSlugs.includes(base)) return base; let suffix = 2; while (usedSlugs.includes(`${base}-${suffix}`)) suffix += 1; return `${base}-${suffix}`; }
function placementIssues(placement: WebsiteProductPlacement, categories: WebsiteCategory[], holidays: WebsiteHoliday[]) {
  return websitePlacementReadinessIssues(placement, categories, holidays);
}
async function uploadAdminImage(file: File, context: string) {
  if (!file.type.startsWith("image/")) throw new Error("Upload must be an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Upload must be 5 MB or smaller.");
  const formData = new FormData();
  formData.append("file", file);
  formData.append("context", context);
  const response = await fetch("/api/admin/media", { method: "POST", body: formData });
  const result = (await response.json()) as { ok?: boolean; asset?: { url: string; originalName: string }; errors?: string[] };
  if (!response.ok || !result.ok || !result.asset?.url) throw new Error(result.errors?.join(" ") || "Image upload failed.");
  return result.asset;
}
