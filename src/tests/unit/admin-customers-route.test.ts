/** Verifies the read-only customer API authorization boundary. */

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), read: vi.fn() }));

vi.mock("@/server/admin/admin-security", () => ({
  adminAuthorizationResponse: vi.fn(() => new Response(null, { status: 403 })),
  authorizeAdminRequest: mocks.authorize
}));
vi.mock("@/server/admin/admin-customer-directory-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/admin/admin-customer-directory-service")>();
  return { ...original, readAdminCustomerDirectory: mocks.read };
});
vi.mock("@/server/storefront/admin-preview-response", () => ({ storefrontAdminPreviewRouteResponse: vi.fn(() => null) }));

import { GET } from "@/app/api/admin/customers/route";

afterEach(() => vi.clearAllMocks());

describe("Admin customers API", () => {
  it("requires customers:read before querying customer data", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, status: 403, code: "DENIED", message: "Denied" });
    const response = await GET(new NextRequest("http://localhost:3000/api/admin/customers"));

    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), "customers:read");
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns only the minimized service result with private no-store caching", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "support-1" } });
    mocks.read.mockResolvedValue({
      customers: [],
      countSources: { orders: "LOCAL_ORDER_EMAIL_MATCH", returns: "UNAVAILABLE" },
      pagination: { page: 1, pageSize: 25, pageCount: 1, total: 0 }
    });
    const response = await GET(new NextRequest("http://localhost:3000/api/admin/customers?consent=unsubscribed"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({ ok: true, query: { consent: "unsubscribed" }, customers: [] });
  });
});
