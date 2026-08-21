// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminProductEditor } from "@/components/admin/admin-product-editor";
import type {
  ProductShippingProfile,
  ProductShippingProfileDraft
} from "@/features/catalog/product-shipping-profile";
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

const shippingProfile: ProductShippingProfile = {
  configured: false,
  isShippable: true,
  packageLengthIn: "",
  packageWidthIn: "",
  packageHeightIn: "",
  packageWeightLb: "",
  shippingEnabled: false
};

const shippingProfileInput: ProductShippingProfileDraft = {
  isShippable: true,
  packageLengthIn: "",
  packageWidthIn: "",
  packageHeightIn: "",
  packageWeightLb: ""
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("admin product editor", () => {
  it("keeps Square fields read only and saves website placement with its physical shipping profile", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        placement: WebsiteProductPlacement;
        shippingProfile: ProductShippingProfileDraft;
      };
      return jsonResponse({
        ok: true,
        placement: body.placement,
        shippingProfile: { ...body.shippingProfile, configured: true, shippingEnabled: false },
        issues: []
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminProductEditor
        brands={[]}
        categories={[category]}
        holidays={[]}
        initialPlacement={placement}
        initialShippingProfile={shippingProfile}
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
    const body = JSON.parse(String(request?.body)) as {
      placement: WebsiteProductPlacement;
      shippingProfile: ProductShippingProfileDraft;
    };
    expect(body).toEqual({
      placement: expect.objectContaining({ squareVariationId: product.squareVariationId, visible: false }),
      shippingProfile: shippingProfileInput
    });
    expect(screen.getByRole("status").textContent).toContain("private website draft");
  });

  it("allows incremental package entry while shipping remains fail closed", async () => {
    const shippingPlacement = { ...placement, fulfillmentModes: ["pickup", "shipping"] } satisfies WebsiteProductPlacement;
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        placement: WebsiteProductPlacement;
        shippingProfile: ProductShippingProfileDraft;
      };
      return jsonResponse({
        ok: true,
        placement: body.placement,
        shippingProfile: { ...body.shippingProfile, configured: true, shippingEnabled: false },
        issues: []
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminProductEditor
        brands={[]}
        categories={[category]}
        holidays={[]}
        initialPlacement={shippingPlacement}
        initialShippingProfile={shippingProfile}
        initiallySaved
        product={product}
      />
    );

    expect(screen.getByText("Shipping will remain unavailable for this product")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Length (in)"), { target: { value: "10" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      shippingProfile: { packageLengthIn: "10", packageWeightLb: "" }
    });
    expect(screen.getByRole("status").textContent).toContain("Shipping remains unavailable");
  });
});

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}
