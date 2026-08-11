/**
 * Verifies the isolated behavior of navigation.
 */

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

  it("restores one visible About Us link after Holidays in saved CMS navigation", () => {
    const normalized = normalizeHeaderNavigation({
      ...defaultHeaderNavigation,
      primary: [
        ...defaultHeaderNavigation.primary,
        {
          id: "about-us",
          label: "About Us",
          href: "/about",
          visible: true
        }
      ]
    });

    const aboutLinks = normalized.primary.filter(
      (link) => link.id === "about-us" || link.href === "/about"
    );
    const holidaysIndex = normalized.primary.findIndex((link) => link.href === "/holidays");

    expect(aboutLinks).toEqual([
      {
        id: "about-us",
        label: "About Us",
        href: "/about",
        visible: true
      }
    ]);
    expect(normalized.primary[holidaysIndex + 1]).toEqual(aboutLinks[0]);
    expect(normalized.primary.every((link) => link.href.startsWith("/"))).toBe(true);
  });
});
