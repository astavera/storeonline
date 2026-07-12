import { describe, expect, it } from "vitest";
import { adminModules } from "@/config/admin-control-plane";
import { buildAdminControlOperation, sanitizeAdminValues } from "@/server/admin/admin-control-plane-service";

describe("admin control plane", () => {
  it("gives every admin module a purpose, fields, roles, and guardrails", () => {
    expect(adminModules.length).toBeGreaterThan(10);

    for (const moduleConfig of adminModules) {
      expect(moduleConfig.purpose.length).toBeGreaterThan(20);
      expect(moduleConfig.editableFields.length).toBeGreaterThan(0);
      expect(moduleConfig.ownerRoles.length).toBeGreaterThan(0);
      expect(moduleConfig.guardrails.length).toBeGreaterThan(0);
      expect(moduleConfig.productionChecklist.length).toBeGreaterThan(0);
    }
  });

  it("builds a publishable CMS operation for homepage edits", () => {
    const result = buildAdminControlOperation({
      moduleId: "homepage",
      operation: "publish",
      values: {
        title: "Fresh homepage",
        summary: "New operational homepage copy.",
        ctaLabel: "Shop",
        ctaHref: "/shop",
        status: "Visible",
        sectionOrder: "home.hero, home.featured-products",
        seoMetadata: JSON.stringify({
          title: "Modern State",
          description: "Upper East Side toy store and party supply shop.",
          canonicalUrl: "/"
        }),
        changeSummary: "Updated homepage copy and SEO."
      }
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("PUBLISHED");
    expect(result.version?.entityType).toBe("ADMIN_MODULE");
    expect(result.version?.payload.sectionOrder).toEqual(["home.hero", "home.featured-products"]);
    expect(result.version?.payload.changeSummary).toBe("Updated homepage copy and SEO.");
    expect(result.auditEvent?.action).toBe("admin.publish");
  });

  it("rejects fields that are not explicitly editable", () => {
    const moduleConfig = adminModules.find((item) => item.id === "product-display");
    expect(moduleConfig).toBeDefined();

    const { errors } = sanitizeAdminValues(moduleConfig!, {
      squareVariationId: "SQ123",
      webTitle: "Test",
      webShortDescription: "Short",
      webVisible: true,
      badge: "",
      fulfillmentMode: "Pickup",
      squarePrice: "0.99"
    });

    expect(errors).toContain("squarePrice is not editable in Product Display.");
  });
});
