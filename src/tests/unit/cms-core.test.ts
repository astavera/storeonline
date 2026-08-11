/**
 * Verifies the isolated behavior of CMS core.
 */

import { describe, expect, it } from "vitest";
import { normalizeHomepageSections } from "@/features/homepage/server";
import { defaultHomepageSeo } from "@/features/homepage";
import { homepageSections } from "@/features/homepage";
import { createCmsPageDocumentForScope, homepageSectionsToCmsPageDocument, validateCmsPageDocument } from "@/lib/cms";

describe("cms core", () => {
  it("validates a generated CMS page document", () => {
    const document = createCmsPageDocumentForScope("homepage", "home", {
      createdAt: "2026-07-09T12:00:00.000Z",
      updatedAt: "2026-07-09T12:00:00.000Z"
    });

    const result = validateCmsPageDocument(document);

    expect(result.ok).toBe(true);
    expect(result.document?.entityType).toBe("homepage");
    expect(result.document?.sections.length).toBeGreaterThan(0);
  });

  it("rejects invalid CMS page documents", () => {
    const document = createCmsPageDocumentForScope("department", "toys", {
      createdAt: "2026-07-09T12:00:00.000Z",
      updatedAt: "2026-07-09T12:00:00.000Z"
    });

    const result = validateCmsPageDocument({
      ...document,
      seo: {
        ...document.seo,
        title: ""
      },
      sections: [
        {
          ...document.sections[0],
          dataSource: {
            type: "not-real"
          }
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("seo.title"))).toBe(true);
    expect(result.errors.some((error) => error.includes("dataSource.type"))).toBe(true);
  });

  it("represents existing homepage sections as a universal CMS document", () => {
    const sections = normalizeHomepageSections(homepageSections);
    const document = homepageSectionsToCmsPageDocument({
      sections,
      seo: defaultHomepageSeo,
      now: "2026-07-09T12:00:00.000Z"
    });

    const result = validateCmsPageDocument(document);

    expect(result.ok).toBe(true);
    expect(document.sections.map((section) => section.id)).toContain("home.hero");
    expect(document.sections.find((section) => section.id === "home.featured-products")?.dataSource.type).toBe("productPlacement");
  });
});
