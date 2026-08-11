/**
 * Verifies category-driven homepage carousel product selection and manual additions.
 */

import { describe, expect, it } from "vitest";
import { storefrontProducts } from "@/features/catalog/product-catalog";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";
import { resolveHomepageCarouselProducts } from "@/features/homepage/utils/homepage-carousel-products";

describe("homepage carousel products", () => {
  it("loads the complete selected category and appends optional individual products", () => {
    const categoryProduct = {
      ...storefrontProducts[0],
      websiteCategorySlugs: ["arts-and-crafts"]
    };
    const optionalProduct = {
      ...storefrontProducts[1],
      websiteCategorySlugs: ["party"]
    };
    const section = carouselSection({
      categorySlug: "arts-and-crafts",
      items: [
        {
          id: "optional-product",
          title: optionalProduct.name,
          linkType: "product",
          productSlug: optionalProduct.slug,
          squareVariationId: optionalProduct.squareVariationId
        }
      ]
    });

    expect(
      resolveHomepageCarouselProducts({
        products: [categoryProduct, optionalProduct],
        section
      }).map((product) => product.squareVariationId)
    ).toEqual([
      categoryProduct.squareVariationId,
      optionalProduct.squareVariationId
    ]);
  });

  it("uses the supplied fallback when no category is selected", () => {
    const fallbackProduct = storefrontProducts[2];

    expect(
      resolveHomepageCarouselProducts({
        fallbackProducts: [fallbackProduct],
        products: storefrontProducts,
        section: carouselSection()
      })
    ).toEqual([fallbackProduct]);
  });
});

function carouselSection(
  patch: Partial<HomepageSectionConfig> = {}
): HomepageSectionConfig {
  return {
    sectionId: "home.test-carousel",
    sectionType: "product-grid",
    title: "Test carousel",
    body: "",
    variant: "new-trending-carousel",
    sortOrder: 1,
    isVisible: true,
    ...patch
  };
}
