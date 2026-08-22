/** Verifies that storefront dropdowns are built from editable website categories. */

import { describe, expect, it } from "vitest";
import { createDefaultWebsiteMerchandising } from "@/features/catalog/services/website-merchandising-service";
import {
  createStorefrontDepartmentOptions,
  createStorefrontDepartmentMenus,
  departmentMenuForNavigationLink
} from "@/features/catalog/services/storefront-navigation-menu-service";
import { upgradeStorefrontNavigationTaxonomy } from "@/features/catalog/services/storefront-navigation-taxonomy";

describe("storefront navigation categories", () => {
  it("adds missing legacy dropdown entries to the editable category taxonomy once", () => {
    const initial = createDefaultWebsiteMerchandising([], "2026-08-19T12:00:00.000Z");
    const upgraded = upgradeStorefrontNavigationTaxonomy(initial);

    expect(upgraded.navigationCategorySeedVersion).toBe(1);
    expect(upgraded.categories.find((category) => category.slug === "toys")).toMatchObject({ visible: true });
    expect(upgraded.categories.find((category) => category.slug === "board-games")).toMatchObject({ name: "Board Games" });
    expect(upgraded.categories.find((category) => category.slug === "party-supplies")).toMatchObject({ visible: true });
    expect(upgraded.categories.find((category) => category.slug === "toy-story")).toMatchObject({ kind: "party-theme" });
    expect(upgraded.categories.find((category) => category.slug === "spoons")).toMatchObject({ kind: "party-product-type" });

    const withoutBoardGames = {
      ...upgraded,
      categories: upgraded.categories.filter((category) => category.slug !== "board-games")
    };
    expect(upgradeStorefrontNavigationTaxonomy(withoutBoardGames).categories.some((category) => category.slug === "board-games")).toBe(false);
  });

  it("reflects admin names, visibility, hierarchy, order, and category kinds in menu links", () => {
    const upgraded = upgradeStorefrontNavigationTaxonomy(
      createDefaultWebsiteMerchandising([], "2026-08-19T12:00:00.000Z")
    );
    const categories = upgraded.categories.map((category) => {
      if (category.slug === "outdoor") return { ...category, visible: false };
      if (category.slug === "dolls") return { ...category, name: "Dolls & Figures", sortOrder: 0 };
      return category;
    });
    const menus = createStorefrontDepartmentMenus(categories);

    expect(menus.toys.items?.some((item) => item.label === "Outdoor")).toBe(false);
    expect(menus.toys.items?.find((item) => item.label === "Dolls & Figures")?.href).toBe("/toys?category=dolls#catalog");
    expect(menus["party-supplies"].groups?.find((group) => group.label === "Themes")?.items)
      .toContainEqual({ label: "Toy Story", href: "/party-supplies?theme=toy-story#catalog" });
    expect(departmentMenuForNavigationLink(menus, { id: "custom-toys-link", href: "/toys" })).toBe(menus.toys);
  });

  it("offers visible top-level categories as navbar departments with storefront-safe routes", () => {
    const upgraded = upgradeStorefrontNavigationTaxonomy(
      createDefaultWebsiteMerchandising([], "2026-08-19T12:00:00.000Z")
    );
    const options = createStorefrontDepartmentOptions([
      ...upgraded.categories,
      {
        id: "web-category-stationery",
        name: "Stationery",
        slug: "stationery",
        description: "",
        imageUrl: "",
        imageAlt: "",
        parentId: null,
        visible: true,
        sortOrder: 3
      },
      {
        id: "web-category-balloons",
        name: "Balloons",
        slug: "balloons",
        description: "",
        imageUrl: "",
        imageAlt: "",
        parentId: null,
        visible: true,
        sortOrder: 4
      },
      {
        id: "web-category-hidden",
        name: "Hidden department",
        slug: "hidden-department",
        description: "",
        imageUrl: "",
        imageAlt: "",
        parentId: null,
        visible: false,
        sortOrder: 5
      }
    ]);

    expect(options).toEqual(expect.arrayContaining([
      { id: "toys", label: "Toys", href: "/toys" },
      { id: "party-supplies", label: "Party Supplies", href: "/party-supplies" },
      { id: "balloons", label: "Balloons", href: "/balloons" },
      { id: "stationery", label: "Stationery", href: "/categories/stationery" }
    ]));
    expect(options.some((option) => option.id === "hidden-department")).toBe(false);
  });
});
