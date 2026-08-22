/** Verifies global Admin search validation, permissions, safe projections, and domain limits. */

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  orders: vi.fn(),
  customers: vi.fn(),
  cms: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  getPrismaClient: () => ({
    squareItemVariation: { findMany: mocks.catalog },
    orderMirror: { findMany: mocks.orders },
    customerAccount: { findMany: mocks.customers },
    cmsContentVersion: { findMany: mocks.cms }
  })
}));

import {
  parseAdminGlobalSearchQuery,
  searchAdminGlobal
} from "@/server/admin/admin-global-search-service";

afterEach(() => {
  vi.clearAllMocks();
  mocks.catalog.mockResolvedValue([]);
  mocks.orders.mockResolvedValue([]);
  mocks.customers.mockResolvedValue([]);
  mocks.cms.mockResolvedValue([]);
});

describe("admin global search service", () => {
  it("requires 2 to 100 trimmed characters", () => {
    expect(parseAdminGlobalSearchQuery(" a ")).toMatchObject({ ok: false, code: "QUERY_TOO_SHORT" });
    expect(parseAdminGlobalSearchQuery("x".repeat(101))).toMatchObject({ ok: false, code: "QUERY_TOO_LONG" });
    expect(parseAdminGlobalSearchQuery("  balloon  ")).toEqual({ ok: true, query: "balloon" });
  });

  it("does not query or return domains outside the session permissions", async () => {
    mocks.catalog.mockResolvedValue([{
      id: "variation-1",
      name: "Red",
      sku: "BAL-RED",
      upc: null,
      item: { name: "Balloon" }
    }]);

    const response = await searchAdminGlobal({ query: "balloon", capabilities: ["catalog:read"] });

    expect(mocks.catalog).toHaveBeenCalledWith(expect.objectContaining({ take: 8 }));
    expect(mocks.orders).not.toHaveBeenCalled();
    expect(mocks.customers).not.toHaveBeenCalled();
    expect(mocks.cms).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      accessibleDomains: ["catalog"],
      unavailableDomains: [],
      results: [{
        domain: "catalog",
        label: "Balloon — Red",
        subtitle: "SKU BAL-RED",
        href: "/admin/products/variation-1"
      }]
    });
  });

  it("returns only safe selected customer and CMS fields with canonical Admin links", async () => {
    mocks.customers.mockResolvedValue([{
      id: "customer-1",
      email: "buyer@example.com",
      firstName: "Alex",
      lastName: "Buyer",
      squareCustomerId: "square-customer-1"
    }]);
    mocks.cms.mockResolvedValue([{
      id: "version-2",
      entityType: "CMS_policy",
      entityId: "privacy",
      versionNumber: 2,
      status: "PUBLISHED",
      title: "Privacy policy"
    }]);

    const response = await searchAdminGlobal({
      query: "privacy",
      capabilities: ["customers:read", "storefront:read"]
    });

    expect(mocks.customers).toHaveBeenCalledWith(expect.objectContaining({
      select: { id: true, email: true, firstName: true, lastName: true, squareCustomerId: true },
      take: 8
    }));
    expect(mocks.cms).toHaveBeenCalledWith(expect.objectContaining({
      select: { id: true, entityType: true, entityId: true, versionNumber: true, status: true, title: true }
    }));
    expect(response.results).toEqual([
      expect.objectContaining({ domain: "customers", href: "/admin/customers?customerId=customer-1" }),
      expect.objectContaining({ domain: "cms", href: "/admin/settings?area=policies&policy=privacy" })
    ]);
  });

  it("reports a permitted domain as unavailable without leaking its failure", async () => {
    mocks.orders.mockRejectedValue(new Error("database-password-do-not-leak"));

    const response = await searchAdminGlobal({ query: "order", capabilities: ["orders:read"] });

    expect(response.results).toEqual([]);
    expect(response.unavailableDomains).toEqual(["orders"]);
  });
});

