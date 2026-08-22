import { describe, expect, it } from "vitest";
import { buildAdminOrdersAnalytics, readAdminOrderRange } from "@/server/admin/admin-orders-analytics";

describe("admin orders analytics", () => {
  it("calculates sales, channel, location and refund KPIs from real provider-shaped records", () => {
    const analytics = buildAdminOrdersAnalytics({
      range: "30d",
      startsAt: new Date("2026-07-19T12:00:00.000Z"),
      endsAt: new Date("2026-08-18T12:00:00.000Z"),
      payments: [
        {
          id: "payment-1",
          orderId: "order-1",
          receiptNumber: "A100",
          createdAt: "2026-08-18T10:00:00.000Z",
          status: "COMPLETED",
          amountMoney: { amount: 12_500n, currency: "USD" },
          refundedMoney: { amount: 2_500n, currency: "USD" },
          locationId: "location-1",
          sourceType: "CARD",
          note: "Modern State website order - pickup",
          applicationDetails: { squareProduct: "SQUARE_POS" }
        },
        {
          id: "payment-2",
          orderId: "order-2",
          receiptNumber: "A101",
          createdAt: "2026-08-17T10:00:00.000Z",
          status: "COMPLETED",
          amountMoney: { amount: 7_500n, currency: "USD" },
          locationId: "location-1",
          sourceType: "CASH",
          note: "Modern State website order - pickup",
          applicationDetails: { squareProduct: "SQUARE_POS" }
        },
        {
          id: "payment-2-tip",
          orderId: "order-2",
          createdAt: "2026-08-17T10:01:00.000Z",
          status: "COMPLETED",
          amountMoney: { amount: 500n, currency: "USD" },
          locationId: "location-1",
          sourceType: "CASH",
          note: "Modern State website order - pickup",
          applicationDetails: { squareProduct: "SQUARE_POS" }
        },
        {
          id: "payment-pos",
          orderId: "order-pos",
          createdAt: "2026-08-17T10:02:00.000Z",
          status: "COMPLETED",
          amountMoney: { amount: 9_999n, currency: "USD" },
          locationId: "location-1",
          sourceType: "CARD",
          applicationDetails: { squareProduct: "SQUARE_POS" }
        },
        {
          id: "payment-failed",
          status: "FAILED",
          amountMoney: { amount: 99_999n, currency: "USD" },
          locationId: "location-1"
        }
      ],
      refunds: [{
        id: "refund-1",
        paymentId: "payment-1",
        createdAt: "2026-08-18T11:00:00.000Z",
        status: "COMPLETED",
        amountMoney: { amount: 2_500n, currency: "USD" },
        locationId: "location-1"
      }],
      locations: [{ id: "location-1", name: "86th Street" }],
      returnWorkflow: {
        available: true,
        requests: [{
          id: "return-1",
          rmaNumber: "RMA-100",
          orderNumber: "A100",
          createdAt: "2026-08-18T11:00:00.000Z",
          amountCents: 2_500,
          status: "REFUND_PENDING"
        }]
      }
    });

    expect(analytics.metrics).toMatchObject({
      grossSalesCents: 20_500,
      netSalesCents: 18_000,
      orderCount: 2,
      averageOrderCents: 10_250,
      completedRefundCents: 2_500,
      completedRefundCount: 1,
      returnRequestCount: 1,
      openReturnRequestCount: 1,
      returnRate: 0.5
    });
    expect(analytics.paymentMethods[0]).toMatchObject({ label: "Card", salesCents: 12_500, orderCount: 1 });
    expect(analytics.paymentMethods[1]).toMatchObject({ label: "Cash", salesCents: 8_000, orderCount: 1 });
    expect(analytics.locations[0]).toMatchObject({ label: "86th Street", salesCents: 20_500, orderCount: 2 });
    expect(analytics.recentSales[0]).toMatchObject({ receiptNumber: "A100", paymentMethod: "Card", refundedCents: 2_500 });
  });

  it("defaults unsupported reporting ranges to 30 days", () => {
    expect(readAdminOrderRange("all-time")).toBe("30d");
    expect(readAdminOrderRange("7d")).toBe("7d");
  });
});
