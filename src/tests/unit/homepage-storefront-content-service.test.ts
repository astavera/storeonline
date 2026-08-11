/**
 * Verifies the isolated behavior of homepage storefront content service.
 */

import { describe, expect, it } from "vitest";
import { storefrontProducts } from "@/features/catalog/product-catalog";
import { createHomepageItemLinkOptions } from "@/features/homepage/server";
import type { WebsiteBrand, WebsiteCategory } from "@/features/catalog/services/website-merchandising-service";

describe("homepage card destinations", () => {
  it("creates controlled brand, category, and product links from the published catalog", () => {
    const brand: WebsiteBrand = {
      id: "brand-crayola",
      name: "Crayola",
      slug: "crayola",
      description: "Creative supplies for colorful projects.",
      logoUrl: "/images/crayola.svg",
      imageAlt: "Crayola logo",
      squareVendorIds: [],
      visible: true,
      featuredOnHomepage: true,
      sortOrder: 0
    };
    const category: WebsiteCategory = {
      id: "category-arts",
      name: "Arts & Crafts",
      slug: "arts-and-crafts",
      description: "Markers, paper, paint, and project kits.",
      imageUrl: "/uploads/admin/arts-and-crafts.webp",
      imageAlt: "Arts and crafts materials",
      parentId: null,
      visible: true,
      sortOrder: 0
    };
    const product = storefrontProducts[0];

    const options = createHomepageItemLinkOptions({ brands: [brand], categories: [category], products: [product], pages: [] });

    expect(options.map((option) => option.type)).toEqual(["brand", "category", "product"]);
    expect(options[0]).toMatchObject({ value: "crayola", href: "/shop?brand=crayola", title: "Crayola", image: "/images/crayola.svg" });
    expect(options[1]).toMatchObject({ value: "arts-and-crafts", href: "/shop?department=arts-and-crafts", title: "Arts & Crafts" });
    expect(options[2]).toMatchObject({ value: product.slug, href: `/products/${product.slug}`, productSlug: product.slug, squareVariationId: product.squareVariationId });
  });

  it("offers known storefront pages for button and card dropdowns", () => {
    const options = createHomepageItemLinkOptions({ brands: [], categories: [], products: [] });

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "page", label: "Shop all", href: "/shop" }),
      expect.objectContaining({ type: "page", label: "Balloons", href: "/balloons" })
    ]));
  });
});
