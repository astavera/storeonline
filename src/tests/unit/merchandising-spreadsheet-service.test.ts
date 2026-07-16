import { describe, expect, it } from "vitest";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import {
  applyWebsiteMerchandisingSpreadsheetRows,
  createWebsiteMerchandisingCsv,
  parseCsvTable,
  parseWebsiteMerchandisingTable
} from "@/features/catalog/services/merchandising-spreadsheet-service";
import type { WebsiteBrand, WebsiteCategory, WebsiteHoliday, WebsiteProductPlacement } from "@/features/catalog/services/website-merchandising-service";

const category: WebsiteCategory = {
  id: "web-category-toys",
  name: "Toys & Games",
  slug: "toys-and-games",
  description: "Customer-facing toys.",
  parentId: null,
  visible: true,
  sortOrder: 0
};

const holiday: WebsiteHoliday = {
  id: "holiday-christmas",
  name: "Christmas",
  slug: "christmas",
  description: "Christmas collection.",
  startDate: "2026-11-01",
  endDate: "2026-12-26",
  visible: true,
  sortOrder: 0
};

const brand: WebsiteBrand = {
  id: "web-brand-crayola",
  name: "Crayola",
  slug: "crayola",
  description: "Art supplies.",
  logoUrl: "/uploads/admin/crayola.png",
  imageAlt: "Crayola logo",
  squareVendorIds: ["vendor-crayola"],
  visible: true,
  featuredOnHomepage: true,
  sortOrder: 0
};

const products = [product("variation-one", "Puzzle, Deluxe"), product("variation-two", "Blocks")];

