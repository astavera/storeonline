/** Verifies that the browser sends only the strict shipping-rate contract. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShippingRatePanel } from "@/components/fulfillment/shipping-rate-panel";

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("ShippingRatePanel", () => {
  it("omits the cart-only source field from shipping-rate items", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, rates: [] })
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const storedCartItems = [{
      squareVariationId: "variation-a",
      quantity: 2,
      source: "storefront" as const
    }];

    render(
      <ShippingRatePanel
        items={storedCartItems}
        locationId="store-86th-street"
        onSelectionChange={() => undefined}
      />
    );
    fireEvent.change(screen.getByLabelText("Street address"), { target: { value: "316 E 82nd St" } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "New York" } });
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "NY" } });
    fireEvent.change(screen.getByLabelText("ZIP code"), { target: { value: "10028" } });
    fireEvent.click(screen.getByRole("button", { name: "Check shipping rates" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/shipping/rates");
    expect(JSON.parse(String(init.body))).toEqual({
      items: [{ squareVariationId: "variation-a", quantity: 2 }],
      locationId: "store-86th-street",
      address: {
        line1: "316 E 82nd St",
        city: "New York",
        state: "NY",
        postalCode: "10028",
        country: "US"
      }
    });
  });
});
