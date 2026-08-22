// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  createAdminAnalyticsCsv,
  parseAdminAnalyticsDateRange,
  readAdminAnalytics,
  type AdminAnalyticsRepository
} from "@/server/admin/admin-analytics-service";

const now = new Date("2026-08-19T16:00:00.000Z");

function range() {
  const parsed = parseAdminAnalyticsDateRange({ from: "2026-08-01", to: "2026-08-03" }, now);
  if (!parsed.ok) throw new Error("Expected valid range");
  return parsed.range;
}

function repository(overrides: Partial<AdminAnalyticsRepository> = {}): AdminAnalyticsRepository {
  return {
    readOrders: async () => ({ records: [], truncated: false }),
    readReturns: async () => ({ records: [], truncated: false }),
    readRefunds: async () => ({ records: [], truncated: false }),
    ...overrides
  };
}

describe("Admin analytics range", () => {
  it("defaults to 30 inclusive UTC calendar days", () => {
    expect(parseAdminAnalyticsDateRange({}, now)).toMatchObject({
      ok: true,
      range: { from: "2026-07-21", to: "2026-08-19" }
    });
  });

  it("rejects incomplete, reversed, future and oversized ranges", () => {
    expect(parseAdminAnalyticsDateRange({ from: "2026-08-01" }, now)).toMatchObject({ ok: false, code: "BOTH_DATES_REQUIRED" });
    expect(parseAdminAnalyticsDateRange({ from: "2026-08-10", to: "2026-08-01" }, now)).toMatchObject({ ok: false, code: "RANGE_REVERSED" });
    expect(parseAdminAnalyticsDateRange({ from: "2026-08-01", to: "2026-08-20" }, now)).toMatchObject({ ok: false, code: "FUTURE_DATE" });
    expect(parseAdminAnalyticsDateRange({ from: "2025-01-01", to: "2026-01-02" }, now)).toMatchObject({ ok: false, code: "RANGE_TOO_LARGE" });
  });
});

describe("Admin analytics report", () => {
  it("uses only paid mirrored USD totals and labels locally known refunds as partial", async () => {
    const report = await readAdminAnalytics(range(), {
      now: () => now,
      repository: repository({
        readOrders: async () => ({
          truncated: false,
          records: [
            { id: "paid-1", squarePaymentId: "payment-1", totalMoney: { amount: 10_000, currency: "USD" }, status: "PAID", createdAt: new Date("2026-08-01T12:00:00Z") },
            { id: "unpaid", squarePaymentId: null, totalMoney: { amount: 9_999, currency: "USD" }, status: "PENDING", createdAt: new Date("2026-08-01T13:00:00Z") },
            { id: "invalid-total", squarePaymentId: "payment-2", totalMoney: { amount: 5_000, currency: "CAD" }, status: "PAID", createdAt: new Date("2026-08-02T12:00:00Z") }
          ]
        }),
        readReturns: async () => ({
          truncated: false,
          records: [
            { id: "return-open", status: "REQUESTED", createdAt: new Date("2026-08-02T15:00:00Z") },
            { id: "return-done", status: "COMPLETED", createdAt: new Date("2026-08-03T15:00:00Z") }
          ]
        }),
        readRefunds: async () => ({
          truncated: false,
          records: [{
            id: "refund-1",
            squareRefundId: "square-refund-1",
            squareRefundAmountCents: 2_500,
            squareRefundCurrency: "USD",
            squareRefundStatus: "COMPLETED",
            updatedAt: new Date("2026-08-03T18:00:00Z")
          }]
        })
      })
    });

    expect(report).toMatchObject({
      state: "partial",
      metrics: {
        grossSalesCents: { value: 10_000, state: "partial" },
        netSalesCents: { value: 7_500, state: "partial" },
        paidOrderCount: { value: 2, state: "partial" },
        averageOrderValueCents: { value: 10_000, state: "partial" },
        returnRequestCount: { value: 2, state: "available" },
        openReturnRequestCount: { value: 1, state: "available" },
        completedRefundCount: { value: 1, state: "partial" },
        completedRefundCents: { value: 2_500, state: "partial" }
      }
    });
    expect(report.daily).toEqual([
      { date: "2026-08-01", grossSalesCents: 10_000, paidOrderCount: 1, knownRefundCents: 0, completedRefundCount: 0, returnRequestCount: 0 },
      { date: "2026-08-02", grossSalesCents: 0, paidOrderCount: 1, knownRefundCents: 0, completedRefundCount: 0, returnRequestCount: 1 },
      { date: "2026-08-03", grossSalesCents: 0, paidOrderCount: 0, knownRefundCents: 2_500, completedRefundCount: 1, returnRequestCount: 1 }
    ]);
    expect(JSON.stringify(report.excluded)).toContain("COGS");
    expect(JSON.stringify(report.excluded)).toContain("attribution");
  });

  it("returns unavailable metrics instead of invented zeroes when every mirror fails", async () => {
    const unavailable = async () => { throw new Error("database unavailable"); };
    const report = await readAdminAnalytics(range(), {
      now: () => now,
      repository: repository({ readOrders: unavailable, readReturns: unavailable, readRefunds: unavailable })
    });

    expect(report.state).toBe("unavailable");
    expect(report.metrics.grossSalesCents).toMatchObject({ value: null, state: "unavailable" });
    expect(report.metrics.netSalesCents).toMatchObject({ value: null, state: "unavailable" });
    expect(report.metrics.returnRequestCount).toMatchObject({ value: null, state: "unavailable" });
    expect(report.metrics.completedRefundCents).toMatchObject({ value: null, state: "unavailable" });
  });

  it("degrades to unavailable when database persistence is not configured", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const report = await readAdminAnalytics(range(), { now: () => now });
      expect(report.state).toBe("unavailable");
      expect(report.sources.every((source) => source.state === "unavailable")).toBe(true);
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it("exports daily aggregates without customer or payment identifiers", async () => {
    const report = await readAdminAnalytics(range(), { repository: repository(), now: () => now });
    const csv = createAdminAnalyticsCsv(report);

    expect(csv).toContain("date,gross_sales_cents,paid_order_count,known_refund_cents");
    expect(csv).toContain("2026-08-01,0,0,0,0,0,partial");
    expect(csv).not.toContain("customer");
    expect(csv).not.toContain("payment_id");
  });
});
