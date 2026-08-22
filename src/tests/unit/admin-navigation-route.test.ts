/** Verifies Navigation & SEO API permissions and safe workflow boundaries. */

import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  read: vi.fn(),
  persist: vi.fn(),
  preview: vi.fn(),
  consume: vi.fn(),
  revalidate: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/server/admin/admin-security", () => ({
  authorizeAdminRequest: mocks.authorize,
  adminAuthorizationResponse: () => NextResponse.json({ ok: false }, { status: 403 })
}));
vi.mock("@/server/admin/admin-rate-limit", () => ({ getAdminRateLimiter: () => ({ consume: mocks.consume }) }));
vi.mock("@/server/storefront/admin-preview-response", () => ({ storefrontAdminPreviewRouteResponse: mocks.preview }));
vi.mock("@/server/admin/admin-navigation-seo-service", () => ({
  NavigationPersistenceUnavailableError: class NavigationPersistenceUnavailableError extends Error {},
  NavigationValidationError: class NavigationValidationError extends Error { errors = ["invalid"]; },
  NavigationVersionConflictError: class NavigationVersionConflictError extends Error {},
  persistAdminNavigation: mocks.persist,
  readAdminNavigationSeoWorkspace: mocks.read
}));

import { GET, POST } from "@/app/api/admin/navigation/route";

afterEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockReturnValue(null);
  mocks.consume.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
});

describe("admin navigation route", () => {
  it("protects health reads with storefront:read", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { capabilities: ["storefront:read"] } });
    mocks.read.mockResolvedValue({ publication: { status: "DRAFT" } });

    const response = await GET(new NextRequest("http://localhost:3000/api/admin/navigation"));

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.any(NextRequest), "storefront:read");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("requires write and publish permissions before publishing", async () => {
    mocks.authorize
      .mockResolvedValueOnce({ ok: true, session: { subject: "editor-1", capabilities: ["storefront:write"] } })
      .mockResolvedValueOnce({ ok: false, status: 403 });

    const response = await POST(request("publish"));

    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenNthCalledWith(1, expect.any(NextRequest), "storefront:write");
    expect(mocks.authorize).toHaveBeenNthCalledWith(2, expect.any(NextRequest), "storefront:publish");
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("persists an allowed draft without consuming the publish limiter", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "editor-1", capabilities: ["storefront:write"] } });
    mocks.persist.mockResolvedValue({ versionNumber: 6, status: "DRAFT" });

    const response = await POST(request("save_draft"));

    expect(response.status).toBe(200);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ actorSubject: "editor-1", expectedVersion: 5, operation: "save_draft" }));
  });
});

function request(operation: string) {
  return new NextRequest("http://localhost:3000/api/admin/navigation", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", host: "localhost:3000" },
    body: JSON.stringify({ operation, expectedVersion: 5, changeSummary: "Update navigation", navigation: {} })
  });
}

