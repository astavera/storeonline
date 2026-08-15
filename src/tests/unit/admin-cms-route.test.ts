/**
 * Verifies publish throttling at the generic Admin CMS boundary.
 */

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  consume: vi.fn(),
  list: vi.fn(),
  readVersion: vi.fn(),
  persist: vi.fn()
}));

vi.mock("@/server/admin/admin-cms-document-service", () => ({
  listCmsDocumentVersions: mocks.list,
  persistCmsDocument: mocks.persist,
  readCmsDocumentVersion: mocks.readVersion
}));

vi.mock("@/server/admin/admin-rate-limit", () => ({
  getAdminRateLimiter: () => ({ consume: mocks.consume })
}));

vi.mock("@/server/admin/admin-security", () => ({
  adminAuthorizationResponse: vi.fn(),
  adminCapabilities: { read: "admin:read", write: "admin:write" },
  authorizeAdminRequest: mocks.authorize
}));

import { GET, POST } from "@/app/api/admin/cms/route";

afterEach(() => {
  vi.clearAllMocks();
});

describe("admin CMS route", () => {
  it("returns persisted history for the selected CMS page", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "editor-1" } });
    mocks.list.mockResolvedValue([{ status: "PUBLISHED", title: "Toys", updatedAt: "2026-08-01T12:00:00.000Z", version: 4 }]);

    const response = await GET(new NextRequest("http://localhost:3000/api/admin/cms?entityType=department&entityId=toys"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, versions: [{ version: 4 }] });
    expect(mocks.list).toHaveBeenCalledWith({ entityId: "toys", entityType: "department" });
  });

  it("rate limits publish attempts per editor and CMS entity", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "editor-1" } });
    mocks.consume.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 45 });

    const response = await POST(cmsRequest("publish", "toys"));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("45");
    await expect(response.json()).resolves.toMatchObject({ ok: false, retryAfterSeconds: 45 });
    expect(mocks.consume).toHaveBeenCalledWith(expect.objectContaining({
      key: "editor-1:toys",
      limit: 3,
      scope: "admin-cms-publish",
      windowMs: 60_000
    }));
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("does not consume the publish limit when saving a draft", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "editor-1" } });
    mocks.persist.mockResolvedValue({ ok: true, errors: [], status: "DRAFT" });

    const response = await POST(cmsRequest("save_draft", "toys"));

    expect(response.status).toBe(200);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.persist).toHaveBeenCalledOnce();
  });

  it("loads an earlier version for review without publishing it", async () => {
    const document = { entityId: "toys", entityType: "department", sections: [] };
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "editor-1" } });
    mocks.readVersion.mockResolvedValue(document);

    const response = await POST(new NextRequest("http://localhost:3000/api/admin/cms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "restore", entityType: "department", entityId: "toys", versionNumber: 2 })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ document, ok: true, restoredFromVersion: 2 });
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});

function cmsRequest(operation: string, entityId: string) {
  return new NextRequest("http://localhost:3000/api/admin/cms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation, document: { entityId } })
  });
}
