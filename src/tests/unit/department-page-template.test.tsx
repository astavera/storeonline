/**
 * Verifies the isolated behavior of department page template.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCmsPageDocument, createCmsSection } from "@/lib/cms";

const storefrontMocks = vi.hoisted(() => ({
  isStorefrontPageDeleted: vi.fn(),
  readDepartmentBestSellers: vi.fn(),
  readLatestCmsDocument: vi.fn(),
  readResolvedSquareWebsiteCatalog: vi.fn()
}));

vi.mock("@/server/admin/storefront-page-deletion-service", () => ({
  isStorefrontPageDeleted: storefrontMocks.isStorefrontPageDeleted
}));

vi.mock("@/server/admin/admin-cms-document-service", () => ({
  readLatestCmsDocument: storefrontMocks.readLatestCmsDocument
}));

vi.mock("@/server/square/website-catalog-store", () => ({
  readResolvedSquareWebsiteCatalog: storefrontMocks.readResolvedSquareWebsiteCatalog
}));

vi.mock("@/server/commerce/best-seller-store", () => ({
  readDepartmentBestSellers: storefrontMocks.readDepartmentBestSellers
}));

import { DepartmentPageTemplate } from "@/components/templates/department-page-template";

describe("department storefront publishing", () => {
  beforeEach(() => {
    storefrontMocks.isStorefrontPageDeleted.mockReset();
    storefrontMocks.isStorefrontPageDeleted.mockResolvedValue(false);
    storefrontMocks.readLatestCmsDocument.mockReset();
    storefrontMocks.readResolvedSquareWebsiteCatalog.mockReset();
    storefrontMocks.readDepartmentBestSellers.mockResolvedValue({ source: "none", variationIds: [] });
  });

  it("removes the Toys hero from a published CMS document", async () => {
    const document = createCmsPageDocument("department", "toys", {
      createdAt: "2026-07-22T12:00:00.000Z",
      updatedAt: "2026-07-22T12:00:00.000Z",
      status: "PUBLISHED",
      sections: [
        createCmsSection("hero", {
          id: "toys.hero",
          content: {
            title: "Published toy department",
            body: "This content comes from the admin publisher."
          },
          media: { image: "/images/homepage/toys-age-interest-banner-edge-to-edge-v2.webp", imageAlt: "Toys" }
        })
      ]
    });

    storefrontMocks.readLatestCmsDocument.mockResolvedValue(document);
    storefrontMocks.readResolvedSquareWebsiteCatalog.mockResolvedValue({
      catalog: {
        categories: [],
        products: []
      }
    });

    render(await DepartmentPageTemplate({ slug: "toys" }));

    expect(screen.queryByRole("heading", { level: 1, name: "Published toy department" })).toBeNull();
    expect(screen.queryByLabelText("Published toy department hero")).toBeNull();
    expect(screen.queryByText("This content comes from the admin publisher.")).toBeNull();
  });

  it("never renders seed products when the live Party catalog is unavailable", async () => {
    storefrontMocks.readLatestCmsDocument.mockResolvedValue(null);
    storefrontMocks.readResolvedSquareWebsiteCatalog.mockResolvedValue(null);

    render(await DepartmentPageTemplate({ slug: "party-supplies" }));

    expect(screen.getByLabelText("Party Supplies hero").getAttribute("data-store-variant")).toBe("contained-color");
    expect(screen.getByRole("heading", { level: 1, name: "Party Supplies" })).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Party Supplies shortcuts" }).className).toContain("department-commerce-shell");
    expect(screen.getByRole("heading", { name: "The catalog is temporarily unavailable." })).not.toBeNull();
    expect(screen.queryByText("Celebration Tableware Kit")).toBeNull();
  });
});
