import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createCmsPageDocument, createCmsSection } from "@/lib/cms";

const storefrontMocks = vi.hoisted(() => ({
  readLatestCmsDocument: vi.fn(),
  readResolvedSquareWebsiteCatalog: vi.fn()
}));

vi.mock("@/server/admin/admin-cms-document-service", () => ({
  readLatestCmsDocument: storefrontMocks.readLatestCmsDocument
}));

vi.mock("@/server/square/website-catalog-store", () => ({
  readResolvedSquareWebsiteCatalog: storefrontMocks.readResolvedSquareWebsiteCatalog
}));

import { DepartmentPageTemplate } from "@/components/templates/department-page-template";

describe("department storefront publishing", () => {
  it("keeps the published CMS page when the Square catalog is available", async () => {
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
          }
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

    expect(screen.getByRole("heading", { level: 1, name: "Published toy department" })).not.toBeNull();
    expect(screen.getByText("This content comes from the admin publisher.")).not.toBeNull();
  });
});
