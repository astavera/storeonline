// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireSession: vi.fn(), readReturns: vi.fn() }));
vi.mock("@/server/admin/admin-session", () => ({ requireAdminSession: mocks.requireSession }));
vi.mock("@/server/admin/admin-returns-service", () => ({ readAdminReturnQueue: mocks.readReturns }));

import AdminOrdersPage from "@/app/(admin)/admin/orders/page";

afterEach(() => vi.clearAllMocks());
const session = { subject: "owner-1", capabilities: ["orders:read", "returns:read"] };

describe("Admin Orders page tab loading", () => {
  it("does not read the Returns queue while the Orders tab is active", async () => {
    mocks.requireSession.mockResolvedValue(session);
    await AdminOrdersPage({ searchParams: Promise.resolve({ tab: "orders" }) });
    expect(mocks.requireSession).toHaveBeenCalledWith({ capability: "orders:read", returnTo: "/admin/orders" });
    expect(mocks.readReturns).not.toHaveBeenCalled();
  });

  it("loads only the Returns queue and requires returns:read for the Returns tab", async () => {
    mocks.requireSession.mockResolvedValue(session);
    mocks.readReturns.mockResolvedValue({ available: true, page: 1, pageSize: 25, total: 0, pageCount: 1, statusCounts: {}, requests: [] });
    await AdminOrdersPage({ searchParams: Promise.resolve({ tab: "returns", q: "RMA-1", status: "REQUESTED", page: "2" }) });
    expect(mocks.requireSession).toHaveBeenCalledWith({ capability: "returns:read", returnTo: "/admin/orders?tab=returns" });
    expect(mocks.readReturns).toHaveBeenCalledWith({ q: "RMA-1", status: "REQUESTED", page: 2 });
  });
});
