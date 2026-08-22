/**
 * Implements the website merchandising service workflow for the catalog feature.
 */

import {
  productAgeGroupIds,
  type FulfillmentMode,
  type ProductAgeGroup,
  type StorefrontProduct
} from "@/features/catalog/product-catalog";

export const websiteSurfaceIds = ["shop", "homepage", "new-and-trending", "search", "category-pages", "holiday-pages"] as const;
export const websiteCategoryKindIds = ["standard", "party-group", "party-theme", "party-product-type", "party-solid-color"] as const;
export const MAX_WEBSITE_CATEGORY_DEPTH = 4;

export const websiteSurfaceOptions = [
  { id: "shop", label: "Shop catalog" },
  { id: "homepage", label: "Homepage" },
  { id: "new-and-trending", label: "New & Trending carousel" },
  { id: "search", label: "Search results" },
  { id: "category-pages", label: "Category pages" },
  { id: "holiday-pages", label: "Holiday pages" }
] as const;

export type WebsiteSurface = (typeof websiteSurfaceIds)[number];
export type WebsiteCategoryKind = (typeof websiteCategoryKindIds)[number];

export type WebsiteCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  parentId: string | null;
  visible: boolean;
  sortOrder: number;
  kind?: WebsiteCategoryKind;
  recommendationTerms?: string[];
  swatchColor?: string;
};

export type WebsiteCategoryImageOptions = {
  parentSlug?: string;
};

export type WebsiteBrand = {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl: string;
  imageAlt: string;
  squareVendorIds: string[];
  visible: boolean;
  featuredOnHomepage: boolean;
  sortOrder: number;
};

export type WebsiteHoliday = {
  id: string;
  name: string;
  slug: string;
  description: string;
  startDate: string;
  endDate: string;
  visible: boolean;
  sortOrder: number;
};

export type WebsiteHolidayAssignment = {
  holidayId: string;
  startsAt: string;
  endsAt: string;
};

export type WebsiteProductContent = {
  displayName: string;
  slug: string;
  shortDescription: string;
  description: string;
  badge: string;
  imageUrl: string;
  imageAlt: string;
  seoTitle: string;
  seoDescription: string;
};

export type WebsiteProductPlacement = {
  squareVariationId: string;
  categoryIds: string[];
  brandIds: string[];
  holidayAssignments: WebsiteHolidayAssignment[];
  ageGroups: ProductAgeGroup[];
  fulfillmentModes: FulfillmentMode[];
  surfaceIds: WebsiteSurface[];
  visible: boolean;
  sortOrder: number;
  content?: WebsiteProductContent;
};

export type WebsiteMerchandisingConfig = {
  version: 3;
  navigationCategorySeedVersion?: number;
  updatedAt: string;
  categories: WebsiteCategory[];
  brands: WebsiteBrand[];
  holidays: WebsiteHoliday[];
  placements: WebsiteProductPlacement[];
};

export type ResolvedWebsiteCatalog = {
  categories: WebsiteCategory[];
  brands: WebsiteBrand[];
  holidays: WebsiteHoliday[];
  products: StorefrontProduct[];
  productVariationIdsByCategory: Record<string, string[]>;
  productVariationIdsByBrand: Record<string, string[]>;
  productVariationIdsByHoliday: Record<string, string[]>;
  productVariationIdsBySurface: Record<WebsiteSurface, string[]>;
};

export function createDefaultWebsiteMerchandising(products: StorefrontProduct[], updatedAt = new Date().toISOString()): WebsiteMerchandisingConfig {
  return {
    version: 3,
    navigationCategorySeedVersion: 0,
    updatedAt,
    categories: [],
    brands: [],
    holidays: [],
    placements: products.map(createPendingPlacement)
  };
}

export function createEmptyWebsiteProductContent(): WebsiteProductContent {
  return {
    displayName: "",
    slug: "",
    shortDescription: "",
    description: "",
    badge: "",
    imageUrl: "",
    imageAlt: "",
    seoTitle: "",
    seoDescription: ""
  };
}

