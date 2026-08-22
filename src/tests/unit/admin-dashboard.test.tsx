// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

const catalogSummary = {
  available: true,
  environment: "production",
  status: "completed",
  hasMore: false,
  pagesCompleted: 4,
  itemCount: 120,
  variationCount: 184,
  imageCount: 170,
  categoryCount: 16,
  vendorCount: 8,
  updatedAt: "2026-08-19T16:00:00.000Z"
} as const;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminDashboard", () => {
  it("renders the minimal overview from analytics and catalog sources", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "/api/admin/analytics") {
        return jsonResponse({
          ok: true,
          report: {
            range: { from: "2026-07-21", to: "2026-08-19" },
            state: "available",
            metrics: {
              grossSalesCents: metric(12_500),
              paidOrderCount: metric(5),
              averageOrderValueCents: metric(2_500),
              openReturnRequestCount: metric(2)
            }
          }
        });
      }
      if (url.includes("images=without")) {
        return jsonResponse({ ok: true, summary: catalogSummary, total: 3 });
      }
      if (url.startsWith("/api/admin/full-catalog-products")) {
        return jsonResponse({ ok: true, summary: catalogSummary, total: 120 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminDashboard canReadAnalytics canReadCatalog canReadOrders canReadReturns />);

    expect(screen.getByRole("heading", { level: 1, name: "Store overview" })).toBeInTheDocument();
    const performance = screen.getByRole("region", { name: "Store performance" });
    expect(await within(performance).findByText("$125.00")).toBeInTheDocument();
    expect(within(performance).getByText("$25.00")).toBeInTheDocument();
    expect(within(performance).getByText("5")).toBeInTheDocument();
    expect(within(performance).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Products without imagery/i })).toHaveAttribute("href", "/admin/products");
    expect(screen.getByRole("link", { name: /Open return requests/i })).toHaveAttribute("href", "/admin/orders?tab=returns");
    expect(screen.getByRole("link", { name: "Open products" })).toHaveAttribute("href", "/admin/products");
    expect(await screen.findByText("120")).toBeInTheDocument();
    expect(screen.getByText("184")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
  });

  it("shows unavailable values without inventing zeroes", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "/api/admin/analytics") {
        return jsonResponse({
          ok: true,
          report: {
            range: { from: "2026-07-21", to: "2026-08-19" },
            state: "unavailable",
            metrics: {
              grossSalesCents: metric(null, "unavailable"),
              paidOrderCount: metric(null, "unavailable"),
              averageOrderValueCents: metric(null, "unavailable"),
              openReturnRequestCount: metric(null, "unavailable")
            }
          }
        });
      }
      return errorResponse({ ok: false, error: "CATALOG_UNAVAILABLE" });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminDashboard canReadAnalytics canReadCatalog canReadReturns />);

    expect(await screen.findByText("Catalog unavailable")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("does not request data outside the assigned permissions", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminDashboard canReadCatalog={false} canReadOrders />);

    expect(screen.getByRole("heading", { name: "Available workspaces" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Orders/i })).toHaveAttribute("href", "/admin/orders");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function metric(value: number | null, state: "available" | "partial" | "unavailable" = "available") {
  return { value, state, note: "Verified local mirror" };
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

function errorResponse(body: unknown) {
  return { ok: false, json: async () => body } as Response;
}
