/** Verifies capability isolation, data minimization, cursors, and fail-fast behavior of the Admin bell feed. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  findAdmin: vi.fn(),
  updateAdmin: vi.fn(),
  findAudit: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  getPrismaClient: mocks.getClient
}));

import {
  adminStorefrontNotificationLimit,
  markAllAdminStorefrontNotificationsRead,
  readAdminStorefrontNotifications
} from "@/server/admin/admin-storefront-notification-service";

beforeEach(() => {
  vi.stubEnv("ADMIN_IDENTITY_MODE", "DATABASE");
  vi.stubEnv("DATABASE_URL", "postgresql://notification-test");
  mocks.getClient.mockReturnValue({
    adminUser: { findFirst: mocks.findAdmin, updateMany: mocks.updateAdmin },
    auditLog: { findMany: mocks.findAudit }
  });
  mocks.findAdmin.mockResolvedValue({ notificationsLastSeenAt: null });
  mocks.findAudit.mockResolvedValue([]);
  mocks.updateAdmin.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Admin Storefront notification service", () => {
  it("fails fast in LEGACY_BOOTSTRAP without constructing a Prisma client", async () => {
    vi.stubEnv("ADMIN_IDENTITY_MODE", "LEGACY_BOOTSTRAP");

    await expect(readAdminStorefrontNotifications({
      adminUserId: "legacy-admin",
      capabilities: ["storefront:read"]
    })).resolves.toEqual({
      available: false,
      items: [],
      unreadCount: 0,
      lastSeenAt: null,
      reason: "DATABASE_IDENTITY_REQUIRED"
    });
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("fails fast when DATABASE_URL is absent", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const result = await readAdminStorefrontNotifications({
      adminUserId: "admin-1",
      capabilities: ["media:read"]
    });

    expect(result).toMatchObject({ available: false, reason: "DATABASE_NOT_CONFIGURED" });
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("queries at most 20 safe fields and removes records outside session capabilities", async () => {
    const lastSeenAt = new Date("2026-08-19T12:00:00.000Z");
    mocks.findAdmin.mockResolvedValue({ notificationsLastSeenAt: lastSeenAt });
    mocks.findAudit.mockResolvedValue([
      {
        id: "audit-nav",
        action: "STOREFRONT_NAVIGATION_PUBLISHED",
        entityType: "CmsContentVersion",
        createdAt: new Date("2026-08-19T13:00:00.000Z"),
        actor: { email: "private@example.com" },
        before: { password: "never-return" },
        after: { token: "never-return" }
      },
      {
        id: "audit-media",
        action: "MEDIA_ASSET_UPLOADED",
        entityType: "MediaAsset",
        createdAt: new Date("2026-08-19T11:00:00.000Z")
      }
    ]);

    const result = await readAdminStorefrontNotifications({
      adminUserId: "admin-1",
      capabilities: ["storefront:read"]
    });

    expect(mocks.findAudit).toHaveBeenCalledWith(expect.objectContaining({
      take: adminStorefrontNotificationLimit,
      select: { id: true, action: true, entityType: true, createdAt: true }
    }));
    expect(result).toMatchObject({
      available: true,
      unreadCount: 1,
      items: [{ id: "audit-nav", category: "navigation", read: false }]
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("never-return");
    expect(serialized).not.toContain("actor");
  });

  it("does not let generic CMS access bypass settings or promotions capabilities", async () => {
    mocks.findAudit.mockResolvedValue([
      { id: "policy", action: "CMS_PUBLISHED", entityType: "CMS_policy", createdAt: new Date() },
      { id: "campaign", action: "CMS_PUBLISHED", entityType: "CMS_holiday", createdAt: new Date() },
      { id: "homepage", action: "CMS_PUBLISHED", entityType: "CMS_homepage", createdAt: new Date() }
    ]);

    const result = await readAdminStorefrontNotifications({
      adminUserId: "admin-1",
      capabilities: ["storefront:read"]
    });

    expect(result.available && result.items.map((item) => item.id)).toEqual(["homepage"]);
  });

  it("marks older entries read using the administrator-specific cursor", async () => {
    mocks.findAdmin.mockResolvedValue({ notificationsLastSeenAt: new Date("2026-08-19T12:00:00.000Z") });
    mocks.findAudit.mockResolvedValue([
      { id: "new", action: "STORE_SETTINGS_PUBLISHED", entityType: "STORE_ADMINISTRATION_SETTINGS", createdAt: new Date("2026-08-19T12:01:00.000Z") },
      { id: "old", action: "STORE_SETTINGS_DRAFT_SAVED", entityType: "STORE_ADMINISTRATION_SETTINGS", createdAt: new Date("2026-08-19T11:59:00.000Z") }
    ]);

    const result = await readAdminStorefrontNotifications({
      adminUserId: "admin-1",
      capabilities: ["store-settings:read"]
    });

    expect(result).toMatchObject({ available: true, unreadCount: 1 });
    expect(result.available && result.items.map((item) => item.read)).toEqual([false, true]);
  });

  it("updates only the current active Admin identity when marking all read", async () => {
    const now = new Date("2026-08-19T15:30:00.000Z");

    const result = await markAllAdminStorefrontNotificationsRead(
      { adminUserId: "admin-1" },
      { now: () => now }
    );

    expect(mocks.updateAdmin).toHaveBeenCalledWith({
      where: { id: "admin-1", status: "ACTIVE" },
      data: { notificationsLastSeenAt: now }
    });
    expect(result).toEqual({ ok: true, lastSeenAt: now.toISOString() });
  });
});
