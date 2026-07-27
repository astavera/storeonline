// @vitest-environment node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { storeSectionRegistry } from "@/config/store-section-registry";

const requiredSectionIds = [
  "home.hero",
  "home.departments",
  "home.featured-products",
  "home.balloon-promo",
  "home.local-storefront",
  "toys.hero",
  "toys.product-grid",
  "party-supplies.hero",
  "party-supplies.event-types",
  "party-supplies.product-grid",
  "balloons.landing-hero",
  "balloons.builder",
  "balloons.occasion-selector",
  "balloons.type-selector",
  "balloons.color-selector",
  "balloons.addons-selector",
  "balloons.fulfillment-selector",
  "balloons.time-slot-picker",
  "stationery.hero",
  "stationery.product-grid",
  "arts-crafts.hero",
  "arts-crafts.product-grid",
  "greeting-cards.hero",
  "greeting-cards.occasion-grid",
  "gifts.hero",
  "gifts.product-grid",
  "holidays.index-hero",
  "holidays.active-holidays-grid",
  "holidays.detail-hero",
  "holidays.detail-product-grid",
  "cart.drawer",
  "cart.order-summary",
  "checkout.customer-info",
  "checkout.fulfillment",
  "checkout.payment",
  "checkout.order-summary",
  "admin.control-plane",
  "admin.homepage-sections",
  "admin.navigation",
  "admin.departments",
  "admin.holidays",
  "admin.product-placement-manager",
  "admin.product-display",
  "admin.product-seo",
  "admin.product-images",
  "admin.delivery-zones",
  "admin.pickup-slots",
  "admin.balloon-builder",
  "admin.product-overrides",
  "admin.image-settings",
  "admin.media-library",
  "admin.users-roles",
  "admin.fulfillment-dashboard"
];

describe("storeSectionRegistry", () => {
  it("contains every required first-milestone section id", () => {
    const ids = new Set(storeSectionRegistry.map((section) => section.sectionId));

    for (const requiredSectionId of requiredSectionIds) {
      expect(ids.has(requiredSectionId)).toBe(true);
    }
  });

  it("keeps checkout and fulfillment sections classified as high-risk or critical", () => {
    const sensitiveSections = storeSectionRegistry.filter((section) => section.sectionId.startsWith("checkout.") || section.sectionId.includes("fulfillment") || section.sectionId.includes("slots"));

    expect(sensitiveSections.every((section) => section.riskLevel === "high" || section.riskLevel === "critical")).toBe(true);
  });

  it("does not reference source files that no longer exist", () => {
    const documentedFiles = new Set(
      storeSectionRegistry.flatMap((section) => [...section.relatedFiles, ...section.businessLogicFiles])
    );
    const missingFiles = [...documentedFiles].filter((file) => !existsSync(resolve(process.cwd(), file)));

    expect(missingFiles).toEqual([]);
  });
});