export function normalizeWebsiteProductContent(content?: Partial<WebsiteProductContent> | null): WebsiteProductContent {
  const fallback = createEmptyWebsiteProductContent();

  return Object.fromEntries(
    Object.keys(fallback).map((key) => [key, content?.[key as keyof WebsiteProductContent]?.trim() ?? ""])
  ) as WebsiteProductContent;
}

export function applyWebsiteProductContent(
  product: StorefrontProduct,
  content?: Partial<WebsiteProductContent> | null
): StorefrontProduct {
  const normalized = normalizeWebsiteProductContent(content);
  const name = normalized.displayName || product.name;

  return {
    ...product,
    name,
    slug: normalized.slug || product.slug,
    shortDescription: normalized.shortDescription || product.shortDescription,
    description: normalized.description || product.description,
    badge: normalized.badge || product.badge,
    imageUrl: normalized.imageUrl || product.imageUrl,
    imageAlt: normalized.imageAlt || product.imageAlt || name,
    seoTitle: normalized.seoTitle || product.seoTitle,
    seoDescription: normalized.seoDescription || product.seoDescription
  };
}

export function reconcileWebsiteMerchandising(
  config: WebsiteMerchandisingConfig,
  products: StorefrontProduct[],
  updatedAt = config.updatedAt
): WebsiteMerchandisingConfig {
  const knownProductIds = new Set(products.map((product) => product.squareVariationId));
  const knownCategoryIds = new Set(config.categories.map((category) => category.id));
  const knownBrandIds = new Set(config.brands.map((brand) => brand.id));
  const knownHolidayIds = new Set(config.holidays.map((holiday) => holiday.id));
  const placementsByProduct = new Map(config.placements.map((placement) => [placement.squareVariationId, placement]));
  const categories = orderWebsiteCategories([...config.categories]
    .map((category, index) => ({
      ...category,
      name: category.name.trim(),
      slug: slugifyWebsiteCategory(category.slug || category.name) || `category-${index + 1}`,
      description: category.description.trim(),
      imageUrl: category.imageUrl.trim(),
      imageAlt: category.imageAlt.trim() || (category.imageUrl.trim() ? category.name.trim() : ""),
      parentId: category.parentId ?? null,
      sortOrder: Number.isFinite(category.sortOrder) ? category.sortOrder : index,
      kind: normalizeWebsiteCategoryKind(category.kind),
      recommendationTerms: Array.from(new Set((category.recommendationTerms ?? []).map((term) => term.trim()).filter(Boolean))).slice(0, 20),
      swatchColor: normalizeSwatchColor(category.swatchColor)
    })));

  return {
    version: 3,
    navigationCategorySeedVersion: config.navigationCategorySeedVersion,
    updatedAt,
    categories,
    brands: [...config.brands]
      .map((brand, index) => ({
        ...brand,
        name: brand.name.trim(),
        slug: slugifyWebsiteCategory(brand.slug || brand.name) || `brand-${index + 1}`,
        description: brand.description.trim(),
        logoUrl: brand.logoUrl.trim(),
        imageAlt: brand.imageAlt.trim() || `${brand.name.trim()} logo`,
        squareVendorIds: Array.from(new Set(brand.squareVendorIds.map((id) => id.trim()).filter(Boolean))),
        sortOrder: Number.isFinite(brand.sortOrder) ? brand.sortOrder : index
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    holidays: [...config.holidays]
      .map((holiday, index) => ({
        ...holiday,
        name: holiday.name.trim(),
        slug: slugifyWebsiteCategory(holiday.slug || holiday.name) || `holiday-${index + 1}`,
        description: holiday.description.trim(),
        sortOrder: Number.isFinite(holiday.sortOrder) ? holiday.sortOrder : index
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.startDate.localeCompare(b.startDate)),
    placements: [
      ...config.placements
        .filter((placement) => knownProductIds.has(placement.squareVariationId))
        .map((placement) => {
          const categoryIds = Array.from(new Set(placement.categoryIds.filter((categoryId) => knownCategoryIds.has(categoryId))));
          return {
            ...placement,
            categoryIds,
            brandIds: Array.from(new Set(placement.brandIds.filter((brandId) => knownBrandIds.has(brandId)))),
            holidayAssignments: placement.holidayAssignments.filter((assignment) => knownHolidayIds.has(assignment.holidayId)),
            ageGroups: Array.from(new Set(placement.ageGroups.filter(isProductAgeGroup))),
            fulfillmentModes: isBalloonWebsitePlacement({ ...placement, categoryIds }, categories)
              ? ["pickup" as const, "local-delivery" as const]
              : Array.from(new Set(placement.fulfillmentModes.filter(isFulfillmentMode))),
            surfaceIds: Array.from(new Set(placement.surfaceIds.filter(isWebsiteSurface))),
            content: normalizeWebsiteProductContent(placement.content)
          };
        }),
      ...products
        .filter((product) => !placementsByProduct.has(product.squareVariationId))
        .map(createPendingPlacement)
    ]
  };
}

export function resolveWebsiteCatalog(
  products: StorefrontProduct[],
  config: WebsiteMerchandisingConfig,
  currentDate = new Date()
): ResolvedWebsiteCatalog {
  const configuredCategoryById = new Map(config.categories.map((category) => [category.id, category]));
  const categories = orderWebsiteCategories(config.categories.filter((category) => {
    const path = websiteCategoryPathFromMap(category, configuredCategoryById);
    return path.length > 0 && path.every((pathCategory) => pathCategory.visible);
  }));
  const brands = config.brands.filter((brand) => brand.visible).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const today = currentDate.toISOString().slice(0, 10);
  const holidays = config.holidays
    .filter((holiday) => holiday.visible && holiday.startDate <= today && holiday.endDate >= today)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.startDate.localeCompare(b.startDate));
  const visibleCategoryIds = new Set(categories.map((category) => category.id));
  const visibleBrandIds = new Set(brands.map((brand) => brand.id));
  const visibleHolidayIds = new Set(holidays.map((holiday) => holiday.id));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const productById = new Map(products.map((product) => [product.squareVariationId, product]));
  const productVariationIdsByCategory: Record<string, string[]> = Object.fromEntries(categories.map((category) => [category.id, []]));
  const productVariationIdsByBrand: Record<string, string[]> = Object.fromEntries(brands.map((brand) => [brand.id, []]));
  const productVariationIdsByHoliday: Record<string, string[]> = Object.fromEntries(holidays.map((holiday) => [holiday.id, []]));
  const productVariationIdsBySurface: Record<WebsiteSurface, string[]> = {
    shop: [],
    homepage: [],
    "new-and-trending": [],
    search: [],
    "category-pages": [],
    "holiday-pages": []
  };
  const resolvedProducts: Array<{ product: StorefrontProduct; sortOrder: number }> = [];

  for (const placement of config.placements) {
    const sourceProduct = productById.get(placement.squareVariationId);

    if (!sourceProduct || !placement.visible || !isWebsitePlacementReady(placement)) {
      continue;
    }

    const product = applyWebsiteProductContent(sourceProduct, placement.content);

    const visibleCategoryIdsForProduct = placement.categoryIds.filter((categoryId) => visibleCategoryIds.has(categoryId));

    if (visibleCategoryIdsForProduct.length === 0) {
      continue;
    }

    const visibleCategorySlugsForProduct = Array.from(new Set(
      visibleCategoryIdsForProduct.flatMap((categoryId) => {
        const category = categoryById.get(categoryId);
        return category
          ? websiteCategoryPathFromMap(category, categoryById).map((pathCategory) => pathCategory.slug)
          : [];
      })
    ));
    const primaryCategory = visibleCategoryIdsForProduct
      .map((categoryId) => categoryById.get(categoryId))
      .filter((category): category is WebsiteCategory => Boolean(category))
      .sort((a, b) => websiteCategoryPathFromMap(b, categoryById).length - websiteCategoryPathFromMap(a, categoryById).length)[0];

    for (const categoryId of visibleCategoryIdsForProduct) {
      const category = categoryById.get(categoryId);
      if (!category) continue;
      for (const pathCategory of websiteCategoryPathFromMap(category, categoryById)) {
        productVariationIdsByCategory[pathCategory.id]?.push(product.squareVariationId);
      }
    }

    const visibleBrandIdsForProduct = placement.brandIds.filter((brandId) => visibleBrandIds.has(brandId));
    for (const brandId of visibleBrandIdsForProduct) {
      productVariationIdsByBrand[brandId]?.push(product.squareVariationId);
    }

    for (const assignment of placement.holidayAssignments) {
      if (visibleHolidayIds.has(assignment.holidayId) && assignment.startsAt <= today && assignment.endsAt >= today) {
        productVariationIdsByHoliday[assignment.holidayId]?.push(product.squareVariationId);
      }
    }

    for (const surfaceId of placement.surfaceIds) {
      productVariationIdsBySurface[surfaceId].push(product.squareVariationId);
    }

    resolvedProducts.push({
      product: {
        ...product,
        department: primaryCategory?.name ?? "Uncategorized",
        ageGroups: placement.ageGroups,
        fulfillmentModes: isBalloonWebsitePlacement(placement, categories) ? ["pickup", "local-delivery"] : placement.fulfillmentModes,
        websiteSurfaces: placement.surfaceIds,
        websiteBrandIds: visibleBrandIdsForProduct,
        websiteCategorySlugs: visibleCategorySlugsForProduct
      },
      sortOrder: placement.sortOrder
    });
  }

  for (const category of categories) {
    productVariationIdsByCategory[category.id] = Array.from(new Set(productVariationIdsByCategory[category.id] ?? []));
  }

  return {
    categories,
    brands,
    holidays,
    products: resolvedProducts.sort((a, b) => a.sortOrder - b.sortOrder).map(({ product }) => product),
    productVariationIdsByCategory,
    productVariationIdsByBrand,
    productVariationIdsByHoliday,
    productVariationIdsBySurface
  };
}

export function filterWebsiteCatalogProducts(
  catalog: ResolvedWebsiteCatalog,
  filters: { categoryId?: string; brandId?: string; holidayId?: string; ageGroup?: ProductAgeGroup; fulfillmentMode?: FulfillmentMode; surface?: WebsiteSurface }
) {
  const categoryProductIds = filters.categoryId ? new Set(catalog.productVariationIdsByCategory[filters.categoryId] ?? []) : null;
  const brandProductIds = filters.brandId ? new Set(catalog.productVariationIdsByBrand[filters.brandId] ?? []) : null;
  const holidayProductIds = filters.holidayId ? new Set(catalog.productVariationIdsByHoliday[filters.holidayId] ?? []) : null;
  const surfaceProductIds = filters.surface ? new Set(catalog.productVariationIdsBySurface[filters.surface] ?? []) : null;

  return catalog.products.filter((product) => {
    const matchesCategory = !categoryProductIds || categoryProductIds.has(product.squareVariationId);
    const matchesBrand = !brandProductIds || brandProductIds.has(product.squareVariationId);
    const matchesHoliday = !holidayProductIds || holidayProductIds.has(product.squareVariationId);
    const matchesSurface = !surfaceProductIds || surfaceProductIds.has(product.squareVariationId);
    const matchesAge = !filters.ageGroup || product.ageGroups?.includes(filters.ageGroup);
    const matchesFulfillment = !filters.fulfillmentMode || product.fulfillmentModes.includes(filters.fulfillmentMode);
    return matchesCategory && matchesBrand && matchesHoliday && matchesSurface && matchesAge && matchesFulfillment;
  });
}

export function websitePlacementIssues(placement: WebsiteProductPlacement) {
  const issues: string[] = [];

  if (placement.categoryIds.length === 0) {
    issues.push("Choose at least one website category.");
  }

  if (placement.surfaceIds.length === 0) {
    issues.push("Choose where the product appears on the website.");
  }

  if (placement.surfaceIds.includes("new-and-trending") && !placement.surfaceIds.includes("shop")) {
    issues.push("New & Trending products must also appear in the Shop catalog.");
  }

  if (placement.fulfillmentModes.length === 0) {
    issues.push("Choose at least one fulfillment method.");
  }

  if (placement.surfaceIds.includes("holiday-pages") && placement.holidayAssignments.length === 0) {
    issues.push("Assign a holiday schedule for Holiday pages.");
  }

  return issues;
}

export function websiteProductReadinessIssues(
  product: StorefrontProduct,
  placement: WebsiteProductPlacement,
  categories: WebsiteCategory[] = [],
  holidays: WebsiteHoliday[] = []
) {
  const issues = websitePlacementReadinessIssues(placement, categories, holidays);
  const resolved = applyWebsiteProductContent(product, placement.content);
  const content = normalizeWebsiteProductContent(placement.content);

  if (!resolved.name.trim()) issues.push("Add a customer-facing product title.");
  if (!resolved.shortDescription.trim() && !resolved.description.trim()) {
    issues.push("Add a product description.");
  }
  if (!resolved.imageUrl.trim() || resolved.imageUrl.endsWith("/images/product-fallback.svg")) {
    issues.push("Add a product image before publishing.");
  }
  if (content.imageUrl && !content.imageAlt) {
    issues.push("Add alt text for the website product image.");
  }

  return Array.from(new Set(issues));
}

export function websitePlacementReadinessIssues(
  placement: WebsiteProductPlacement,
  categories: WebsiteCategory[],
  holidays: WebsiteHoliday[]
) {
  const issues = websitePlacementIssues(placement);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const enabledCategoryIds = new Set(categories.filter((category) => {
    const path = websiteCategoryPathFromMap(category, categoryById);
    return path.length > 0 && path.every((pathCategory) => pathCategory.visible);
  }).map((category) => category.id));

  if (
    isBalloonWebsitePlacement(placement, categories) &&
    (
      placement.fulfillmentModes.length !== 2 ||
      !placement.fulfillmentModes.includes("pickup") ||
      !placement.fulfillmentModes.includes("local-delivery")
    )
  ) {
    issues.push("Balloon products are available for store pickup or local delivery only.");
  }

  if (!placement.categoryIds.some((categoryId) => enabledCategoryIds.has(categoryId))) {
    issues.push("Enable at least one assigned website category.");
  }

  for (const assignment of placement.holidayAssignments) {
    const holiday = holidays.find((currentHoliday) => currentHoliday.id === assignment.holidayId);
    if (!holiday || assignment.startsAt < holiday.startDate || assignment.endsAt > holiday.endDate || assignment.startsAt > assignment.endsAt) {
      issues.push("Keep each product holiday schedule within its campaign dates.");
    }
  }

  if (placement.surfaceIds.includes("holiday-pages")) {
    const enabledHolidayIds = new Set(holidays.filter((holiday) => holiday.visible).map((holiday) => holiday.id));
    if (!placement.holidayAssignments.some((assignment) => enabledHolidayIds.has(assignment.holidayId))) {
      issues.push("Enable at least one assigned holiday campaign.");
    }
  }

  return Array.from(new Set(issues));
}

export function isBalloonWebsitePlacement(
  placement: Pick<WebsiteProductPlacement, "categoryIds">,
  categories: WebsiteCategory[]
) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  return placement.categoryIds.some((categoryId) => {
    const category = categoryById.get(categoryId);
    return category ? websiteCategoryPathFromMap(category, categoryById).some(isBalloonFulfillmentCategory) : false;
  });
}

function isBalloonFulfillmentCategory(category: WebsiteCategory) {
  const slug = slugifyWebsiteCategory(category.slug || category.name);
  return slug === "balloons"
    || slug === "latex-balloons"
    || slug === "mylar-balloons"
    || slug === "balloon-add-ons"
    || slug.startsWith("balloon-");
}

export function isWebsitePlacementReady(placement: WebsiteProductPlacement) {
  return websitePlacementIssues(placement).length === 0;
}

export function slugifyWebsiteCategory(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function orderWebsiteCategories(categories: WebsiteCategory[]) {
  const byParentId = new Map<string | null, WebsiteCategory[]>();

  for (const category of categories) {
    const siblings = byParentId.get(category.parentId) ?? [];
    siblings.push(category);
    byParentId.set(category.parentId, siblings);
  }

  for (const siblings of byParentId.values()) {
    siblings.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  const ordered: WebsiteCategory[] = [];
  const visited = new Set<string>();
  const visit = (category: WebsiteCategory) => {
    if (visited.has(category.id)) return;
    visited.add(category.id);
    ordered.push(category);
    for (const child of byParentId.get(category.id) ?? []) visit(child);
  };

  for (const root of byParentId.get(null) ?? []) visit(root);
  for (const category of categories) visit(category);

  return ordered;
}

/**
 * Returns real, published website categories that are ready for an image-led
 * storefront surface such as the homepage category carousel.
 *
 * When `parentSlug` is supplied, only that category's direct children are
 * returned. Parent and ancestor visibility are honored so hidden structures
 * never leak into the storefront.
 */
export function listVisibleWebsiteCategoriesWithImages(
  categories: WebsiteCategory[],
  options: WebsiteCategoryImageOptions = {}
) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const parent = options.parentSlug
    ? categories.find((category) => category.slug === options.parentSlug)
    : null;

  if (options.parentSlug && !parent) return [];

  return orderWebsiteCategories(categories).filter((category) => {
    if (!category.imageUrl.trim()) return false;
    if (parent && category.parentId !== parent.id) return false;

    const path = websiteCategoryPathFromMap(category, categoryById);
    return path.length > 0 && path.every((pathCategory) => pathCategory.visible);
  });
}

export function websiteCategoryLabel(category: WebsiteCategory, categories: WebsiteCategory[]) {
  const path = websiteCategoryPath(category, categories);
  return path.length > 0 ? path.map((pathCategory) => pathCategory.name).join(" › ") : category.name;
}

export function websiteCategoryPath(category: WebsiteCategory, categories: WebsiteCategory[]) {
  return websiteCategoryPathFromMap(category, new Map(categories.map((candidate) => [candidate.id, candidate])));
}

export function websiteCategoryDepth(category: WebsiteCategory, categories: WebsiteCategory[]) {
  const path = websiteCategoryPath(category, categories);
  return path.length > 0 ? path.length : Number.POSITIVE_INFINITY;
}

export function websiteCategoryDescendantIds(categoryId: string, categories: WebsiteCategory[]) {
  const childrenByParentId = new Map<string, WebsiteCategory[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const children = childrenByParentId.get(category.parentId) ?? [];
    children.push(category);
    childrenByParentId.set(category.parentId, children);
  }

  const descendantIds: string[] = [];
  const visited = new Set([categoryId]);
  const visit = (parentId: string) => {
    for (const child of childrenByParentId.get(parentId) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      descendantIds.push(child.id);
      visit(child.id);
    }
  };
  visit(categoryId);
  return descendantIds;
}

function websiteCategoryPathFromMap(category: WebsiteCategory, categoryById: Map<string, WebsiteCategory>) {
  const path: WebsiteCategory[] = [];
  const visited = new Set<string>();
  let current: WebsiteCategory | undefined = category;

  while (current) {
    if (visited.has(current.id)) return [];
    visited.add(current.id);
    path.unshift(current);
    if (!current.parentId) return path;
    current = categoryById.get(current.parentId);
    if (!current) return [];
  }

  return [];
}

function createPendingPlacement(product: StorefrontProduct, index: number): WebsiteProductPlacement {
  return {
    squareVariationId: product.squareVariationId,
    categoryIds: [],
    brandIds: [],
    holidayAssignments: [],
    ageGroups: [],
    fulfillmentModes: [],
    surfaceIds: [],
    visible: false,
    sortOrder: index
  };
}

function isProductAgeGroup(value: string): value is ProductAgeGroup {
  return productAgeGroupIds.includes(value as ProductAgeGroup);
}

function normalizeWebsiteCategoryKind(value: WebsiteCategoryKind | undefined): WebsiteCategoryKind {
  return websiteCategoryKindIds.includes(value as WebsiteCategoryKind) ? value as WebsiteCategoryKind : "standard";
}

function normalizeSwatchColor(value: string | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : "";
}

function isFulfillmentMode(value: string): value is FulfillmentMode {
  return value === "pickup" || value === "local-delivery" || value === "shipping";
}

function isWebsiteSurface(value: string): value is WebsiteSurface {
  return websiteSurfaceOptions.some((surface) => surface.id === value);
}
