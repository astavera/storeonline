/** Verifies the authenticated Admin route inventory and its navigation boundaries. */

import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  adminRouteRegistry,
  adminSettingsAreaHrefs
} from "@/config/admin-route-registry";

describe("admin route registry", () => {
  it("inventories every authenticated Admin page exactly once", () => {
    const registeredFiles = adminRouteRegistry.map((route) => route.pageFile).sort();
    const discoveredFiles = discoverPageFiles(path.join(process.cwd(), "src", "app", "(admin)", "admin"));

    expect(adminRouteRegistry).toHaveLength(38);
    expect(new Set(adminRouteRegistry.map((route) => route.routePattern)).size).toBe(38);
    expect(new Set(registeredFiles).size).toBe(38);
    expect(registeredFiles).toEqual(discoveredFiles);
  });

  it("registers Customers as a real primary support module", () => {
    expect(adminRouteRegistry.find((route) => route.routePattern === "/admin/customers")).toMatchObject({
      classification: "functional",
      navigation: "primary",
      authorities: ["store-admin", "square"]
    });
  });

  it("retires every generic placeholder behind a canonical destination", () => {
    const genericRoutes = adminRouteRegistry.filter((route) => String(route.classification) === "generic");

    expect(genericRoutes).toHaveLength(0);
  });

  it("classifies Shipping as a functional Store settings destination", () => {
    expect(adminRouteRegistry.find((route) => route.routePattern === "/admin/shipping")).toMatchObject({
      classification: "functional",
      navigation: "hidden",
      authorities: ["operations", "shippo"]
    });
  });

  it("uses Store settings as the only canonical Locations editor", () => {
    const duplicate = adminRouteRegistry.find((route) => route.routePattern === "/admin/locations");
    const storeSettings = adminRouteRegistry.find((route) => route.routePattern === "/admin/settings");

    expect(adminSettingsAreaHrefs.locations).toBe("/admin/settings?area=locations");
    expect(duplicate).toMatchObject({
      classification: "redirect",
      navigation: "hidden",
      redirectTo: adminSettingsAreaHrefs.locations
    });
    expect(storeSettings).toMatchObject({ classification: "functional", navigation: "primary" });
  });

  it("keeps the retired Inventory page out of navigation", () => {
    expect(adminRouteRegistry.find((route) => route.routePattern === "/admin/inventory")).toMatchObject({
      classification: "redirect",
      navigation: "hidden",
      redirectTo: "/admin"
    });
  });

  it("consolidates related work while keeping Promotions independent", () => {
    expect(adminRouteRegistry.find((route) => route.routePattern === "/admin/product-placement")).toMatchObject({
      classification: "redirect",
      redirectTo: "/admin/products?tab=publishing"
    });
    expect(adminRouteRegistry.find((route) => route.routePattern === "/admin/returns")).toMatchObject({
      classification: "redirect",
      redirectTo: "/admin/orders?tab=returns"
    });
    expect(adminRouteRegistry.find((route) => route.routePattern === "/admin/storefront-pages")).toMatchObject({
      classification: "functional",
      navigation: "primary"
    });
    expect(adminRouteRegistry.find((route) => route.routePattern === "/admin/promotions")).toMatchObject({
      classification: "functional",
      navigation: "primary"
    });
  });

  it("exposes only implemented or external handoff pages in navigational surfaces", () => {
    const navigableRoutes = adminRouteRegistry.filter((route) => route.navigation !== "hidden");

    expect(navigableRoutes.every((route) => route.classification === "functional" || route.classification === "external")).toBe(true);
    expect(navigableRoutes.map((route) => route.routePattern)).toEqual([
      "/admin",
      "/admin/products",
      "/admin/orders",
      "/admin/customers",
      "/admin/settings",
      "/admin/promotions",
      "/admin/analytics",
      "/admin/catalog",
      "/admin/storefront-pages"
    ]);
  });
});

function discoverPageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return discoverPageFiles(absolutePath);
      if (entry.name !== "page.tsx") return [];
      return [path.relative(process.cwd(), absolutePath).replaceAll("\\", "/")];
    })
    .sort();
}
