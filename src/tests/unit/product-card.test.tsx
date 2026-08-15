/**
 * Verifies the shared minimalist product card and multi-quantity cart action.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProductCard } from "@/components/commerce/product-card";
import { readCartItems } from "@/components/commerce/add-to-cart-button";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("product card", () => {
  it("keeps metadata minimal and adds several units in one action", () => {
    render(
      <ProductCard
        product={{
          squareVariationId: "variation-card-1",
          slug: "minimal-product",
          name: "Minimal product",
          department: "Hidden category",
          shortDescription: "",
          imageUrl: "/images/product-fallback.svg",
          priceCents: 1_998,
          fulfillmentModes: ["pickup", "shipping"],
          inventoryStatus: "in-stock",
          priceAvailable: true,
          ageGroups: ["5-7"]
        }}
      />
    );

    expect(screen.queryByText("Hidden category")).toBeNull();
    expect(screen.queryByText("Pickup")).toBeNull();
    expect(screen.queryByText("Shipping")).toBeNull();
    expect(screen.queryByText("Ages 5-7")).toBeNull();
    expect(screen.queryByText(/availability/i)).toBeNull();
    expect(screen.getByText("In stock")).not.toBeNull();

    const wishlistButton = screen.getByRole("button", { name: "Save Minimal product to wishlist" });
    expect(wishlistButton.className).toContain("border-0");
    expect(wishlistButton.className).toContain("hover:bg-transparent");
    expect(wishlistButton.className).not.toContain("hover:bg-surface-muted");
    expect(wishlistButton.parentElement?.className).toContain("product-card-actions");

    const addButton = screen.getByRole("button", { name: "Add to cart" });
    expect(addButton.className).toContain("bg-blue");
    fireEvent.click(addButton);

    expect(readCartItems()).toEqual([{ squareVariationId: "variation-card-1", quantity: 1 }]);
    expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();

    const quantity = screen.getByRole("group", { name: "Quantity in cart" });
    fireEvent.click(within(quantity).getByRole("button", { name: "Increase quantity in cart" }));
    fireEvent.click(within(quantity).getByRole("button", { name: "Increase quantity in cart" }));
    expect(within(quantity).getByText("3")).not.toBeNull();
    expect(readCartItems()).toEqual([{ squareVariationId: "variation-card-1", quantity: 3 }]);
  });

  it("shows a muted sold-out line and disables purchasing", () => {
    render(
      <ProductCard
        product={{
          squareVariationId: "variation-sold-out",
          slug: "sold-out-product",
          name: "Sold-out product",
          department: "Hidden category",
          shortDescription: "",
          imageUrl: "/images/product-fallback.svg",
          priceCents: 2_498,
          fulfillmentModes: ["pickup"],
          inventoryStatus: "out-of-stock",
          priceAvailable: true
        }}
      />
    );

    const stockLine = screen.getByText("Sold out");
    expect(stockLine.className).toContain("text-secondary");
    expect((screen.getByRole("button", { name: "Out of stock" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
