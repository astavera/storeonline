/**
 * Verifies the customer-facing empty cart state without introducing catalog fixtures.
 */

import { render, screen } from "@testing-library/react";
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
});
