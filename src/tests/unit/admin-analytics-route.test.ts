// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), read: vi.fn() }));

vi.mock("@/server/admin/admin-security", () => ({
  adminAuthorizationResponse: vi.fn(() => new Response(null, { status: 403 })),
  authorizeAdminRequest: mocks.authorize
}));
vi.mock("@/server/admin/admin-analytics-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/admin/admin-analytics-service")>();
  return { ...original, readAdminAnalytics: mocks.read };
});

import { GET } from "@/app/api/admin/analytics/route";

const report = {
  generatedAt: "2026-08-19T16:00:00.000Z",
  range: { from: "2026-08-01", to: "2026-08-03", startsAt: "2026-08-01T00:00:00.000Z", endsAtExclusive: "2026-08-04T00:00:00.000Z", label: "2026-08-01 to 2026-08-03", timeZone: "UTC" },
  currency: "USD",
  state: "partial",
  metrics: {},
  sources: [],
  daily: [{ date: "2026-08-01", grossSalesCents: 1_000, paidOrderCount: 1, knownRefundCents: 0, completedRefundCount: 0, returnRequestCount: 0 }],
  excluded: []
};

afterEach(() => vi.clearAllMocks());

describe("Admin analytics API", () => {
  it("requires analytics:read for JSON and rejects invalid ranges before reading mirrors", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "analyst-1" } });
    const response = await GET(new NextRequest("http://localhost:3000/api/admin/analytics?from=2026-08-03&to=2026-08-01"));

    expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), "analytics:read");
    expect(response.status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("uses analytics:export and returns a private, attachment-safe CSV", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, session: { subject: "analyst-1" } });
    mocks.read.mockResolvedValue(report);
    const response = await GET(new NextRequest("http://localhost:3000/api/admin/analytics?from=2026-08-01&to=2026-08-03&format=csv"));

    expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), "analytics:export");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="analytics-2026-08-01-to-2026-08-03.csv"');
    await expect(response.text()).resolves.toContain("2026-08-01,1000,1,0,0,0,partial");
  });
});
