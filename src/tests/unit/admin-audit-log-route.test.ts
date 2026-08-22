/** Verifies Audit Log API authorization and its read-only response boundary. */

import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  csv: vi.fn(),
  read: vi.fn(),
  preview: vi.fn()
}));

vi.mock("@/server/admin/admin-security", () => ({
  authorizeAdminRequest: mocks.authorize,
  adminAuthorizationResponse: () => NextResponse.json({ ok: false }, { status: 403 })
}));

vi.mock("@/server/admin/admin-audit-log-service", () => ({
  parseAdminAuditLogQuery: () => ({ page: 1, pageSize: 25, action: "publish", entityType: "", actor: "", from: "", to: "" }),
  createAdminAuditLogCsvExport: mocks.csv,
  readAdminAuditLog: mocks.read
}));

vi.mock("@/server/storefront/admin-preview-response", () => ({
  storefrontAdminPreviewRouteResponse: mocks.preview
}));

import { GET } from "@/app/api/admin/audit-log/route";

afterEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockReturnValue(null);
});

describe("admin audit log route", () => {
  it("requires the literal audit:read permission", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, status: 403 });

    const response = await GET(new NextRequest("http://localhost:3000/api/admin/audit-log"));

    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.any(NextRequest), "audit:read");
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns filtered audit data with private no-store caching", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "owner-1" } });
    mocks.read.mockResolvedValue({
      entries: [{ id: "audit-1", action: "publish" }],
      pagination: { page: 1, pageSize: 25, pageCount: 1, total: 1 }
    });

    const response = await GET(new NextRequest("http://localhost:3000/api/admin/audit-log?action=publish"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      entries: [{ id: "audit-1", action: "publish" }],
      query: { action: "publish" }
    });
  });

  it("requires audit:export rather than audit:read for CSV downloads", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, status: 403 });

    const response = await GET(new NextRequest("http://localhost:3000/api/admin/audit-log?format=csv"));

    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.any(NextRequest), "audit:export");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.csv).not.toHaveBeenCalled();
  });

  it("streams a bounded CSV export with private download headers", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "owner-1" } });
    mocks.csv.mockResolvedValue({
      stream: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("csv")); controller.close(); } }),
      total: 5_001,
      rowLimit: 5_000,
      truncated: true
    });

    const response = await GET(new NextRequest("http://localhost:3000/api/admin/audit-log?format=csv"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="modern-state-audit-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(response.headers.get("x-audit-export-limit")).toBe("5000");
    expect(response.headers.get("x-audit-truncated")).toBe("true");
    await expect(response.text()).resolves.toBe("csv");
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
