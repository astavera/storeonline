import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), read: vi.fn(), note: vi.fn(), export: vi.fn(), deletion: vi.fn(), update: vi.fn() }));

vi.mock("@/server/admin/admin-security", () => ({
  adminAuthorizationResponse: vi.fn(() => new Response(null, { status: 403 })),
  authorizeAdminRequest: mocks.authorize
}));
vi.mock("@/server/admin/admin-customer-privacy-service", () => ({
  addAdminCustomerNote: mocks.note,
  createAdminCustomerDataExport: mocks.export,
  createAdminCustomerDeletionRequest: mocks.deletion,
  CustomerPrivacyError: class CustomerPrivacyError extends Error { constructor(readonly code: string) { super(code); } },
  readAdminCustomerPrivacyProfile: mocks.read,
  updateAdminCustomerPrivacyRequest: mocks.update
}));
vi.mock("@/server/storefront/admin-preview-response", () => ({ storefrontAdminPreviewRouteResponse: vi.fn(() => null) }));

import { GET, POST } from "@/app/api/admin/customers/privacy/route";

afterEach(() => vi.clearAllMocks());

describe("Admin customer privacy API", () => {
  it("requires customers:read before returning the internal profile", async () => {
    mocks.authorize.mockResolvedValue({ ok: false });
    const response = await GET(new NextRequest("http://localhost/api/admin/customers/privacy?customerId=customer-1"));
    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), "customers:read");
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("requires the stronger privacy permission for a data export", async () => {
    mocks.authorize.mockResolvedValue({ ok: false });
    const response = await GET(new NextRequest("http://localhost/api/admin/customers/privacy?customerId=customer-1&mode=export"));
    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), "customers:privacy.manage");
    expect(mocks.export).not.toHaveBeenCalled();
  });

  it("downloads an authorized local-data export without caching", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "owner-1" } });
    mocks.export.mockResolvedValue({ generatedAt: "2026-08-19T00:00:00.000Z", customer: { id: "customer-1" } });
    const response = await GET(new NextRequest("http://localhost/api/admin/customers/privacy?customerId=customer-1&mode=export"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="customer-customer-1-export.json"');
  });

  it("checks note permission before creating a customer note", async () => {
    mocks.authorize.mockResolvedValue({ ok: false });
    const response = await POST(new NextRequest("http://localhost/api/admin/customers/privacy", { method: "POST", body: JSON.stringify({ action: "add_note", customerId: "customer-1", body: "Called customer" }), headers: { "content-type": "application/json" } }));
    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), "customers:notes.write");
    expect(mocks.note).not.toHaveBeenCalled();
  });
});
