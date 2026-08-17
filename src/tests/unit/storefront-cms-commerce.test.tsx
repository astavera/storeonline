/**
 * Verifies the isolated behavior of storefront CMS commerce.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { getProductByVariationId, storefrontProducts } from "@/features/catalog/product-catalog";
import { createCmsPageDocument, createCmsSection } from "@/lib/cms";
import { formatMoney } from "@/lib/utils";

describe("storefront CMS commerce contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets product modules render one responsibility and one primary heading", () => {
    const product = getProductByVariationId("seed-toy-building-set")!;
    const document = createCmsPageDocument("product", product.slug, {
      createdAt: "2026-07-15T12:00:00.000Z",
      updatedAt: "2026-07-15T12:00:00.000Z",
      sections: [
        createCmsSection("productImageGallery", { id: "product.gallery" }),
        createCmsSection("productTitle", { id: "product.title", content: { title: "CMS product title" } }),
        createCmsSection("productPrice", { id: "product.price" }),
        createCmsSection("addToCartButton", { id: "product.add-to-cart" }),
        createCmsSection("productDescription", { id: "product.description", content: { title: "Details", body: "CMS-managed description." } })
      ]
    });

    render(<StorefrontCmsPage document={document} product={product} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByText(formatMoney(product.priceCents))).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Add to cart" })).toHaveLength(1);
    expect(screen.getByText("CMS-managed description.")).not.toBeNull();
  });

  it("does not resolve checked-in product fixtures when the E2E fixture gate is off", () => {
    vi.stubEnv("E2E_CATALOG_FIXTURE", "false");
    const fixtureProduct = storefrontProducts[0];
    const document = createCmsPageDocument("product", "missing-real-product", {
      createdAt: "2026-08-16T12:00:00.000Z",
      updatedAt: "2026-08-16T12:00:00.000Z",
      sections: [
        createCmsSection("productTitle", {
          id: "product.title",
          dataSource: { id: fixtureProduct.slug, limit: 1, manualIds: [], type: "productPlacement" }
        }),
        createCmsSection("productPrice", {
          id: "product.price",
          dataSource: { id: fixtureProduct.slug, limit: 1, manualIds: [], type: "productPlacement" }
        })
      ]
    });

    render(<StorefrontCmsPage document={document} />);

    expect(screen.queryByText(fixtureProduct.name)).toBeNull();
    expect(screen.getByText("Price unavailable")).not.toBeNull();
  });

  it("does not populate CMS product grids from checked-in fixtures when no real products are supplied", () => {
    vi.stubEnv("E2E_CATALOG_FIXTURE", "false");
    const document = createCmsPageDocument("landing", "catalog-boundary", {
      createdAt: "2026-08-16T12:00:00.000Z",
      updatedAt: "2026-08-16T12:00:00.000Z",
      sections: [createCmsSection("productGrid", { id: "catalog-boundary.products" })]
    });

    render(<StorefrontCmsPage document={document} />);

    for (const fixtureProduct of storefrontProducts) {
      expect(screen.queryByText(fixtureProduct.name)).toBeNull();
    }
  });
});
