// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  readProducts: vi.fn(),
  readSnapshot: vi.fn(),
  savePlacement: vi.fn(),
  saveShippingProfile: vi.fn()
}));

vi.mock("@/server/admin/admin-security", () => ({
  adminCapabilities: { merchandisingWrite: "merchandising:write", read: "read" },
  authorizeAdminRequest: mocks.authorize,
  adminAuthorizationResponse: () => Response.json({ ok: false }, { status: 401 })
}));

vi.mock("@/server/storefront/admin-preview-response", () => ({
  storefrontAdminPreviewRouteResponse: () => null
}));

vi.mock("@/features/catalog/services/party-merchandising-service", () => ({
  partyAssignmentIssues: () => []
}));

vi.mock("@/server/admin/website-merchandising-store", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/admin/website-merchandising-store")>(),
  applyBulkWebsiteMerchandisingToVariationIds: vi.fn(),
  readWebsiteMerchandisingSnapshot: mocks.readSnapshot,
  saveWebsiteProductPlacement: mocks.savePlacement
}));

vi.mock("@/server/products/product-shipping-profile-store", () => ({
  saveProductShippingProfile: mocks.saveShippingProfile
}));

vi.mock("@/server/square/postgres-admin-catalog-store", () => ({
  readPostgresAdminCatalogPage: vi.fn(),
  readPostgresAdminProductsByVariationIds: mocks.readProducts,
  readPostgresAdminVariationSelection: vi.fn()
}));

import { POST } from "@/app/api/admin/full-catalog-products/route";

const placement = {
  squareVariationId: "variation-a",
  categoryIds: [],
  brandIds: [],
  holidayAssignments: [],
  ageGroups: [],
  fulfillmentModes: ["pickup", "shipping"],
  surfaceIds: ["shop"],
  visible: true,
  sortOrder: 0
};

const shippingProfile = {
  isShippable: true,
  packageLengthIn: "10",
  packageWidthIn: "5",
  packageHeightIn: "4",
  packageWeightLb: ""
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ ok: true });
  mocks.readProducts.mockResolvedValue([{ squareVariationId: "variation-a", department: "Toys" }]);
  mocks.readSnapshot.mockResolvedValue({ categories: [], holidays: [], placements: [] });
  mocks.saveShippingProfile.mockResolvedValue({ ...shippingProfile, configured: true, shippingEnabled: false });
  mocks.savePlacement.mockResolvedValue({ placement, updatedAt: "2026-08-21T12:00:00.000Z" });
});

describe("full catalog product shipping mutation", () => {
  it("saves the fail-closed physical profile before publishing CMS placement", async () => {
    const response = await POST(request({ placement, shippingProfile }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      placement,
      shippingProfile: { configured: true, shippingEnabled: false }
    });
    expect(mocks.saveShippingProfile).toHaveBeenCalledWith(placement, shippingProfile);
    expect(mocks.saveShippingProfile.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.savePlacement.mock.invocationCallOrder[0]
    );
  });

  it("does not publish placement when the physical profile write fails", async () => {
    mocks.saveShippingProfile.mockRejectedValue(new Error("profile unavailable"));

    const response = await POST(request({ placement, shippingProfile }));

    expect(response.status).toBe(500);
    expect(mocks.savePlacement).not.toHaveBeenCalled();
  });
});

function request(body: unknown) {
  return new NextRequest("https://shop.example/api/admin/full-catalog-products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
