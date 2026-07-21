import { describe, expect, it } from "vitest";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import {
  createDefaultWebsiteMerchandising,
  filterWebsiteCatalogProducts,
  orderWebsiteCategories,
  reconcileWebsiteMerchandising,
  resolveWebsiteCatalog,
  slugifyWebsiteCategory,
  websiteCategoryDepth,
  websiteCategoryLabel,
  websitePlacementIssues,
  type WebsiteBrand,
  type WebsiteCategory
} from "@/features/catalog/services/website-merchandising-service";

const products: StorefrontProduct[] = [
  product("variation-balloon", "Birthday Balloon", "Balloons/Mylars"),
  product("variation-paint", "Acrylic Paint", "Arts & Crafts")
];

const websiteCategory: WebsiteCategory = {
  id: "web-category-gifts",
  name: "Birthday gifts",
  slug: "birthday-gifts",
  description: "Customer-facing birthday gifts.",
  parentId: null,
  visible: true,
  sortOrder: 0
};

const websiteBrand: WebsiteBrand = {
  id: "web-brand-crayola",
  name: "Crayola",
  slug: "crayola",
  description: "Crayola art supplies.",
  logoUrl: "/uploads/admin/crayola.png",
  imageAlt: "Crayola logo",
  squareVendorIds: ["square-vendor-crayola"],
  visible: true,
  featuredOnHomepage: true,
  sortOrder: 0
};

