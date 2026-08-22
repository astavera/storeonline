// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminProductsPage from "@/app/(admin)/admin/products/page";
import {
  AdminProductsWorkspace,
  resolveAdminProductsTab
} from "@/components/admin/admin-products-workspace";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  publishing: vi.fn(),
  requireAdminSession: vi.fn(async () => ({ user: { id: "admin" } }))
}));

vi.mock("@/components/admin/admin-catalog-browser", () => ({
  AdminCatalogBrowser: () => {
    mocks.catalog();
    return <div>Square catalog browser</div>;
  }
}));

vi.mock("@/components/admin/admin-product-publishing-workspace", () => ({
  AdminProductPublishingWorkspace: () => {
    mocks.publishing();
    return <div>Website publishing manager</div>;
  }
}));

vi.mock("@/server/admin/admin-session", () => ({
  requireAdminSession: mocks.requireAdminSession
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("admin products workspace", () => {
  it("exposes accessible Catalog and Website publishing navigation", () => {
    render(
      <AdminProductsWorkspace activeTab="publishing">
        <div>Active content</div>
      </AdminProductsWorkspace>
    );

    const catalog = screen.getByRole("link", { name: "Catalog" });
    const publishing = screen.getByRole("link", { name: "Website publishing" });

    expect(screen.getByRole("navigation", { name: "Product workspace" })).toBeTruthy();
    expect(catalog.getAttribute("href")).toBe("/admin/products");
    expect(catalog.hasAttribute("aria-current")).toBe(false);
    expect(publishing.getAttribute("href")).toBe("/admin/products?tab=publishing");
    expect(publishing.getAttribute("aria-current")).toBe("page");
  });

  it("defaults unknown tabs to Catalog", () => {
    expect(resolveAdminProductsTab(undefined)).toBe("catalog");
    expect(resolveAdminProductsTab("unknown")).toBe("catalog");
    expect(resolveAdminProductsTab(["publishing"])).toBe("catalog");
    expect(resolveAdminProductsTab("publishing")).toBe("publishing");
  });

  it("loads only the Catalog tab by default", async () => {
    render(await AdminProductsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Square catalog browser")).toBeTruthy();
    expect(mocks.catalog).toHaveBeenCalledOnce();
    expect(mocks.publishing).not.toHaveBeenCalled();
    expect(mocks.requireAdminSession).toHaveBeenCalledWith({
      capability: "catalog:read",
      returnTo: "/admin/products"
    });
  });

  it("loads only Website publishing when requested", async () => {
    render(await AdminProductsPage({
      searchParams: Promise.resolve({ tab: "publishing" })
    }));

    expect(screen.getByText("Website publishing manager")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Catalog" }).getAttribute("href")).toBe("/admin/products");
    expect(screen.getByRole("link", { name: "Website publishing" }).getAttribute("aria-current")).toBe("page");
    expect(mocks.publishing).toHaveBeenCalledOnce();
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(mocks.requireAdminSession).toHaveBeenCalledWith({
      capability: "catalog:read",
      returnTo: "/admin/products?tab=publishing"
    });
  });
});
