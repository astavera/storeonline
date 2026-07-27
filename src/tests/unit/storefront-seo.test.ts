import { afterEach, describe, expect, it } from "vitest";
import {
  absoluteStorefrontUrl,
  buildStorefrontMetadata,
  createProductStructuredData,
  createStorefrontOrganizationSchema
} from "@/lib/seo/storefront-seo";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";

const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const previousIndexable = process.env.NEXT_PUBLIC_SITE_INDEXABLE;

afterEach(() => {
  restoreEnvironment("NEXT_PUBLIC_SITE_URL", previousSiteUrl);
  restoreEnvironment("NEXT_PUBLIC_SITE_INDEXABLE", previousIndexable);
});

describe("storefront production SEO", () => {
  it("builds canonical metadata behind the explicit indexing gate", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://modernstate.example";
    process.env.NEXT_PUBLIC_SITE_INDEXABLE = "false";

    const metadata = buildStorefrontMetadata({
      canonicalPath: "/toys",
      description: "Neighborhood toys.",
      title: "Toys | Modern State"
    });

    expect(metadata.alternates?.canonical).toBe("https://modernstate.example/toys");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });

    process.env.NEXT_PUBLIC_SITE_INDEXABLE = "true";
    expect(buildStorefrontMetadata({ canonicalPath: "/toys", description: "Neighborhood toys.", title: "Toys | Modern State" }).robots)
      .toMatchObject({ index: true, follow: true });
  });

  it("preserves approved absolute media URLs", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://modernstate.example";
    expect(absoluteStorefrontUrl("https://cdn.example/product.jpg")).toBe("https://cdn.example/product.jpg");
  });

  it("publishes organization, store, product, price, and availability data", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://modernstate.example";
    const organization = createStorefrontOrganizationSchema();
    const graph = organization["@graph"];
    expect(graph).toHaveLength(3);
    expect(graph.some((entry) => entry["@type"] === "Store" && entry.name.includes("3rd Avenue"))).toBe(true);
    expect(graph.some((entry) => entry.name.includes("Warehouse"))).toBe(false);

    const product: StorefrontProduct = {
      id: "item-1",
      squareVariationId: "variation-1",
      slug: "wooden-train",
      name: "Wooden Train",
      department: "Toys",
      shortDescription: "A classic wooden train.",
      description: "A classic wooden train for creative play.",
      imageUrl: "https://cdn.example/train.jpg",
      priceCents: 2499,
      priceAvailable: true,
      fulfillmentModes: ["pickup"],
      inventoryStatus: "limited"
    };
    const productSchema = createProductStructuredData(product);

    expect(productSchema.image).toEqual(["https://cdn.example/train.jpg"]);
    expect(productSchema.offers).toMatchObject({
      price: "24.99",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock"
    });
  });
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
