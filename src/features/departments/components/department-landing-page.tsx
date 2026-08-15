/**
 * Composes a data-backed department landing page without demo fallbacks.
 */

import Link from "next/link";
import { ProductCard } from "@/components/commerce/product-card";
import { ShopFilterPanel, type ShopBrandFilter, type ShopCategoryFilter, type ShopPriceFilter } from "@/components/commerce/shop-filter-panel";
import type { DepartmentConfig } from "@/config/departments.config";
import {
  productAgeGroupIds,
  type FulfillmentMode,
  type ProductAgeGroup,
  type StorefrontProduct
} from "@/features/catalog/product-catalog";
import {
  filterWebsiteCatalogProducts,
  listVisibleWebsiteCategoriesWithImages,
  websiteCategoryDescendantIds,
  type ResolvedWebsiteCatalog
} from "@/features/catalog/services/website-merchandising-service";
import { isApprovedPersistentPartyAsset, partyCategoriesByKind } from "@/features/catalog/services/party-merchandising-service";
import { DepartmentCategoryRail } from "./department-category-rail";
import { DepartmentImageHero } from "./department-image-hero";
import { DepartmentProductShelf } from "./department-product-shelf";
import { DepartmentPromoActions, type DepartmentPromoAction } from "./department-promo-actions";
import { PartySolidCategoryShowcase } from "./party-solid-category-showcase";
import { PartySuppliesDiscovery } from "./party-supplies-discovery";

export type DepartmentLandingSearchParams = Record<string, string | string[] | undefined>;

type DepartmentLandingPageProps = {
  bestSellerProducts?: StorefrontProduct[];
  bestSellerSource?: "hybrid" | "manual" | "none" | "sales";
  catalog: ResolvedWebsiteCatalog | null;
  catalogAvailable: boolean;
  department: DepartmentConfig;
  searchParams?: DepartmentLandingSearchParams;
};

const pageSize = 20;
const fulfillmentModes: FulfillmentMode[] = ["pickup", "local-delivery", "shipping"];
const priceBandDefinitions = [
  { id: "under-25", label: "Under $25", maximum: 2_499 },
  { id: "25-50", label: "$25–$50", minimum: 2_500, maximum: 5_000 },
  { id: "over-50", label: "$50+", minimum: 5_001 }
] as const;

