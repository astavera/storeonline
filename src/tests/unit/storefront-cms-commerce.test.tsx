import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { getProductByVariationId } from "@/features/catalog/product-catalog";
import { createCmsPageDocument, createCmsSection } from "@/lib/cms";
import { formatMoney } from "@/lib/utils";

describe("storefront CMS commerce contract", () => {
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
});
