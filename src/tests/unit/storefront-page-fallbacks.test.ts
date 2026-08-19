/** Verifies code-native storefront pages stay aligned with the CMS preview. */

import { describe, expect, it } from "vitest";
import { storefrontEditablePages } from "@/config/storefront-pages.config";
import {
  createCmsSection,
  createStorefrontEditorFallbackDocument,
  shouldUseStorefrontEditorFallbackDocument
} from "@/lib/cms";

describe("storefront page editor fallbacks", () => {
  it("uses the current seven-image catalog experience for Balloons", () => {
    const page = storefrontEditablePages.find((candidate) => candidate.route === "/balloons");
    expect(page).toBeTruthy();

    const document = createStorefrontEditorFallbackDocument({
      editablePage: page,
      entityId: "balloons",
      scope: "department"
    });

    expect(document.sections.map((section) => section.id)).toEqual(["balloons.catalog-gate"]);
    expect(document.sections[0]?.variant).toBe("balloon-catalog-gate");
  });

  it("replaces the legacy Balloons builder document", () => {
    const page = storefrontEditablePages.find((candidate) => candidate.route === "/balloons");
    expect(page).toBeTruthy();

    const current = createStorefrontEditorFallbackDocument({
      editablePage: page,
      entityId: "balloons",
      scope: "department"
    });
    const legacy = {
      ...current,
      sections: [createCmsSection("hero", { id: "balloons.landing-hero" })]
    };

    expect(shouldUseStorefrontEditorFallbackDocument({ document: legacy, editablePage: page })).toBe(true);
  });
});
