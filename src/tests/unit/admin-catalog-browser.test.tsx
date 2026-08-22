// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminCatalogBrowser } from "@/components/admin/admin-catalog-browser";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("admin catalog browser", () => {
  it("searches and paginates the real catalog using GET requests only", async () => {
    const fetchMock = vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
      const input = args[0];
      const url = String(input);
      const page = url.includes("page=2") ? 2 : 1;
      const name = url.includes("q=foil+balloon") ? "Foil Balloon" : `Catalog Item Page ${page}`;

      return jsonResponse({
        ok: true,
        records: [{
          product: {
            id: `square-item-${page}`,
            squareVariationId: `square-variation-${page}`,
            slug: `catalog-item-${page}`,
            name,
            department: "Balloons",
            shortDescription: "Square catalog item",
            description: "Square catalog item",
            imageUrl: "/images/product-fallback.svg",
            priceCents: 499,
            fulfillmentModes: [],
            inventoryStatus: "in-stock"
          }
        }],
        summary: {
          available: true,
          environment: "production",
          status: "completed",
          hasMore: false,
          pagesCompleted: 1,
          itemCount: 48,
          variationCount: 48,
          imageCount: 47,
          categoryCount: 4,
          vendorCount: 0,
          updatedAt: "2026-08-16T12:00:00.000Z"
        },
        page,
        pageSize: 24,
        pageCount: 2,
        total: 48
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminCatalogBrowser />);

    expect(await screen.findByRole("heading", { name: "Catalog Item Page 1" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manage Catalog Item Page 1" }).getAttribute("href")).toBe("/admin/products/square-variation-1");
    fireEvent.change(screen.getByLabelText("Search full catalog"), { target: { value: "foil balloon" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByRole("heading", { name: "Foil Balloon" })).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("q=foil+balloon"))).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("page=2"))).toBe(true));
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === undefined || init.method === "GET")).toBe(true);
  });
});

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}
