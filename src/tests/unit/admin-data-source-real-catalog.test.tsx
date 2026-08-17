/**
 * Ensures the page-builder product selector receives catalog data explicitly.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataSourceInspector } from "@/components/admin/inspector/data-source-inspector";
import { storefrontProducts, type StorefrontProduct } from "@/features/catalog/product-catalog";
import { createCmsSection } from "@/lib/cms";

describe("admin data-source real catalog boundary", () => {
  it("lists only the products supplied by the server catalog query", () => {
    const updateSection = vi.fn();
    const realProduct: StorefrontProduct = {
      ...storefrontProducts[0],
      id: "square-item-real",
      name: "Real Square Catalog Item",
      slug: "real-square-catalog-item",
      squareVariationId: "SQUARE_VARIATION_REAL"
    };

    render(
      <DataSourceInspector
        products={[realProduct]}
        section={createCmsSection("productGrid", { id: "homepage.real-products" })}
        updateSection={updateSection}
      />
    );

    expect(screen.getByText(realProduct.name)).not.toBeNull();
    expect(screen.queryByText(storefrontProducts[0].name)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Use current" }));
    expect(updateSection).toHaveBeenCalledWith({
      dataSource: expect.objectContaining({ manualIds: [realProduct.slug] })
    });
  });
});