export function DepartmentLandingPage({ bestSellerProducts = [], bestSellerSource = "none", catalog, catalogAvailable, department, searchParams }: DepartmentLandingPageProps) {
  const basePath = `/${department.slug}`;
  const isPartySupplies = department.slug === "party-supplies";
  const rootCategory = catalog?.categories.find((category) => category.slug === department.slug);
  const descendantIds = rootCategory && catalog
    ? websiteCategoryDescendantIds(rootCategory.id, catalog.categories)
    : [];
  const allowedCategoryIds = new Set(rootCategory ? [rootCategory.id, ...descendantIds] : []);
  const departmentCategories = catalog?.categories.filter((category) => allowedCategoryIds.has(category.id) && category.id !== rootCategory?.id) ?? [];
  const selectedCategorySlug = paramValue(searchParams?.category);
  const selectedCategory = selectedCategorySlug
    ? departmentCategories.find((category) => category.slug === selectedCategorySlug)
    : undefined;
  const selectedBrandSlug = paramValue(searchParams?.brand);
  const selectedBrand = selectedBrandSlug
    ? catalog?.brands.find((brand) => brand.slug === selectedBrandSlug)
    : undefined;
  const selectedAge = validAgeGroup(paramValue(searchParams?.age));
  const selectedFulfillment = validFulfillmentMode(paramValue(searchParams?.fulfillment));
  const selectedPrice = validPriceBand(paramValue(searchParams?.price));
  const selectedSort = validSort(paramValue(searchParams?.sort));
  const selectedThemes = paramValues(searchParams?.theme);
  const selectedColors = paramValues(searchParams?.color);
  const selectedProductTypes = paramValues(searchParams?.type);
  const solidCollectionSelected = isPartySupplies && paramValue(searchParams?.collection) === "solids";
  const requestedPage = clampPage(paramValue(searchParams?.page));
  const rootProducts = catalog && rootCategory
    ? filterWebsiteCatalogProducts(catalog, { categoryId: rootCategory.id, surface: "shop" })
    : [];
  const categorySelectedProducts = catalog && rootCategory
    ? filterWebsiteCatalogProducts(catalog, {
        ageGroup: selectedAge,
        brandId: selectedBrand?.id,
        categoryId: isPartySupplies ? rootCategory.id : selectedCategory?.id ?? rootCategory.id,
        fulfillmentMode: selectedFulfillment,
        surface: "shop"
      })
    : [];
  const selectedProducts = isPartySupplies && catalog
    ? categorySelectedProducts.filter((product) => matchesPartyFacets(product.squareVariationId, catalog, selectedThemes, selectedColors, selectedProductTypes, solidCollectionSelected))
    : categorySelectedProducts;
  const priceFilteredProducts = selectedPrice
    ? selectedProducts.filter((product) => matchesPriceBand(product, selectedPrice))
    : selectedProducts;
  const sortedProducts = sortProducts(priceFilteredProducts, selectedSort);
  const visibleProducts = sortedProducts.slice(0, requestedPage * pageSize);
  const trendingProducts = catalog && rootCategory
    ? filterWebsiteCatalogProducts(catalog, { categoryId: rootCategory.id, surface: "new-and-trending" })
    : [];
  const categoriesForRail = catalog && !isPartySupplies
    ? listVisibleWebsiteCategoriesWithImages(catalog.categories, { parentSlug: department.slug })
    : [];
  const categoryFilters: ShopCategoryFilter[] = (isPartySupplies ? [] : departmentCategories).map((category) => ({
    id: category.id,
    name: category.name,
    parentId: category.parentId === rootCategory?.id ? null : category.parentId,
    productCount: catalog?.productVariationIdsByCategory[category.id]?.filter((variationId) => rootProducts.some((product) => product.squareVariationId === variationId)).length ?? 0,
    slug: category.slug
  }));
  const brandFilters: ShopBrandFilter[] = (catalog?.brands ?? [])
    .map((brand) => ({
      id: brand.id,
      name: brand.name,
      productCount: rootProducts.filter((product) => product.websiteBrandIds?.includes(brand.id)).length,
      slug: brand.slug
    }))
    .filter((brand) => brand.productCount > 0);
  const ageCounts = Object.fromEntries(productAgeGroupIds.map((age) => [age, rootProducts.filter((product) => product.ageGroups?.includes(age)).length]));
  const fulfillmentCounts = Object.fromEntries(fulfillmentModes.map((mode) => [mode, rootProducts.filter((product) => product.fulfillmentModes.includes(mode)).length]));
  const priceFilters: ShopPriceFilter[] = priceBandDefinitions.map((price) => ({
    id: price.id,
    label: price.label,
    productCount: rootProducts.filter((product) => matchesPriceBand(product, price.id)).length
  }));
  const partyDiscoveryCategories = catalog?.categories.filter((category) => category.kind === "party-theme" || category.kind === "party-solid-color" || category.kind === "party-product-type") ?? [];
  const hasPartyThemes = isPartySupplies && partyDiscoveryCategories.some((category) => category.kind === "party-theme" && category.visible && isApprovedPersistentPartyAsset(category.imageUrl) && (catalog?.productVariationIdsByCategory[category.id]?.length ?? 0) > 0);
  const promoActions = departmentPromoActions(department.slug, basePath, hasPartyThemes);
  const showDepartmentDiscovery = department.slug !== "toys";
  const activeFilters = [
    ...activeFilterLinks({
      basePath,
      params: searchParams,
      selectedAge,
      selectedBrandName: selectedBrand?.name,
      selectedCategoryName: selectedCategory?.name,
      selectedFulfillment,
      selectedPrice
    }),
    ...(isPartySupplies && catalog ? partyActiveFilterLinks(basePath, searchParams, catalog, selectedThemes, selectedColors, selectedProductTypes, solidCollectionSelected) : [])
  ];

  return (
    <main className="bg-surface" data-department={department.slug}>
      {showDepartmentDiscovery ? (
        <>
          <DepartmentImageHero
            desktopImage={department.hero_image_url}
            mobileImage={department.mobile_hero_image_url}
            title={department.title_en}
            variant={isPartySupplies ? "contained-color" : "full-bleed"}
          />
          <DepartmentPromoActions actions={promoActions} label={`${department.title_en} shortcuts`} variant={isPartySupplies ? "contained" : "full-bleed"} />
          {isPartySupplies ? <PartySolidCategoryShowcase /> : null}
          {isPartySupplies && catalog ? <PartySuppliesDiscovery basePath={basePath} categories={catalog.categories} currentParams={searchParams} productCountByCategory={Object.fromEntries(catalog.categories.map((category) => [category.id, catalog.productVariationIdsByCategory[category.id]?.length ?? 0]))} selectedColors={selectedColors} selectedProductTypes={selectedProductTypes} selectedThemes={selectedThemes} /> : <DepartmentCategoryRail basePath={basePath} categories={categoriesForRail} title="Shop by category" />}
        </>
      ) : null}

      <div id="new-and-trending">
        <DepartmentProductShelf products={trendingProducts} title="New & Trending" />
      </div>

      <DepartmentProductShelf products={bestSellerProducts} title={bestSellerSource === "manual" ? "Popular Picks" : "Best Sellers"} />

      <section aria-labelledby="department-catalog-title" className="bg-surface py-10 sm:py-14" id="catalog">
        <div className={isPartySupplies ? "mx-auto w-[calc(100%_-_2rem)] max-w-[1120px] md:w-[84%]" : "mx-auto w-[calc(100%_-_2rem)] max-w-[1720px]"}>
          <div className="mb-8 max-w-3xl">
            <h2 className={`font-display font-black tracking-tight text-primary ${isPartySupplies ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"}`} id="department-catalog-title">
              {isPartySupplies ? partyCatalogTitle(catalog, selectedThemes, selectedColors, selectedProductTypes, solidCollectionSelected) : selectedCategory?.name ?? `Shop all ${department.title_en.toLowerCase()}`}
            </h2>
          </div>

          <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
            <ShopFilterPanel
              ageCounts={ageCounts}
              basePath={basePath}
              brands={brandFilters}
              categories={categoryFilters}
              categoryParam="category"
              fulfillmentCounts={fulfillmentCounts}
              priceFilters={priceFilters}
              selectedAge={selectedAge}
              selectedBrand={selectedBrandSlug}
              selectedCategory={selectedCategorySlug}
              selectedFulfillment={selectedFulfillment}
              selectedPrice={selectedPrice}
              selectedSort={selectedSort}
            />

            <div className="min-w-0">
              <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <p className="font-black text-primary">{sortedProducts.length} {sortedProducts.length === 1 ? "product" : "products"}</p>
                {activeFilters.length > 0 ? (
                  <div aria-label="Active filters" className="flex flex-wrap gap-2">
                    {activeFilters.map((filter) => (
                      <Link className="inline-flex min-h-9 items-center rounded-pill border border-blue/25 bg-cyan px-3 py-1 text-xs font-bold text-primary transition hover:border-blue" href={`${filter.href}#catalog`} key={filter.key}>
                        {filter.label} ×
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>

              {visibleProducts.length > 0 ? (
                <>
                  <div className="department-product-grid storefront-product-grid grid gap-4">
                    {visibleProducts.map((product) => <ProductCard key={product.squareVariationId} product={product} variant="premium" />)}
                  </div>
                  {visibleProducts.length < sortedProducts.length ? (
                    <div className="mt-10 flex justify-center">
                      <Link className="inline-flex min-h-11 items-center justify-center rounded-pill border border-navy px-6 py-3 text-sm font-black text-navy transition hover:bg-navy hover:text-white" href={departmentHref(basePath, searchParams, { page: String(requestedPage + 1) }) + "#catalog"}>
                        Load more products
                      </Link>
                    </div>
                  ) : null}
                </>
              ) : (
                <DepartmentEmptyState basePath={basePath} catalogAvailable={catalogAvailable} departmentTitle={department.title_en} filtered={activeFilters.length > 0} />
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function DepartmentEmptyState({ basePath, catalogAvailable, departmentTitle, filtered }: { basePath: string; catalogAvailable: boolean; departmentTitle: string; filtered: boolean }) {
  const title = !catalogAvailable
    ? "The catalog is temporarily unavailable."
    : filtered
      ? "No products match these filters."
      : `No ${departmentTitle.toLowerCase()} products are published yet.`;
  const body = !catalogAvailable
    ? "Please try again shortly. Cart and checkout data remain unchanged."
    : filtered
      ? "Clear the active filters to see the complete published department."
      : "Products will appear here after they are assigned and published through Admin.";

  return (
    <div className="rounded-md border border-dashed border-border bg-surface-muted px-6 py-12 text-center">
      <h3 className="font-display text-2xl font-black text-primary">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm text-secondary">{body}</p>
      {filtered ? <Link className="mt-6 inline-flex min-h-11 items-center rounded-pill bg-navy px-6 py-3 text-sm font-black text-white" href={`${basePath}#catalog`}>Clear filters</Link> : <Link className="mt-6 inline-flex min-h-11 items-center rounded-pill bg-navy px-6 py-3 text-sm font-black text-white" href="/shop">Shop all products</Link>}
    </div>
  );
}

function departmentPromoActions(slug: string, basePath: string, hasPartyThemes = false): DepartmentPromoAction[] {
  if (slug === "party-supplies") {
    return [
      { href: `${basePath}#catalog`, label: "Shop all party", tone: "blue" },
      { href: `${basePath}${hasPartyThemes ? "#shop-by-theme" : "#catalog"}`, label: "Shop by theme", tone: "gold" },
      { href: `${basePath}#new-and-trending`, label: "Party trending", tone: "red" }
    ];
  }

  return [
    { href: `${basePath}#catalog`, label: "Shop all toys", tone: "blue" },
    { href: `${basePath}#shop-by-age`, label: "Shop by age", tone: "gold" },
    { href: `${basePath}#new-and-trending`, label: "New & trending", tone: "red" }
  ];
}

function activeFilterLinks({
  basePath,
  params,
  selectedAge,
  selectedBrandName,
  selectedCategoryName,
  selectedFulfillment,
  selectedPrice
}: {
  basePath: string;
  params?: DepartmentLandingSearchParams;
  selectedAge?: ProductAgeGroup;
  selectedBrandName?: string;
  selectedCategoryName?: string;
  selectedFulfillment?: FulfillmentMode;
  selectedPrice?: string;
}) {
  return [
    selectedCategoryName ? { key: "category", label: selectedCategoryName, href: departmentHref(basePath, params, { category: undefined, page: undefined }) } : null,
    selectedBrandName ? { key: "brand", label: selectedBrandName, href: departmentHref(basePath, params, { brand: undefined, page: undefined }) } : null,
    selectedAge ? { key: "age", label: `Age ${selectedAge}`, href: departmentHref(basePath, params, { age: undefined, page: undefined }) } : null,
    selectedFulfillment ? { key: "fulfillment", label: fulfillmentLabel(selectedFulfillment), href: departmentHref(basePath, params, { fulfillment: undefined, page: undefined }) } : null,
    selectedPrice ? { key: "price", label: priceBandDefinitions.find((price) => price.id === selectedPrice)?.label ?? selectedPrice, href: departmentHref(basePath, params, { page: undefined, price: undefined }) } : null
  ].filter((filter): filter is { key: string; label: string; href: string } => Boolean(filter));
}

function departmentHref(basePath: string, current: DepartmentLandingSearchParams | undefined, patch: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current ?? {})) {
    for (const normalized of paramValues(value)) params.append(key, normalized);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function matchesPartyFacets(variationId: string, catalog: ResolvedWebsiteCatalog, selectedThemes: string[], selectedColors: string[], selectedProductTypes: string[], solidCollectionSelected: boolean) {
  const solidCategoryIds = partyCategoriesByKind(catalog.categories, "party-solid-color").map((category) => category.id);
  const matchesSolidCollection = !solidCollectionSelected || (solidCategoryIds.length > 0 && solidCategoryIds.some((categoryId) => catalog.productVariationIdsByCategory[categoryId]?.includes(variationId)));
  return matchesSolidCollection
    && matchesPartyFacet(variationId, catalog, "party-theme", selectedThemes)
    && matchesPartyFacet(variationId, catalog, "party-solid-color", selectedColors)
    && matchesPartyFacet(variationId, catalog, "party-product-type", selectedProductTypes);
}

function matchesPartyFacet(variationId: string, catalog: ResolvedWebsiteCatalog, kind: "party-theme" | "party-solid-color" | "party-product-type", selectedSlugs: string[]) {
  if (selectedSlugs.length === 0) return true;
  const selectedCategoryIds = partyCategoriesByKind(catalog.categories, kind)
    .filter((category) => selectedSlugs.includes(category.slug))
    .map((category) => category.id);
  if (selectedCategoryIds.length === 0) return true;
  return selectedCategoryIds.some((categoryId) => catalog.productVariationIdsByCategory[categoryId]?.includes(variationId));
}

function partyActiveFilterLinks(basePath: string, params: DepartmentLandingSearchParams | undefined, catalog: ResolvedWebsiteCatalog, selectedThemes: string[], selectedColors: string[], selectedProductTypes: string[], solidCollectionSelected: boolean) {
  const definitions: Array<{ key: "theme" | "color" | "type"; values: string[]; kind: "party-theme" | "party-solid-color" | "party-product-type" }> = [
    { key: "theme", values: selectedThemes, kind: "party-theme" },
    { key: "color", values: selectedColors, kind: "party-solid-color" },
    { key: "type", values: selectedProductTypes, kind: "party-product-type" }
  ];
  const facetFilters = definitions.flatMap((definition) => definition.values.flatMap((slug) => {
    const category = partyCategoriesByKind(catalog.categories, definition.kind).find((candidate) => candidate.slug === slug);
    return category ? [{
      key: `${definition.key}-${slug}`,
      label: category.name,
      href: removePartyFacetHref(basePath, params, definition.key, slug)
    }] : [];
  }));
  return [
    ...(solidCollectionSelected ? [{ key: "collection-solids", label: "Solid colors", href: departmentHref(basePath, params, { collection: undefined, page: undefined }) }] : []),
    ...facetFilters
  ];
}

function removePartyFacetHref(basePath: string, current: DepartmentLandingSearchParams | undefined, key: "theme" | "color" | "type", value: string) {
  const params = new URLSearchParams();
  for (const [paramKey, paramValue] of Object.entries(current ?? {})) {
    if (paramKey === "page" || paramValue === undefined) continue;
    for (const normalized of paramValues(paramValue)) {
      if (paramKey !== key || normalized !== value) params.append(paramKey, normalized);
    }
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function partyCatalogTitle(catalog: ResolvedWebsiteCatalog | null, selectedThemes: string[], selectedColors: string[], selectedProductTypes: string[], solidCollectionSelected: boolean) {
  if (!catalog || selectedThemes.length + selectedColors.length + selectedProductTypes.length === 0) return solidCollectionSelected ? "Shop all solid party supplies" : "Shop all party supplies";
  const themeNames = partyCategoriesByKind(catalog.categories, "party-theme").filter((category) => selectedThemes.includes(category.slug)).map((category) => category.name);
  const colorNames = partyCategoriesByKind(catalog.categories, "party-solid-color").filter((category) => selectedColors.includes(category.slug)).map((category) => category.name);
  const typeNames = partyCategoriesByKind(catalog.categories, "party-product-type").filter((category) => selectedProductTypes.includes(category.slug)).map((category) => category.name);
  if (themeNames.length === 1 && typeNames.length === 1 && colorNames.length === 0) return `${themeNames[0]} ${typeNames[0]}`;
  if (themeNames.length === 0 && colorNames.length === 1 && typeNames.length === 1) return `${colorNames[0]} solid ${typeNames[0]}`;
  if (solidCollectionSelected && themeNames.length === 0 && colorNames.length === 0 && typeNames.length === 1) return `Solid ${typeNames[0]}`;
  if (themeNames.length === 1 && colorNames.length === 0 && typeNames.length === 0) return `${themeNames[0]} party supplies`;
  if (themeNames.length === 0 && colorNames.length === 1 && typeNames.length === 0) return `${colorNames[0]} solid tableware`;
  if (themeNames.length === 0 && colorNames.length === 0 && typeNames.length === 1) return typeNames[0];
  return "Selected party supplies";
}

function matchesPriceBand(product: StorefrontProduct, priceBand: string) {
  if (product.priceAvailable === false) return false;
  const definition = priceBandDefinitions.find((price) => price.id === priceBand);
  if (!definition) return true;
  if ("minimum" in definition && product.priceCents < definition.minimum) return false;
  if ("maximum" in definition && product.priceCents > definition.maximum) return false;
  return true;
}

function sortProducts(products: StorefrontProduct[], sort: string) {
  if (sort === "price-low") return [...products].sort((first, second) => first.priceCents - second.priceCents);
  if (sort === "price-high") return [...products].sort((first, second) => second.priceCents - first.priceCents);
  return products;
}

function validAgeGroup(value?: string): ProductAgeGroup | undefined {
  return productAgeGroupIds.includes(value as ProductAgeGroup) ? value as ProductAgeGroup : undefined;
}

function validFulfillmentMode(value?: string): FulfillmentMode | undefined {
  return fulfillmentModes.includes(value as FulfillmentMode) ? value as FulfillmentMode : undefined;
}

function validPriceBand(value?: string) {
  return priceBandDefinitions.some((price) => price.id === value) ? value : undefined;
}

function validSort(value?: string) {
  return value === "price-low" || value === "price-high" ? value : "featured";
}

function clampPage(value?: string) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) ? Math.min(50, Math.max(1, page)) : 1;
}

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function paramValues(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(values.flatMap((current) => current.split(",")).map((current) => current.trim()).filter(Boolean))).slice(0, 20);
}

function fulfillmentLabel(mode: FulfillmentMode) {
  if (mode === "local-delivery") return "Local delivery";
  return mode === "shipping" ? "Shipping" : "Pickup";
}
