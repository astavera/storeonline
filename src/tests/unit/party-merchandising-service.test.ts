/**
 * Verifies Party Supplies taxonomy and recommendation guardrails.
 */

import { describe, expect, it } from "vitest";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import {
  createPartyMerchandisingStructure,
  isApprovedPersistentPartyAsset,
  isEligibleSolidTableware,
  recommendPartyProduct
} from "@/features/catalog/services/party-merchandising-service";

describe("party merchandising service", () => {
  it("creates an idempotent Party Supplies structure", () => {
    const first = createPartyMerchandisingStructure([]);
    const second = createPartyMerchandisingStructure(first.categories);

    expect(first.createdIds.length).toBeGreaterThan(20);
    expect(second.createdIds).toEqual([]);
    expect(second.categories).toHaveLength(first.categories.length);
    expect(second.categories.find((category) => category.slug === "spider-man")).toMatchObject({ kind: "party-theme", visible: false });
    expect(second.categories.find((category) => category.slug === "solid-red")).toMatchObject({ kind: "party-solid-color", visible: true });
  });

  it("recommends a themed plate for both its theme and product type, but never Solid Colors", () => {
    const { categories } = createPartyMerchandisingStructure([]);
    const spiderMan = categories.find((category) => category.slug === "spider-man")!;
    const plates = categories.find((category) => category.slug === "plates")!;
    const red = categories.find((category) => category.slug === "solid-red")!;
    const product = catalogProduct("Spider-Man Red 9 Inch Plate");

    const recommendation = recommendPartyProduct(product, spiderMan, categories);

    expect(recommendation?.categoryIds).toEqual(expect.arrayContaining([spiderMan.id, plates.id]));
    expect(recommendation?.categoryIds).not.toContain(red.id);
    expect(isEligibleSolidTableware(product, red, categories)).toBe(false);
  });

  it("allows plain, single-color tableware into Solid Colors", () => {
    const { categories } = createPartyMerchandisingStructure([]);
    const red = categories.find((category) => category.slug === "solid-red")!;
    const plates = categories.find((category) => category.slug === "plates")!;
    const product = catalogProduct("20 Ct Red Dinner Plates");

    const recommendation = recommendPartyProduct(product, red, categories);

    expect(recommendation?.categoryIds).toEqual(expect.arrayContaining([red.id, plates.id]));
    expect(isEligibleSolidTableware(product, red, categories)).toBe(true);

    const royalBlue = categories.find((category) => category.slug === "solid-royal-blue")!;
    const cups = categories.find((category) => category.slug === "cups")!;
    const cupRecommendation = recommendPartyProduct(catalogProduct("Royal Blue Paper Cups"), royalBlue, categories);
    expect(cupRecommendation?.categoryIds).toEqual(expect.arrayContaining([royalBlue.id, cups.id]));
  });

  it("rejects patterned or multi-color tableware from Solid Colors", () => {
    const { categories } = createPartyMerchandisingStructure([]);
    const red = categories.find((category) => category.slug === "solid-red")!;

    expect(recommendPartyProduct(catalogProduct("Red Pattern Dinner Plate"), red, categories)).toBeNull();
    expect(recommendPartyProduct(catalogProduct("Red and White Dinner Plates"), red, categories)).toBeNull();
  });

  it("never recommends demo catalog products", () => {
    const { categories } = createPartyMerchandisingStructure([]);
    const plates = categories.find((category) => category.slug === "plates")!;
    const product = { ...catalogProduct("Blue Dinner Plate"), squareVariationId: "seed-demo-plate" };

    expect(recommendPartyProduct(product, plates, categories)).toBeNull();
  });

  it("accepts only persistent non-fallback theme assets", () => {
    expect(isApprovedPersistentPartyAsset("/uploads/admin/spider-man.webp")).toBe(true);
    expect(isApprovedPersistentPartyAsset("/images/categories/batman.webp")).toBe(true);
    expect(isApprovedPersistentPartyAsset("https://images.google.com/batman.webp")).toBe(false);
    expect(isApprovedPersistentPartyAsset("/images/product-fallback.svg")).toBe(false);
    expect(isApprovedPersistentPartyAsset("/uploads/admin/theme-placeholder.png")).toBe(false);
  });
});

function catalogProduct(name: string): StorefrontProduct {
  return {
    id: `item-${name}`,
    squareVariationId: `variation-${name}`,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    department: "Party Supplies",
    shortDescription: "",
    description: "",
    imageUrl: "/images/product-fallback.svg",
    priceCents: 599,
    fulfillmentModes: ["pickup"],
    inventoryStatus: "in-stock"
  };
}
