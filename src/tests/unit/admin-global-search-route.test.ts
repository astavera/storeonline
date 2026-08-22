/** Verifies Admin search authentication, validation, and capability forwarding. */

import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  search: vi.fn(),
  preview: vi.fn()
}));

vi.mock("@/server/admin/admin-security", () => ({
  adminCapabilities: { access: "admin:access" },
  authorizeAdminRequest: mocks.authorize,
  adminAuthorizationResponse: () => NextResponse.json({ ok: false }, { status: 403 })
}));

vi.mock("@/server/admin/admin-global-search-service", () => ({
  parseAdminGlobalSearchQuery: (value: string) => value.length >= 2
    ? { ok: true, query: value.trim() }
    : { ok: false, code: "QUERY_TOO_SHORT", message: "Enter at least 2 characters." },
  searchAdminGlobal: mocks.search
}));

vi.mock("@/server/storefront/admin-preview-response", () => ({
  storefrontAdminPreviewRouteResponse: mocks.preview
}));

import { GET } from "@/app/api/admin/search/route";

afterEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockReturnValue(null);
});

describe("admin global search route", () => {
  it("requires an authenticated Admin session before validation or search", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, status: 403 });

    const response = await GET(new NextRequest("http://localhost:3000/api/admin/search?q=balloon"));

    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.any(NextRequest), "admin:access");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("rejects an undersized query without touching data", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { capabilities: ["catalog:read"] } });

    const response = await GET(new NextRequest("http://localhost:3000/api/admin/search?q=x"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "QUERY_TOO_SHORT" });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("forwards the exact session capabilities and disables private caching", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { capabilities: ["catalog:read", "orders:read"] } });
    mocks.search.mockResolvedValue({ query: "balloon", results: [], accessibleDomains: ["catalog", "orders"], unavailableDomains: [] });

    const response = await GET(new NextRequest("http://localhost:3000/api/admin/search?q=balloon"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.search).toHaveBeenCalledWith({ query: "balloon", capabilities: ["catalog:read", "orders:read"] });
  });
});

