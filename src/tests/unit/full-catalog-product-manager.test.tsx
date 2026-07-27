// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FullCatalogProductManager } from "@/components/admin/full-catalog-product-manager";
import { writeCatalogPublishingWorkspace } from "@/features/admin/services/catalog-publishing-workspace-state";
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
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("full catalog product manager", () => {
  it("uses the image filter before selecting all 291 filtered products", async () => {
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

    fireEvent.change(await screen.findByRole("combobox", { name: "Filter by image" }), { target: { value: "with" } });
    const selectAllFilteredButton = await screen.findByRole("button", { name: "All filtered (291)" });
    await waitFor(() => expect((selectAllFilteredButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(selectAllFilteredButton);
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => {
      const url = String(input);
      return url.includes("selection=matching") && url.includes("images=with");
    })).toBe(true));
    expect(await screen.findByRole("heading", { name: "Edit 291 selected products" })).toBeTruthy();
    fireEvent.click(screen.getByRole("combobox", { name: "Fulfillment selection" }));
    fireEvent.click(screen.getByRole("option", { name: "Pickup" }));

    expect((screen.getByRole("combobox", { name: "Fulfillment operation" }) as HTMLSelectElement).value).toBe("add");
    expect(screen.getByRole("option", { name: "Pickup" }).getAttribute("aria-selected")).toBe("true");

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
    await waitFor(() => expect((websiteCategoryFilter as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(websiteCategoryFilter);
    fireEvent.click(screen.getByRole("option", { name: "Vehicles" }));
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

  it("searches Square vendors and sends the selected vendor to the catalog query", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("square-category-bulk")) return jsonResponse({ ok: true, categories: [] });
      return jsonResponse({
        ok: true,
        records: [],
        summary: {
          available: true,
          environment: "production",
          status: "completed",
          hasMore: false,
          pagesCompleted: 1,
          itemCount: 0,
          variationCount: 0,
          imageCount: 0,
          categoryCount: 0,
          vendorCount: 1,
          updatedAt: "2026-07-22T12:00:00.000Z"
        },
        query: "",
        categoryId: "",
        vendorId: url.includes("vendorId=vendor-party") ? "vendor-party" : "",
        websiteCategoryId: "",
        imageFilter: "all",
        page: 1,
        pageSize: 24,
        pageCount: 0,
        total: 0
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FullCatalogProductManager brands={[]} categories={[]} holidays={[]} squareVendors={[{ id: "vendor-party", name: "Party Supplier", status: "ACTIVE" }]} />);

    const vendorFilter = await screen.findByRole("combobox", { name: "Filter by Square vendor" });
    await waitFor(() => expect((vendorFilter as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(vendorFilter);
    fireEvent.change(screen.getByRole("combobox", { name: "Search vendors" }), { target: { value: "party" } });
    fireEvent.click(screen.getByRole("option", { name: "Party Supplier" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("vendorId=vendor-party"))).toBe(true));
  });

  it("restores filters, active draft and list position when the catalog snapshot is unchanged", async () => {
    const baselinePlacement = createPlacement("balloon-1", 3);
    writeCatalogPublishingWorkspace(window.localStorage, {
      snapshotUpdatedAt: "2026-07-22T12:00:00.000Z",
      queryInput: "foil balloon",
      query: "foil balloon",
      squareCategoryId: "",
      squareVendorId: "vendor-party",
      websiteCategoryId: "",
      imageFilter: "with",
      page: 2,
      selectedId: "balloon-1",
      selectedIds: [],
      draft: { ...baselinePlacement, sortOrder: 42 },
      draftBaseline: baselinePlacement,
      listScrollTop: 118
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("square-category-bulk")) return jsonResponse({ ok: true, categories: [] });
      return jsonResponse(createCatalogResponse({
        name: "Foil Balloon",
        placement: baselinePlacement,
        snapshotUpdatedAt: "2026-07-22T12:00:00.000Z",
        page: 2
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<FullCatalogProductManager brands={[]} categories={[]} holidays={[]} squareVendors={[{ id: "vendor-party", name: "Party Supplier", status: "ACTIVE" }]} />);

    expect(await screen.findByDisplayValue("foil balloon")).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => {
      const url = String(input);
      return url.includes("page=2") && url.includes("q=foil+balloon") && url.includes("vendorId=vendor-party") && url.includes("images=with");
    })).toBe(true));
    expect(await screen.findByRole("heading", { name: "Foil Balloon" })).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("42"));
    await waitFor(() => expect((container.querySelector("[data-catalog-product-list]") as HTMLDivElement).scrollTop).toBe(118));
  });

  it("keeps safe filters but discards selection and draft when the catalog snapshot changed", async () => {
    const baselinePlacement = createPlacement("balloon-1", 3);
    writeCatalogPublishingWorkspace(window.localStorage, {
      snapshotUpdatedAt: "2026-07-21T12:00:00.000Z",
      queryInput: "balloon",
      query: "balloon",
      squareCategoryId: "",
      squareVendorId: "",
      websiteCategoryId: "",
      imageFilter: "all",
      page: 1,
      selectedId: "balloon-1",
      selectedIds: ["balloon-1"],
      draft: { ...baselinePlacement, sortOrder: 99 },
      draftBaseline: baselinePlacement,
      listScrollTop: 200
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("square-category-bulk")) return jsonResponse({ ok: true, categories: [] });
      return jsonResponse(createCatalogResponse({
        name: "Foil Balloon",
        placement: baselinePlacement,
        snapshotUpdatedAt: "2026-07-22T12:00:00.000Z",
        page: 1
      }));
    }));

    const { container } = render(<FullCatalogProductManager brands={[]} categories={[]} holidays={[]} />);

    expect(await screen.findByDisplayValue("balloon")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Foil Balloon" })).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("checkbox", { name: "Select Foil Balloon" }) as HTMLInputElement).checked).toBe(false));
    expect(screen.queryByRole("heading", { name: "Edit 1 selected products" })).toBeNull();
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("3");
    expect((container.querySelector("[data-catalog-product-list]") as HTMLDivElement).scrollTop).toBe(0);
  });
});

function createPlacement(squareVariationId: string, sortOrder: number) {
  return {
    squareVariationId,
    categoryIds: [],
    brandIds: [],
    holidayAssignments: [],
    ageGroups: [],
    fulfillmentModes: [],
    surfaceIds: [],
    visible: false,
    sortOrder
  };
}

function createCatalogResponse({ name, page, placement, snapshotUpdatedAt }: { name: string; page: number; placement: ReturnType<typeof createPlacement>; snapshotUpdatedAt: string }) {
  return {
    ok: true,
    records: [{
      product: {
        id: "square-balloon-1",
        squareVariationId: placement.squareVariationId,
        slug: "foil-balloon",
        name,
        department: "Balloons",
        shortDescription: "Balloon",
        description: "Balloon",
        imageUrl: "/images/product-fallback.svg",
        priceCents: 399,
        fulfillmentModes: [],
        inventoryStatus: "in-stock",
        previewOnly: true
      },
      placement,
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
      imageCount: 1,
      categoryCount: 1,
      vendorCount: 1,
      updatedAt: snapshotUpdatedAt
    },
    query: "",
    categoryId: "",
    vendorId: "",
    websiteCategoryId: "",
    imageFilter: "all",
    page,
    pageSize: 24,
    pageCount: 2,
    total: 1
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}
