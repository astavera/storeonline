import { describe, expect, it } from "vitest";
import { parseSquareCatalogPreview } from "@/server/square/catalog-preview-store";

describe("Square catalog preview store", () => {
  it("accepts a sanitized read-only preview", () => {
    const preview = parseSquareCatalogPreview({
      source: "square-production-read-only",
      fetchedAt: "2026-07-13T14:35:44.835Z",
      pageCount: 1,
      hasMoreItems: true,
      products: [
        {
          id: "item-1",
          squareVariationId: "variation-1",
          slug: "birthday-balloon-variation",
          name: "Birthday Balloon",
          department: "Balloons",
          shortDescription: "Real Square product.",
          description: "Real Square product.",
          imageUrl: "/images/product-fallback.svg",
          priceCents: 698,
          badge: "Square real",
          fulfillmentModes: ["pickup"],
          inventoryStatus: "limited",
          previewOnly: true
        }
      ]
    });

    expect(preview?.products[0]).toMatchObject({
      name: "Birthday Balloon",
      priceCents: 698,
      previewOnly: true
    });
  });

  it("rejects a preview that could enable checkout", () => {
    expect(
      parseSquareCatalogPreview({
        source: "square-production-read-only",
        fetchedAt: "2026-07-13T14:35:44.835Z",
        pageCount: 1,
        hasMoreItems: false,
        products: [{ previewOnly: false }]
      })
    ).toBeNull();
  });
});
