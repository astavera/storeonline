import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminOrdersTabs, readAdminOrdersTab } from "@/components/admin/admin-orders-tabs";
import { AdminReturnsQueue, returnPageHref } from "@/components/admin/admin-returns-queue";

describe("consolidated Orders tabs", () => {
  it("uses Orders as the safe default and recognizes only the exact Returns tab", () => {
    expect(readAdminOrdersTab(undefined)).toBe("orders");
    expect(readAdminOrdersTab("unknown")).toBe("orders");
    expect(readAdminOrdersTab("RETURNS")).toBe("orders");
    expect(readAdminOrdersTab("returns")).toBe("returns");
  });

  it("renders accessible route-backed Orders and Returns tabs", () => {
    render(<AdminOrdersTabs activeTab="returns" canReadOrders canReadReturns />);
    expect(screen.getByRole("tablist", { name: "Orders workspace" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Orders" }).getAttribute("href")).toBe("/admin/orders");
    expect(screen.getByRole("tab", { name: "Returns" }).getAttribute("href")).toBe("/admin/orders?tab=returns");
    expect(screen.getByRole("tab", { name: "Returns" }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps filters and pagination inside the consolidated Returns tab", () => {
    expect(returnPageHref({ q: "RMA-12", status: "REQUESTED" }, 2)).toBe("/admin/orders?tab=returns&q=RMA-12&status=REQUESTED&page=2");
    render(<AdminReturnsQueue params={{}} queue={{ available: true, page: 1, pageSize: 25, total: 0, pageCount: 1, statusCounts: {}, requests: [] }} />);
    const form = screen.getByRole("button", { name: "Filter" }).closest("form");
    expect(form?.getAttribute("action")).toBe("/admin/orders");
    expect(screen.getByDisplayValue("returns").getAttribute("name")).toBe("tab");
    expect(screen.getByText(/Square remains the only refund executor/i)).toBeTruthy();
  });
});
