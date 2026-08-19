/**
 * Verifies the default product detail hierarchy and real catalog signals.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProductDetail } from "@/components/commerce/product-detail";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const product: StorefrontProduct = {
  id: "square-product",
  squareVariationId: "variation-product-detail",
  slug: "square-product",
  name: "Square product",
  department: "Toys",
  shortDescription: "A concise product introduction.",
  description: "The complete product description from the catalog.",
  imageUrl: "/images/product-fallback.svg",
  priceCents: 2499,
  fulfillmentModes: ["pickup", "local-delivery", "shipping"],
  inventoryStatus: "limited",
  pickupInventory: [{ locationId: "third-avenue", locationName: "3rd Avenue Store", quantity: 2 }]
};

describe("ProductDetail", () => {
  it("presents price, availability, fulfillment, and Square inventory without fake content", () => {
    render(<ProductDetail product={product} />);

    expect(screen.getByRole("heading", { level: 1, name: "Square product" })).not.toBeNull();
    expect(screen.getByText("$24.99")).not.toBeNull();
    expect(screen.getByText("Limited availability")).not.toBeNull();
    expect(screen.getByText("Store pickup")).not.toBeNull();
    expect(screen.getByText("Local delivery")).not.toBeNull();
    expect(screen.getByText("Shipping")).not.toBeNull();
    expect(screen.getByText("2 in stock")).not.toBeNull();
    expect(screen.getByText(product.description)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add to cart" })).not.toBeNull();
  });

  it("disables purchasing when Square reports the product out of stock", () => {
    render(<ProductDetail product={{ ...product, inventoryStatus: "out-of-stock", pickupInventory: [] }} />);

    expect(within(screen.getByRole("region", { name: "Price and availability" })).getByText("Out of stock")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Out of stock" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
