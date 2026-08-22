// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminInventoryBrowser } from "@/components/admin/admin-inventory-browser";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("admin inventory browser", () => {
  it("reads synchronized inventory and keeps product navigation read only", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      return jsonResponse({
        ok: true,
        products: [{
          id: "square-item-inventory",
          squareVariationId: "SQUARE_VARIATION_INVENTORY",
          slug: "inventory-item",
          name: "Inventory Item",
          department: "Toys",
          shortDescription: "Synchronized item",
          description: "Synchronized item",
          imageUrl: "/images/product-fallback.svg",
          priceCents: 1299,
          fulfillmentModes: [],
          inventoryStatus: "limited",
          inventoryTracked: true,
          availableQuantity: 3,
          pickupInventory: [{ locationId: "location-1", locationName: "86th Street", quantity: 3 }]
        }],
        summary: {
          available: true,
          environment: "production",
          status: "completed",
          hasMore: false,
          pagesCompleted: 1,
          itemCount: 1,
          variationCount: 1,
          imageCount: 1,
          categoryCount: 1,
          vendorCount: 0,
          updatedAt: "2026-08-18T12:00:00.000Z"
        },
        pageMetrics: { tracked: 1, lowStock: 1, outOfStock: 0 },
        page: 1,
        pageSize: 40,
        pageCount: 1,
        total: 1
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminInventoryBrowser />);

    expect((await screen.findAllByText("Inventory Item")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Low stock").length).toBeGreaterThan(0);
    expect(screen.getAllByText("86th Street").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "View Inventory Item" }).getAttribute("href")).toBe("/admin/products/SQUARE_VARIATION_INVENTORY");

    fireEvent.change(screen.getByLabelText("Search inventory"), { target: { value: "inventory item" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("q=inventory+item"))).toBe(true));
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === undefined || init.method === "GET")).toBe(true);
  });
});

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}
