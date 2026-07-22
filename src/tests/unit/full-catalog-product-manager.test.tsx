// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FullCatalogProductManager } from "@/components/admin/full-catalog-product-manager";
import type { WebsiteCategory } from "@/features/catalog/services/website-merchandising-service";

const websiteCategory: WebsiteCategory = {
  id: "web-category-vehicles",
  name: "Vehicles",
  slug: "vehicles",
  description: "Website vehicles.",
  parentId: null,
  visible: true,
  sortOrder: 0
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("full catalog product manager", () => {
  it("keeps all 291 products selected after a bulk fulfillment update", async () => {
    const variationIds = Array.from({ length: 291 }, (_, index) => `play-vehicle-${index + 1}`);
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { variationIds: string[]; edit: { fulfillmentMode: string; fulfillmentModes: string[] } };
        expect(body.variationIds).toHaveLength(291);
        expect(body.edit).toMatchObject({ fulfillmentMode: "add", fulfillmentModes: ["pickup"] });
        return jsonResponse({ ok: true, updatedCount: 291, publishedCount: 0, skippedPublishCount: 0 });
      }

      if (url.includes("square-category-bulk")) return jsonResponse({ ok: true, categories: [] });
      if (url.includes("selection=matching")) {
        return jsonResponse({ ok: true, variationIds, total: 291, truncated: false });
      }

      return jsonResponse({
        ok: true,
        records: [{
          product: {
            id: "square-item-1",
            squareVariationId: variationIds[0],
            slug: "play-vehicle-1",
            name: "Play Vehicle 1",
            department: "Toys/Play Vehicles",
            shortDescription: "Vehicle",
            description: "Vehicle",
            imageUrl: "/images/product-fallback.svg",
            priceCents: 1299,
            fulfillmentModes: [],
            inventoryStatus: "in-stock",
            previewOnly: true
          },
          placement: {
            squareVariationId: variationIds[0],
            categoryIds: [],
            brandIds: [],
            holidayAssignments: [],
            ageGroups: [],
            fulfillmentModes: [],
            surfaceIds: [],
            visible: false,
            sortOrder: 0
          },
          saved: false
        }],
        summary: {
          available: true,
          environment: "production",
          status: "completed",
          hasMore: false,
          pagesCompleted: 1,
          itemCount: 291,
          variationCount: 291,
          imageCount: 291,
          categoryCount: 1,
          vendorCount: 0,
          updatedAt: "2026-07-14T18:00:00.000Z"
        },
        query: "",
        categoryId: "",
        imageFilter: "with",
        page: 1,
        pageSize: 24,
        pageCount: 1,
        total: 291
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<FullCatalogProductManager brands={[]} categories={[websiteCategory]} holidays={[]} />);

    const selectAllImagesButton = await screen.findByRole("button", { name: "All with images" });
    await waitFor(() => expect((selectAllImagesButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(selectAllImagesButton);
    expect(await screen.findByRole("heading", { name: "Edit 291 selected products" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pickup" }));

    expect((screen.getByRole("combobox", { name: "Fulfillment operation" }) as HTMLSelectElement).value).toBe("add");
    expect(screen.getByRole("checkbox", { name: "Pickup" }).getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Apply to 291" }));

    expect(await screen.findByText(/291 products updated\./)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Edit 291 selected products" })).toBeTruthy());
    expect(screen.getByText("291 selected across all pages.")).toBeTruthy();
  });

  it("filters assigned products and removes selected products from a website category", async () => {
    let postedBody: { variationIds: string[]; edit: { categoryMode: string; categoryIds: string[]; visibilityMode: string } } | null = null;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (init?.method === "POST") {
        postedBody = JSON.parse(String(init.body)) as typeof postedBody;
        return jsonResponse({ ok: true, updatedCount: 1, publishedCount: 0, skippedPublishCount: 0 });
      }

      if (url.includes("square-category-bulk")) return jsonResponse({ ok: true, categories: [] });

      return jsonResponse({
        ok: true,
        records: [{
          product: {
            id: "square-item-vehicle",
            squareVariationId: "play-vehicle-1",
            slug: "play-vehicle-1",
            name: "Play Vehicle 1",
            department: "Toys/Play Vehicles",
            shortDescription: "Vehicle",
            description: "Vehicle",
            imageUrl: "/images/product-fallback.svg",
            priceCents: 1299,
            fulfillmentModes: [],
            inventoryStatus: "in-stock",
            previewOnly: true
          },
          placement: {
            squareVariationId: "play-vehicle-1",
            categoryIds: [websiteCategory.id],
            brandIds: [],
            holidayAssignments: [],
            ageGroups: [],
            fulfillmentModes: ["pickup"],
            surfaceIds: ["shop"],
            visible: true,
            sortOrder: 0
          },
          saved: true
        }],
        summary: {
          available: true,
          environment: "production",
          status: "completed",
          hasMore: false,
          pagesCompleted: 1,
          itemCount: 1,
          variationCount: 1,
          imageCount: 0,
          categoryCount: 1,
          vendorCount: 0,
          updatedAt: "2026-07-21T18:00:00.000Z"
        },
        query: "",
        categoryId: "",
        websiteCategoryId: url.includes("websiteCategoryId=") ? websiteCategory.id : "",
        imageFilter: "all",
        page: 1,
        pageSize: 24,
        pageCount: 1,
        total: 1
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<FullCatalogProductManager brands={[]} categories={[websiteCategory]} holidays={[]} />);

    const websiteCategoryFilter = await screen.findByRole("combobox", { name: "Filter by website category" });
    fireEvent.change(websiteCategoryFilter, { target: { value: websiteCategory.id } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes(`websiteCategoryId=${websiteCategory.id}`))).toBe(true));

    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Play Vehicle 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove from Vehicles" }));

    await waitFor(() => expect(postedBody).not.toBeNull());
    expect(postedBody).toMatchObject({
      variationIds: ["play-vehicle-1"],
      edit: {
        categoryMode: "remove",
        categoryIds: [websiteCategory.id],
        visibilityMode: "keep"
      }
    });
    expect(await screen.findByText(/1 products removed from Vehicles/)).toBeTruthy();
  });
});

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}
