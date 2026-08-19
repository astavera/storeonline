/**
 * Verifies storefront page deletion guards and tombstone validation.
 */

import { describe, expect, it } from "vitest";
import {
  canDeleteStorefrontPage,
  isStorefrontPageDeletionPayload,
  storefrontPageDeletionKey
} from "@/server/admin/storefront-page-deletion-service";

describe("storefront page deletion", () => {
  it("allows editable content pages and protects core or operational entities", () => {
    expect(canDeleteStorefrontPage("landing", "upper-east-side-gifts")).toBe(true);
    expect(canDeleteStorefrontPage("department", "toys")).toBe(true);
    expect(canDeleteStorefrontPage("homepage", "home")).toBe(false);
    expect(canDeleteStorefrontPage("product", "square-product")).toBe(false);
    expect(canDeleteStorefrontPage("globalHeader", "main")).toBe(false);
  });

  it("builds stable selector keys", () => {
    expect(storefrontPageDeletionKey("policy", "shipping")).toBe("policy:shipping");
  });

  it("accepts only explicit deletion tombstones", () => {
    expect(isStorefrontPageDeletionPayload({
      deleted: true,
      deletedAt: "2026-08-18T12:00:00.000Z",
      entityId: "about",
      entityType: "landing",
      title: "About Us"
    })).toBe(true);
    expect(isStorefrontPageDeletionPayload({
      deleted: false,
      deletedAt: "2026-08-18T12:00:00.000Z",
      entityId: "about",
      entityType: "landing",
      title: "About Us"
    })).toBe(false);
    expect(isStorefrontPageDeletionPayload({
      deleted: true,
      deletedAt: "2026-08-18T12:00:00.000Z",
      entityId: "home",
      entityType: "homepage",
      title: "Home"
    })).toBe(false);
  });
});
