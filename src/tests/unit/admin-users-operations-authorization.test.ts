/** Verifies that Operations access mutations cannot run before Owner-only authorization. */

import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  assign: vi.fn(),
  revoke: vi.fn()
}));

vi.mock("@/server/admin/admin-security", () => ({
  authorizeAdminRequest: mocks.authorize,
  adminAuthorizationResponse: () => NextResponse.json({ ok: false }, { status: 403 })
}));
vi.mock("@/server/admin/identity/operations-access-service", () => ({
  AdminOperationsAccessServiceError: class extends Error {},
  getAdminOperationsAccessService: () => ({ assign: mocks.assign, revoke: mocks.revoke })
}));
vi.mock("@/server/admin/identity/admin-user-service", () => ({
  AdminIdentityConflictError: class extends Error {},
  AdminIdentityInputError: class extends Error {},
  AdminIdentityNotFoundError: class extends Error {},
  AdminIdentityUnavailableError: class extends Error {},
  inviteAdminUser: vi.fn(),
  readAdminIdentityDirectory: vi.fn(),
  revokeAdminUserSessions: vi.fn(),
  setAdminUserSuspended: vi.fn(),
  updateAdminUserAccess: vi.fn()
}));
vi.mock("@/server/storefront/admin-preview-response", () => ({ storefrontAdminPreviewRouteResponse: vi.fn(() => null) }));

import { PATCH } from "@/app/api/admin/users/route";

afterEach(() => vi.clearAllMocks());

describe("Admin Operations access authorization", () => {
  it.each([
    ["assign_operations", "operations-access:assign"],
    ["revoke_operations", "operations-access:revoke"]
  ])("requires %s permission before calling Operations", async (action, permission) => {
    mocks.authorize.mockResolvedValue({ ok: false, status: 403 });
    const body = action === "assign_operations"
      ? { action, userId: "admin-2", role: "FULFILLMENT", locationIds: ["location-1"] }
      : { action, userId: "admin-2" };
    const response = await PATCH(new NextRequest("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }));

    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.any(NextRequest), permission);
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
});
