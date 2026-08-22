/** Verifies focused policy editing remains compatible with the shared CMS format. */

import { describe, expect, it } from "vitest";
import { getStorePolicyDefinition } from "@/config/store-administration.config";
import {
  createStorePolicyDocument,
  readStorePolicyFields,
  updateStorePolicyDocument
} from "@/lib/cms/store-policy-document";

describe("store policy document", () => {
  it("creates an editable Terms document with a dedicated policy section", () => {
    const definition = getStorePolicyDefinition("terms")!;
    const document = createStorePolicyDocument(definition);

    expect(document).toMatchObject({ entityType: "policy", entityId: "terms", slug: "/terms" });
    expect(document.sections.map((section) => section.id)).toEqual(["policy.terms"]);
    expect(readStorePolicyFields(document, definition)).toMatchObject({
      title: "Terms & Conditions",
      footerVisible: true
    });
  });

  it("updates storefront copy and publication metadata without changing the route", () => {
    const definition = getStorePolicyDefinition("privacy")!;
    const document = createStorePolicyDocument(definition);
    const updated = updateStorePolicyDocument({
      definition,
      document,
      fields: {
        title: "Customer Privacy",
        body: "First paragraph.\n\nSecond paragraph.",
        route: "/attempted-change",
        footerVisible: false,
        effectiveAt: "2026-09-01"
      }
    });

    expect(updated.slug).toBe("/privacy-policy");
    expect(readStorePolicyFields(updated, definition)).toEqual({
      title: "Customer Privacy",
      body: "First paragraph.\n\nSecond paragraph.",
      route: "/privacy-policy",
      footerVisible: false,
      effectiveAt: "2026-09-01"
    });
  });
});
