// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminOrdersDashboard } from "@/components/admin/admin-orders-dashboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("admin orders dashboard", () => {
  it("prioritizes sales and return KPIs and keeps the view read only", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (!String(input).startsWith("/api/admin/orders?")) throw new Error("Unexpected request.");
      return jsonResponse({
        ok: true,
        analytics: {
        range: "30d",
        rangeLabel: "Last 30 days",
        startsAt: "2026-07-19T12:00:00.000Z",
        endsAt: "2026-08-18T12:00:00.000Z",
        generatedAt: "2026-08-18T12:00:00.000Z",
        currency: "USD",
        source: "Square Payments",
        truncated: false,
        metrics: {
          grossSalesCents: 20_000,
          netSalesCents: 17_500,
          orderCount: 2,
          averageOrderCents: 10_000,
          completedRefundCents: 2_500,
          completedRefundCount: 1,
          pendingRefundCount: 0,
          returnRequestCount: 1,
          openReturnRequestCount: 1,
          returnRate: 0.5
        },
        paymentMethods: [{ key: "card", label: "Card", salesCents: 20_000, orderCount: 2, share: 1 }],
        locations: [{ key: "location-1", label: "86th Street", salesCents: 20_000, orderCount: 2, share: 1 }],
        recentSales: [{ id: "payment-1", receiptNumber: "A100", createdAt: "2026-08-18T10:00:00.000Z", channel: "Website", location: "86th Street", paymentMethod: "Card", amountCents: 12_500, refundedCents: 2_500, status: "COMPLETED" }],
        recentRefunds: [{ id: "refund-1", createdAt: "2026-08-18T11:00:00.000Z", location: "86th Street", amountCents: 2_500, status: "COMPLETED", reason: "Customer return" }],
        recentReturnRequests: [{ id: "return-1", rmaNumber: "RMA-100", orderNumber: "A100", createdAt: "2026-08-18T11:00:00.000Z", amountCents: 2_500, status: "REFUND_PENDING" }],
          returnWorkflowAvailable: true
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminOrdersDashboard orderProUrl="https://orders.example.test" />);

    expect((await screen.findAllByText("$200.00")).length).toBeGreaterThan(0);
    expect(screen.getByText("$175.00")).toBeTruthy();
    expect(screen.getAllByText("Card").length).toBeGreaterThan(0);
    expect(screen.getAllByText("86th Street").length).toBeGreaterThan(0);
    expect(screen.getByText("RMA-100")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open OrderPRO/ }).getAttribute("href")).toBe("https://orders.example.test");
    expect(screen.queryByRole("button", { name: /refund/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes("range=7d"))).toBe(true));
  });
});

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}
