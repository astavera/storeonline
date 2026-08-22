/** Verifies that the browser sends only the strict local-delivery quote contract. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalDeliveryQuotePanel } from "@/components/fulfillment/local-delivery-quote-panel";

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("LocalDeliveryQuotePanel", () => {
  it("omits the cart-only source field from local-delivery quote lines", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        quote: {
          eligible: false,
          source: "ORDERPRO",
          reasonCode: "OUTSIDE_WALKING_AREA",
          message: "Delivery is unavailable."
        }
      })
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const storedCartItems = [{
      squareVariationId: "variation-a",
      quantity: 2,
      source: "storefront" as const
    }];

    render(
      <LocalDeliveryQuotePanel
        context="checkout"
        items={storedCartItems}
        onSelectionChange={() => undefined}
      />
    );
    fireEvent.change(screen.getByLabelText("Street address"), { target: { value: "316 E 82nd St" } });
    fireEvent.change(screen.getByLabelText("ZIP code"), { target: { value: "10028" } });
    fireEvent.click(screen.getByRole("button", { name: "Check delivery" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe("/api/fulfillment/local-delivery-quote");
    expect(payload).toMatchObject({
      context: "checkout",
      cartLines: [{ squareVariationId: "variation-a", quantity: 2 }],
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
