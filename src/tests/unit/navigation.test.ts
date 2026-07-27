import { describe, expect, it } from "vitest";
import { defaultHeaderNavigation, normalizeHeaderNavigation } from "@/config/header-navigation.config";

describe("navigation", () => {
  it("keeps the public header aligned with the routes rendered by SiteHeader", () => {
    const visibleLinks = defaultHeaderNavigation.primary.filter((link) => link.visible);

    expect(visibleLinks.map((link) => link.href)).toEqual([
      "/shop",
      "/balloons",
      "/toys",
      "/party-supplies",
      "/holidays",
      "/about"
    ]);
  });

  it("normalizes CMS navigation while preserving explicit visibility", () => {
    const normalized = normalizeHeaderNavigation({
      ...defaultHeaderNavigation,
      primary: defaultHeaderNavigation.primary.map((link) =>
        link.id === "about-us" ? { ...link, visible: false } : link
      )
    });

    expect(normalized.primary.find((link) => link.id === "about-us")?.visible).toBe(false);
    expect(normalized.primary.every((link) => link.href.startsWith("/"))).toBe(true);
  });
});
