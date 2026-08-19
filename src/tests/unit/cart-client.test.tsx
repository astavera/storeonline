/**
 * Verifies the customer-facing empty cart state without introducing catalog fixtures.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartClient } from "@/components/checkout/cart-client";

describe("CartClient", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({
        quote: {
          lines: [],
          itemCount: 0,
          subtotalCents: 0,
          estimatedTaxCents: 0,
          totalCents: 0,
          compatibleFulfillmentModes: [],
          fulfillmentLabel: "",
          errors: []
        }
      }),
      ok: true
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a concise empty state with a useful next step", async () => {
    render(<CartClient />);

    expect(await screen.findByRole("heading", { name: "Your cart is empty" })).not.toBeNull();
    expect(screen.getByText("Choose something from the online catalog when you’re ready.")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Continue shopping" }).getAttribute("href")).toBe("/shop");
    expect(screen.queryByText(/gifts|stationery/i)).toBeNull();
  });

  it("shows validated line items and updates their quantity", async () => {
    window.localStorage.setItem("modern-state-cart", JSON.stringify([{ squareVariationId: "variation-cart", quantity: 1 }]));
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({
        quote: {
          lines: [{
            squareVariationId: "variation-cart",
            slug: "square-product",
            name: "Square product",
            department: "Toys",
            imageUrl: "/images/product-fallback.svg",
            unitPriceCents: 2499,
            quantity: 1,
            lineTotalCents: 2499
          }],
          itemCount: 1,
          subtotalCents: 2499,
          estimatedTaxCents: 222,
          totalCents: 2721,
          compatibleFulfillmentModes: ["pickup"],
          fulfillmentLabel: "Store pickup",
          errors: []
        }
      }),
      ok: true
    } as Response);

    render(<CartClient />);

    expect(await screen.findByRole("heading", { name: "Square product" })).not.toBeNull();
    expect(screen.getByText("$24.99 each")).not.toBeNull();
    expect(screen.getByText("Estimated total")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Review order details" }).getAttribute("href")).toBe("/checkout");

    fireEvent.click(screen.getByRole("button", { name: "Increase Square product quantity" }));
    expect(JSON.parse(window.localStorage.getItem("modern-state-cart") ?? "[]")).toEqual([{ squareVariationId: "variation-cart", quantity: 2 }]);
  });
});
