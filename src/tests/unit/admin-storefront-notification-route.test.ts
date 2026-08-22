/** Verifies authentication, mutation validation, and private caching for the Admin bell API. */

import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  read: vi.fn(),
  mark: vi.fn(),
  preview: vi.fn()
}));

vi.mock("@/server/admin/admin-security", () => ({
  adminCapabilities: { access: "admin:access" },
  authorizeAdminRequest: mocks.authorize,
  adminAuthorizationResponse: () => NextResponse.json({ ok: false }, { status: 403, headers: { "Cache-Control": "private, no-store" } })
}));

vi.mock("@/server/admin/admin-storefront-notification-service", () => ({
  readAdminStorefrontNotifications: mocks.read,
  markAllAdminStorefrontNotificationsRead: mocks.mark
}));

vi.mock("@/server/storefront/admin-preview-response", () => ({
  storefrontAdminPreviewRouteResponse: mocks.preview
}));

import { GET, POST } from "@/app/api/admin/storefront-notifications/route";

afterEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockReturnValue(null);
});

describe("Admin Storefront notification route", () => {
  it("requires an authenticated Admin session before reading", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, status: 403 });

    const response = await GET(new NextRequest("http://localhost:3000/api/admin/storefront-notifications"));

    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.any(NextRequest), "admin:access");
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("forwards the exact session capabilities and disables caching", async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      session: { subject: "admin-1", capabilities: ["storefront:read", "media:read"] }
    });
    mocks.read.mockResolvedValue({ available: true, items: [], unreadCount: 0, lastSeenAt: null });

    const response = await GET(new NextRequest("http://localhost:3000/api/admin/storefront-notifications"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.read).toHaveBeenCalledWith({
      adminUserId: "admin-1",
      capabilities: ["storefront:read", "media:read"]
    });
  });

  it("returns a private unavailable response without retry hints when DB identity is off", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "admin-1", capabilities: ["storefront:read"] } });
    mocks.read.mockResolvedValue({
      available: false,
      items: [],
      unreadCount: 0,
      lastSeenAt: null,
      reason: "DATABASE_IDENTITY_REQUIRED"
    });

    const response = await GET(new NextRequest("http://localhost:3000/api/admin/storefront-notifications"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("retry-after")).toBeNull();
  });

  it("accepts only mark_all_read and marks the authenticated identity", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "admin-2", capabilities: ["storefront:read"] } });
    mocks.mark.mockResolvedValue({ ok: true, lastSeenAt: "2026-08-19T15:30:00.000Z" });
    const request = new NextRequest("http://localhost:3000/api/admin/storefront-notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" })
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.mark).toHaveBeenCalledWith({ adminUserId: "admin-2" });
  });

  it("rejects extra mutation fields without changing the cursor", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "admin-2", capabilities: ["storefront:read"] } });
    const request = new NextRequest("http://localhost:3000/api/admin/storefront-notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read", adminUserId: "someone-else" })
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mocks.mark).not.toHaveBeenCalled();
  });
});