describe("merchandising spreadsheet service", () => {
  it("exports a guided CSV with an ignored example and opt-in APPLY rows", () => {
    const csv = createWebsiteMerchandisingCsv(
      products,
      [placement("variation-one", {
        categoryIds: [category.id],
        surfaceIds: ["shop", "category-pages"],
        ageGroups: ["5-7"],
        fulfillmentModes: ["pickup", "shipping"],
        holidayAssignments: [{ holidayId: holiday.id, startsAt: "2026-11-15", endsAt: "2026-12-20" }],
        sortOrder: 12,
        visible: true
      }), placement("variation-two")],
      [category],
      [],
      [holiday]
    );
    const table = parseCsvTable(csv);
    const headerIndex = table.findIndex((row) => row.includes("square_variation_id"));
    expect(table[0][0]).toBe("WEBSITE MERCHANDISING CSV GUIDE");
    expect(table.some((row) => row[0] === "ROW ACTION" && typeof row[2] === "string" && row[2].includes("APPLY processes"))).toBe(true);
    expect(headerIndex).toBeGreaterThan(10);
    expect(table[headerIndex]).toEqual(expect.arrayContaining(["row_action", "square_variation_id", "instructions"]));
    expect(table[headerIndex + 1][0]).toBe("EXAMPLE");
    expect(table[headerIndex + 1][4]).toBe("toys-and-games");
    expect(table[headerIndex + 2][0]).toBe("SKIP");

    table[headerIndex + 2][0] = "APPLY";
    const parsed = parseWebsiteMerchandisingTable(table, { products, categories: [category], brands: [], holidays: [holiday] });

    expect(parsed.errors).toEqual([]);
    expect(parsed.ignoredRowCount).toBe(2);
    expect(parsed.rows[0]).toEqual({
      squareVariationId: "variation-one",
      categoryIds: [category.id],
      surfaceIds: ["shop", "category-pages"],
      ageGroups: ["5-7"],
      fulfillmentModes: ["pickup", "shipping"],
      holidayAssignments: [{ holidayId: holiday.id, startsAt: "2026-11-15", endsAt: "2026-12-20" }],
      sortOrder: 12,
      visibilityMode: "publish-ready"
    });
  });

  it("uses row_action to ignore safe template rows and rejects ambiguous actions", () => {
    const parsed = parseWebsiteMerchandisingTable([
      ["row_action", "square_variation_id", "website_categories"],
      ["EXAMPLE", "not-a-real-id", "anything"],
      ["SKIP", "variation-one", "missing-category"],
      ["DO_IT", "variation-two", "toys-and-games"],
      ["APPLY", "variation-one", "toys-and-games"]
    ], { products, categories: [category], brands: [], holidays: [] });

    expect(parsed.ignoredRowCount).toBe(2);
    expect(parsed.rows).toEqual([{ squareVariationId: "variation-one", categoryIds: [category.id] }]);
    expect(parsed.errors).toEqual([expect.objectContaining({ row: 4, message: expect.stringContaining("row_action must be APPLY or SKIP") })]);
  });

  it("keeps valid rows while reporting unknown values and product IDs", () => {
    const table = [
      ["square_variation_id", "website_categories", "age_ranges"],
      ["variation-one", "toys-and-games", "5-7|8-10"],
      ["variation-two", "missing-category", "5-7"],
      ["not-loaded", "toys-and-games", "5-7"]
    ];
    const parsed = parseWebsiteMerchandisingTable(table, { products, categories: [category], brands: [], holidays: [] });

    expect(parsed.rows).toEqual([{ squareVariationId: "variation-one", categoryIds: [category.id], ageGroups: ["5-7", "8-10"] }]);
    expect(parsed.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 3, message: expect.stringContaining("Unknown website category") }),
      expect.objectContaining({ row: 4, message: expect.stringContaining("not present") })
    ]));
  });

  it("uses blank cells to keep values and CLEAR to remove assignments", () => {
    const parsed = parseWebsiteMerchandisingTable([
      ["square_variation_id", "website_categories", "website_surfaces", "age_ranges", "fulfillment", "holiday_assignments"],
      ["variation-one", "", "CLEAR", "", "CLEAR", "CLEAR"]
    ], { products, categories: [category], brands: [], holidays: [holiday] });

    expect(parsed.rows[0]).toEqual({
      squareVariationId: "variation-one",
      surfaceIds: [],
      fulfillmentModes: [],
      holidayAssignments: []
    });
  });

  it("imports a website brand independently for each product row", () => {
    const parsed = parseWebsiteMerchandisingTable([
      ["square_variation_id", "website_brands"],
      ["variation-one", "crayola"]
    ], { products, categories: [category], brands: [brand], holidays: [] });
    const applied = applyWebsiteMerchandisingSpreadsheetRows([placement("variation-one")], parsed.rows, [category], []);

    expect(parsed.errors).toEqual([]);
    expect(applied.placements[0].brandIds).toEqual([brand.id]);
  });

  it("validates holiday windows and publishes only a complete imported row", () => {
    const invalid = parseWebsiteMerchandisingTable([
      ["square_variation_id", "holiday_assignments"],
      ["variation-one", "christmas@2026-10-01@2026-12-20"]
    ], { products, categories: [category], brands: [], holidays: [holiday] });
    expect(invalid.errors[0].message).toContain("must stay inside");

    const valid = parseWebsiteMerchandisingTable([
      ["square_variation_id", "website_categories", "website_surfaces", "fulfillment", "publishing"],
      ["variation-one", "toys-and-games", "shop", "pickup", "PUBLISH_READY"]
    ], { products, categories: [category], brands: [], holidays: [holiday] });
    const applied = applyWebsiteMerchandisingSpreadsheetRows([placement("variation-one")], valid.rows, [category], [holiday]);

    expect(applied).toMatchObject({ updatedCount: 1, publishedCount: 1, skippedPublishCount: 0 });
    expect(applied.placements[0]).toMatchObject({ categoryIds: [category.id], surfaceIds: ["shop"], fulfillmentModes: ["pickup"], visible: true });
  });

  it("parses quoted commas, quotes, and line breaks in CSV reference cells", () => {
    const table = parseCsvTable('square_variation_id,product_name,website_categories\r\nvariation-one,"Puzzle, ""Deluxe""\nEdition",toys-and-games');

    expect(table[1]).toEqual(["variation-one", 'Puzzle, "Deluxe"\nEdition', "toys-and-games"]);
  });
});

function placement(squareVariationId: string, patch: Partial<WebsiteProductPlacement> = {}): WebsiteProductPlacement {
  return {
    squareVariationId,
    categoryIds: [],
    brandIds: [],
    holidayAssignments: [],
    ageGroups: [],
    fulfillmentModes: [],
    surfaceIds: [],
    visible: false,
    sortOrder: 0,
    ...patch
  };
}

function product(squareVariationId: string, name: string): StorefrontProduct {
  return {
    id: squareVariationId,
    squareVariationId,
    slug: squareVariationId,
    name,
    department: "Square Toys",
    shortDescription: "",
    description: "",
    imageUrl: "",
    priceCents: 1000,
    fulfillmentModes: ["pickup"],
    inventoryStatus: "in-stock"
  };
}