describe("website merchandising service", () => {
  it("keeps the Square inbox hidden and website structure blank by default", () => {
    const config = createDefaultWebsiteMerchandising(products, "2026-07-13T15:00:00.000Z");

    expect(config).toMatchObject({ version: 3, categories: [], brands: [], holidays: [] });
    expect(config.placements).toEqual([
      expect.objectContaining({ squareVariationId: "variation-balloon", categoryIds: [], holidayAssignments: [], fulfillmentModes: [], surfaceIds: [], visible: false }),
      expect.objectContaining({ squareVariationId: "variation-paint", categoryIds: [], holidayAssignments: [], fulfillmentModes: [], surfaceIds: [], visible: false })
    ]);
  });

  it("resolves only products explicitly configured and published for a website surface", () => {
    const config = createDefaultWebsiteMerchandising(products, "2026-07-13T15:00:00.000Z");
    config.categories = [websiteCategory];
    config.placements[0] = {
      ...config.placements[0],
      categoryIds: [websiteCategory.id],
      ageGroups: ["3-4", "5-7"],
      fulfillmentModes: ["pickup"],
      surfaceIds: ["shop", "category-pages"],
      visible: true
    };

    const resolved = resolveWebsiteCatalog(products, config);

    expect(resolved.products).toHaveLength(1);
    expect(resolved.products[0]).toMatchObject({ name: "Birthday Balloon", department: "Birthday gifts", ageGroups: ["3-4", "5-7"], fulfillmentModes: ["pickup"] });
    expect(filterWebsiteCatalogProducts(resolved, { surface: "shop", categoryId: websiteCategory.id, ageGroup: "5-7" })).toHaveLength(1);
    expect(products[0].department).toBe("Balloons/Mylars");
  });

  it("does not publish incomplete website records", () => {
    const config = createDefaultWebsiteMerchandising(products, "2026-07-13T15:00:00.000Z");
    config.categories = [websiteCategory];
    config.placements[0] = { ...config.placements[0], categoryIds: [websiteCategory.id], visible: true };

    expect(websitePlacementIssues(config.placements[0])).toEqual([
      "Choose where the product appears on the website.",
      "Choose at least one fulfillment method."
    ]);
    expect(resolveWebsiteCatalog(products, config).products).toEqual([]);
  });

  it("resolves website brand membership independently from Square categories", () => {
    const config = createDefaultWebsiteMerchandising(products, "2026-07-13T15:00:00.000Z");
    config.categories = [websiteCategory];
    config.brands = [websiteBrand];
    config.placements[0] = {
      ...config.placements[0],
      categoryIds: [websiteCategory.id],
      brandIds: [websiteBrand.id],
      fulfillmentModes: ["pickup"],
      surfaceIds: ["shop"],
      visible: true
    };

    const resolved = resolveWebsiteCatalog(products, config);
    expect(resolved.brands).toEqual([websiteBrand]);
    expect(filterWebsiteCatalogProducts(resolved, { brandId: websiteBrand.id, surface: "shop" })).toHaveLength(1);
    expect(resolved.products[0].websiteBrandIds).toEqual([websiteBrand.id]);
  });

  it("orders four category levels and rolls products up through every ancestor", () => {
    const mainCategory: WebsiteCategory = { ...websiteCategory, id: "category-toys", name: "Toys", slug: "toys", parentId: null, sortOrder: 0 };
    const subcategory: WebsiteCategory = { ...websiteCategory, id: "category-games", name: "Games & Puzzles", slug: "games-and-puzzles", parentId: mainCategory.id, sortOrder: 0 };
    const thirdLevel: WebsiteCategory = { ...websiteCategory, id: "category-board-games", name: "Board Games", slug: "board-games", parentId: subcategory.id, sortOrder: 0 };
    const fourthLevel: WebsiteCategory = { ...websiteCategory, id: "category-strategy-games", name: "Strategy Games", slug: "strategy-games", parentId: thirdLevel.id, sortOrder: 0 };
    const config = createDefaultWebsiteMerchandising(products, "2026-07-13T15:00:00.000Z");
    config.categories = [fourthLevel, subcategory, mainCategory, thirdLevel];
    config.placements[0] = {
      ...config.placements[0],
      categoryIds: [fourthLevel.id],
      fulfillmentModes: ["pickup"],
      surfaceIds: ["shop"],
      visible: true
    };

    const resolved = resolveWebsiteCatalog(products, config);

    expect(orderWebsiteCategories(config.categories).map((category) => category.id)).toEqual([mainCategory.id, subcategory.id, thirdLevel.id, fourthLevel.id]);
    expect(websiteCategoryDepth(fourthLevel, config.categories)).toBe(4);
    expect(websiteCategoryLabel(fourthLevel, config.categories)).toBe("Toys › Games & Puzzles › Board Games › Strategy Games");
    for (const category of [mainCategory, subcategory, thirdLevel, fourthLevel]) {
      expect(resolved.productVariationIdsByCategory[category.id]).toEqual(["variation-balloon"]);
    }
    expect(filterWebsiteCatalogProducts(resolved, { categoryId: mainCategory.id, surface: "shop" })).toHaveLength(1);
    expect(resolved.products[0].department).toBe("Strategy Games");
  });

  it("keeps deep subcategories and their products private while any ancestor is hidden", () => {
    const mainCategory: WebsiteCategory = { ...websiteCategory, id: "category-toys", name: "Toys", slug: "toys", parentId: null, visible: true };
    const subcategory: WebsiteCategory = { ...websiteCategory, id: "category-games", name: "Games", slug: "games", parentId: mainCategory.id, visible: false };
    const thirdLevel: WebsiteCategory = { ...websiteCategory, id: "category-board-games", name: "Board Games", slug: "board-games", parentId: subcategory.id, visible: true };
    const config = createDefaultWebsiteMerchandising(products, "2026-07-13T15:00:00.000Z");
    config.categories = [mainCategory, subcategory, thirdLevel];
    config.placements[0] = { ...config.placements[0], categoryIds: [thirdLevel.id], fulfillmentModes: ["pickup"], surfaceIds: ["shop"], visible: true };

    const resolved = resolveWebsiteCatalog(products, config);

    expect(resolved.categories).toEqual([mainCategory]);
    expect(resolved.products).toEqual([]);
  });

  it("filters published products by fulfillment method", () => {
    const config = createDefaultWebsiteMerchandising(products, "2026-07-13T15:00:00.000Z");
    config.categories = [websiteCategory];
    config.placements[0] = { ...config.placements[0], categoryIds: [websiteCategory.id], fulfillmentModes: ["pickup"], surfaceIds: ["shop"], visible: true };
    const resolved = resolveWebsiteCatalog(products, config);

    expect(filterWebsiteCatalogProducts(resolved, { fulfillmentMode: "pickup", surface: "shop" })).toHaveLength(1);
    expect(filterWebsiteCatalogProducts(resolved, { fulfillmentMode: "shipping", surface: "shop" })).toHaveLength(0);
  });

  it("applies holiday and product assignment date windows", () => {
    const config = createDefaultWebsiteMerchandising(products, "2026-07-13T15:00:00.000Z");
    config.categories = [websiteCategory];
    config.holidays = [{ id: "holiday-halloween", name: "Halloween", slug: "halloween", description: "Halloween collection.", startDate: "2026-09-01", endDate: "2026-11-01", visible: true, sortOrder: 0 }];
    config.placements[0] = {
      ...config.placements[0],
      categoryIds: [websiteCategory.id],
      holidayAssignments: [{ holidayId: "holiday-halloween", startsAt: "2026-10-01", endsAt: "2026-10-31" }],
      fulfillmentModes: ["pickup"],
      surfaceIds: ["holiday-pages"],
      visible: true
    };

    const during = resolveWebsiteCatalog(products, config, new Date("2026-10-15T12:00:00.000Z"));
    const before = resolveWebsiteCatalog(products, config, new Date("2026-09-15T12:00:00.000Z"));

    expect(filterWebsiteCatalogProducts(during, { holidayId: "holiday-halloween", surface: "holiday-pages" })).toHaveLength(1);
    expect(filterWebsiteCatalogProducts(before, { holidayId: "holiday-halloween", surface: "holiday-pages" })).toHaveLength(0);
  });

  it("adds newly synced Square products as hidden pending records", () => {
    const existing = createDefaultWebsiteMerchandising(products.slice(0, 1), "2026-07-13T15:00:00.000Z");
    const reconciled = reconcileWebsiteMerchandising(existing, products);
    const newPlacement = reconciled.placements.find((placement) => placement.squareVariationId === "variation-paint");

    expect(newPlacement).toEqual(expect.objectContaining({ categoryIds: [], holidayAssignments: [], fulfillmentModes: [], surfaceIds: [], visible: false }));
  });

  it("creates URL-safe collection slugs", () => {
    expect(slugifyWebsiteCategory("Niños & Manualidades")).toBe("ninos-and-manualidades");
  });
});

function product(squareVariationId: string, name: string, department: string): StorefrontProduct {
  return {
    id: squareVariationId,
    squareVariationId,
    slug: slugifyWebsiteCategory(name),
    name,
    department,
    shortDescription: "Square product",
    description: "Square product",
    imageUrl: "/images/product-fallback.svg",
    priceCents: 500,
    fulfillmentModes: ["pickup"],
    inventoryStatus: "limited",
    previewOnly: true
  };
}
