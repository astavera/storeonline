import {
  productAgeGroupIds,
  type FulfillmentMode,
  type ProductAgeGroup,
  type StorefrontProduct
} from "@/features/catalog/product-catalog";

export const websiteSurfaceIds = ["shop", "homepage", "search", "category-pages", "holiday-pages"] as const;

export const websiteSurfaceOptions = [
  { id: "shop", label: "Shop catalog" },
  { id: "homepage", label: "Homepage" },
  { id: "search", label: "Search results" },
  { id: "category-pages", label: "Category pages" },
  { id: "holiday-pages", label: "Holiday pages" }
] as const;

export type WebsiteSurface = (typeof websiteSurfaceIds)[number];

export type WebsiteCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId: string | null;
  visible: boolean;
  sortOrder: number;
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
};

export type WebsiteMerchandisingConfig = {
  version: 3;
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
    updatedAt,
    categories: [],
    brands: [],
    holidays: [],
    placements: products.map(createPendingPlacement)
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

  return {
    version: 3,
    updatedAt,
    categories: orderWebsiteCategories([...config.categories]
      .map((category, index) => ({
        ...category,
        name: category.name.trim(),
        slug: slugifyWebsiteCategory(category.slug || category.name) || `category-${index + 1}`,
        description: category.description.trim(),
        parentId: category.parentId ?? null,
        sortOrder: Number.isFinite(category.sortOrder) ? category.sortOrder : index
      }))),
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
        .map((placement) => ({
          ...placement,
          categoryIds: Array.from(new Set(placement.categoryIds.filter((categoryId) => knownCategoryIds.has(categoryId)))),
          brandIds: Array.from(new Set(placement.brandIds.filter((brandId) => knownBrandIds.has(brandId)))),
          holidayAssignments: placement.holidayAssignments.filter((assignment) => knownHolidayIds.has(assignment.holidayId)),
          ageGroups: Array.from(new Set(placement.ageGroups.filter(isProductAgeGroup))),
          fulfillmentModes: Array.from(new Set(placement.fulfillmentModes.filter(isFulfillmentMode))),
          surfaceIds: Array.from(new Set(placement.surfaceIds.filter(isWebsiteSurface)))
        })),
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
  const categories = orderWebsiteCategories(config.categories.filter((category) => category.visible && (!category.parentId || configuredCategoryById.get(category.parentId)?.visible)));
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
    search: [],
    "category-pages": [],
    "holiday-pages": []
  };
  const resolvedProducts: Array<{ product: StorefrontProduct; sortOrder: number }> = [];

  for (const placement of config.placements) {
    const product = productById.get(placement.squareVariationId);

    if (!product || !placement.visible || !isWebsitePlacementReady(placement)) {
      continue;
    }

    const visibleCategoryIdsForProduct = placement.categoryIds.filter((categoryId) => visibleCategoryIds.has(categoryId));

    if (visibleCategoryIdsForProduct.length === 0) {
      continue;
    }

    const primaryCategory = visibleCategoryIdsForProduct
      .map((categoryId) => categoryById.get(categoryId))
      .filter((category): category is WebsiteCategory => Boolean(category))
      .sort((a, b) => Number(Boolean(b.parentId)) - Number(Boolean(a.parentId)))[0];

    for (const categoryId of visibleCategoryIdsForProduct) {
      productVariationIdsByCategory[categoryId]?.push(product.squareVariationId);
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
        fulfillmentModes: placement.fulfillmentModes,
        websiteSurfaces: placement.surfaceIds,
        websiteBrandIds: visibleBrandIdsForProduct
      },
      sortOrder: placement.sortOrder
    });
  }

  for (const category of categories) {
    if (!category.parentId) continue;
    productVariationIdsByCategory[category.parentId] = Array.from(new Set([
      ...(productVariationIdsByCategory[category.parentId] ?? []),
      ...(productVariationIdsByCategory[category.id] ?? [])
    ]));
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

  if (placement.fulfillmentModes.length === 0) {
    issues.push("Choose at least one fulfillment method.");
  }

  if (placement.surfaceIds.includes("holiday-pages") && placement.holidayAssignments.length === 0) {
    issues.push("Assign a holiday schedule for Holiday pages.");
  }

  return issues;
}

export function websitePlacementReadinessIssues(
  placement: WebsiteProductPlacement,
  categories: WebsiteCategory[],
  holidays: WebsiteHoliday[]
) {
  const issues = websitePlacementIssues(placement);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const enabledCategoryIds = new Set(categories.filter((category) => category.visible && (!category.parentId || categoryById.get(category.parentId)?.visible)).map((category) => category.id));

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
  for (const root of byParentId.get(null) ?? []) {
    ordered.push(root, ...(byParentId.get(root.id) ?? []));
  }

  return ordered;
}

export function websiteCategoryLabel(category: WebsiteCategory, categories: WebsiteCategory[]) {
  if (!category.parentId) return category.name;
  const parent = categories.find((candidate) => candidate.id === category.parentId);
  return parent ? `${parent.name} › ${category.name}` : category.name;
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

function isFulfillmentMode(value: string): value is FulfillmentMode {
  return value === "pickup" || value === "local-delivery" || value === "shipping";
}

function isWebsiteSurface(value: string): value is WebsiteSurface {
  return websiteSurfaceOptions.some((surface) => surface.id === value);
}
