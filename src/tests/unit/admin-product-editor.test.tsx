// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminProductEditor } from "@/components/admin/admin-product-editor";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import type { WebsiteCategory, WebsiteProductPlacement } from "@/features/catalog/services/website-merchandising-service";

const product: StorefrontProduct = {
  id: "square-item-live",
  squareVariationId: "SQUARE_VARIATION_LIVE",
  slug: "synchronized-catalog-item",
  name: "Synchronized Catalog Item",
  department: "Toys",
  shortDescription: "Description supplied by the synchronized catalog.",
  description: "Description supplied by the synchronized catalog.",
  imageUrl: "/images/product-fallback.svg",
  priceCents: 2499,
  fulfillmentModes: [],
  inventoryStatus: "in-stock",
  inventoryTracked: true,
  availableQuantity: 12,
  squareVendorNames: ["Catalog Vendor"]
};

const category: WebsiteCategory = {
  id: "website-toys",
  name: "Toys",
  slug: "toys",
  description: "Website category",
  imageUrl: "",
  imageAlt: "",
  parentId: null,
  visible: true,
  sortOrder: 0
};

const placement: WebsiteProductPlacement = {
  squareVariationId: product.squareVariationId,
  categoryIds: [category.id],
  brandIds: [],
  holidayAssignments: [],
  ageGroups: [],
  fulfillmentModes: ["pickup"],
  surfaceIds: ["shop"],
  visible: true,
  sortOrder: 0
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("admin product editor", () => {
  it("keeps Square fields read only and saves only website placement settings", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { placement: WebsiteProductPlacement };
      return jsonResponse({ ok: true, placement: body.placement, issues: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminProductEditor
        brands={[]}
        categories={[category]}
        holidays={[]}
        initialPlacement={placement}
        initiallySaved
        product={product}
      />
    );

    expect(screen.getByText("Square · read only")).not.toBeNull();
    expect(screen.getByText("$24.99")).not.toBeNull();
    expect(screen.getByText("12 available")).not.toBeNull();
    expect(screen.queryByDisplayValue(product.name)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Private" }));
    const saveButtons = screen.getAllByRole("button", { name: "Save changes" });
    expect((saveButtons[0] as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(saveButtons[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(request?.body)) as { placement: WebsiteProductPlacement };
    expect(body).toEqual({ placement: expect.objectContaining({ squareVariationId: product.squareVariationId, visible: false }) });
    expect(screen.getByRole("status").textContent).toContain("private website draft");
  });

  it("edits website content, image metadata and SEO without changing Square fields", async () => {
    let postedPlacement: WebsiteProductPlacement | null = null;
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { placement: WebsiteProductPlacement };
      postedPlacement = body.placement;
      return jsonResponse({ ok: true, placement: body.placement, issues: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminProductEditor
        brands={[]}
        categories={[category]}
        holidays={[]}
        initialPlacement={placement}
        initiallySaved
        product={product}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Website title" }), { target: { value: "Deluxe Catalog Item" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Product URL" }), { target: { value: "Deluxe Catalog Item" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Website image URL" }), { target: { value: "https://cdn.example.com/deluxe.jpg" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Website image alt text" }), { target: { value: "Deluxe item in its package" } });
    fireEvent.change(screen.getByRole("textbox", { name: "SEO title" }), { target: { value: "Deluxe Catalog Item | Modern State" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postedPlacement).toMatchObject({
      squareVariationId: product.squareVariationId,
      visible: true,
      content: {
        displayName: "Deluxe Catalog Item",
        slug: "deluxe-catalog-item",
        imageUrl: "https://cdn.example.com/deluxe.jpg",
        imageAlt: "Deluxe item in its package",
        seoTitle: "Deluxe Catalog Item | Modern State"
      }
    });
    expect(screen.queryByDisplayValue("$24.99")).toBeNull();
  });
});

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}
