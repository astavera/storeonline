/**
 * Verifies the isolated behavior of homepage visual editor service.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backToSchoolHomepageImage, defaultHomepageImage, halloweenHomepageImage, homepageSections } from "@/features/homepage";
import { mergeHomepageImagePresets, mergeHomepageSections, normalizeHomepageImagePresets, normalizeHomepageSections } from "@/features/homepage/server";

describe("homepage visual editor service", () => {
  it("uses a tracked hero asset and customer-facing homepage copy", () => {
    expect(existsSync(join(process.cwd(), "public", backToSchoolHomepageImage.slice(1)))).toBe(true);
    expect(existsSync(join(process.cwd(), "public", halloweenHomepageImage.slice(1)))).toBe(true);
    expect(homepageSections[0]).toMatchObject({
      variant: "seasonal-card",
      isVisible: true,
      backgroundImage: halloweenHomepageImage,
      textPosition: "left"
    });
    expect(JSON.stringify(homepageSections)).not.toMatch(/Square-ready|backend validation|capacity points/i);
  });

  it("keeps visible sections ordered by sort order", () => {
    const [hero, departments] = homepageSections;
    const normalized = normalizeHomepageSections([
      { ...departments, sortOrder: 20 },
      { ...hero, sortOrder: 10 }
    ]);

    expect(normalized.map((section) => section.sectionId)).toEqual(["home.hero", "home.departments"]);
  });

  it("merges visual editor changes onto the safe base homepage sections", () => {
    const merged = mergeHomepageSections(homepageSections, [
      {
        ...homepageSections[0],
        title: "Edited hero",
        backgroundImage: "https://example.com/hero.jpg",
        textPosition: "center"
      }
    ]);

    expect(merged[0].title).toBe("Edited hero");
    expect(merged[0].backgroundImage).toBe("https://example.com/hero.jpg");
    expect(merged[0].textPosition).toBe("center");
    expect(merged.map((section) => section.sectionId)).toContain("home.departments");
  });

  it("preserves no-code custom sections from the visual editor", () => {
    const merged = mergeHomepageSections(homepageSections, [
      ...homepageSections,
      {
        sectionId: "home.custom.feature-grid.test",
        sectionType: "feature-grid",
        title: "Editable service cards",
        body: "A custom no-code section added from the admin builder.",
        variant: "feature-grid",
        sortOrder: 60,
        isVisible: true,
        backgroundTone: "muted",
        columns: 3,
        items: [
          {
            id: "pickup",
            title: "Pickup",
            body: "A fully editable card."
          }
        ]
      }
    ]);

    expect(merged.map((section) => section.sectionId)).toContain("home.custom.feature-grid.test");
    expect(merged.find((section) => section.sectionId === "home.custom.feature-grid.test")?.items?.[0]?.title).toBe("Pickup");
  });

  it("preserves editable card images and alt text", () => {
    const merged = mergeHomepageSections(homepageSections, [
      {
        ...homepageSections[1],
        items: [
          {
            id: "toys",
            title: "Toys",
            body: "Editable department card.",
            href: "/toys",
            image: "/uploads/admin/toys.jpg",
            imageAlt: "Toy display",
            productSlug: "premium-building-set",
            squareVariationId: "seed-toy-building-set"
          }
        ]
      }
    ]);

    const departments = merged.find((section) => section.sectionId === "home.departments");

    expect(departments?.items?.[0]?.image).toBe("/uploads/admin/toys.jpg");
    expect(departments?.items?.[0]?.imageAlt).toBe("Toy display");
    expect(departments?.items?.[0]?.productSlug).toBe("premium-building-set");
    expect(departments?.items?.[0]?.squareVariationId).toBe("seed-toy-building-set");
  });

  it("migrates legacy Halloween promo cards to the three required hero slides", () => {
    const legacyCards = [
      { id: "manual", title: "Manual", href: "/stationery", image: "/images/category-stationery.svg", linkType: "manual" as const, tone: "yellow" as const, presentation: "cutout" as const },
      { id: "brand", title: "Crayola", href: "/shop?brand=crayola", linkType: "brand" as const, linkValue: "crayola", tone: "cyan" as const },
      { id: "category", title: "Arts", href: "/shop?department=arts-and-crafts", linkType: "category" as const, linkValue: "arts-and-crafts", tone: "green" as const },
      { id: "product", title: "Building set", href: "/products/premium-building-set", linkType: "product" as const, linkValue: "premium-building-set", tone: "red" as const, productSlug: "premium-building-set", squareVariationId: "seed-toy-building-set" }
    ];
    const merged = mergeHomepageSections(homepageSections, [{ ...homepageSections[0], items: legacyCards }]);
    const hero = merged.find((section) => section.sectionId === "home.hero");

    expect(hero?.items).toHaveLength(3);
    expect(hero?.items?.every((item) => Boolean(item.image))).toBe(true);
    expect(hero?.items?.map((item) => item.id)).toEqual([
      "halloween-slide-1",
      "halloween-slide-2",
      "halloween-slide-3"
    ]);
  });

  it("keeps the toys shortcuts editable in the toys callout", () => {
    const toysCallout = homepageSections.find((section) => section.sectionId === "home.toys-callout");

    expect(toysCallout?.items?.map((item) => item.title)).toEqual([
      "Shop All Toys",
      "Shop By Age",
      "Shop Trending"
    ]);
    expect(toysCallout?.hiddenElements ?? []).not.toContain("items");
  });

  it("preserves both hero button links and the selected hero size", () => {
    const merged = mergeHomepageSections(homepageSections, [{
      ...homepageSections[0],
      ctaLabel: "Shop Crayola",
      ctaHref: "/shop?brand=crayola",
      secondaryCtaLabel: "Browse arts",
      secondaryCtaHref: "/shop?department=arts-and-crafts",
      heroSize: "compact"
    }]);
    const hero = merged.find((section) => section.sectionId === "home.hero");

    expect(hero).toMatchObject({
      ctaLabel: "Shop Crayola",
      ctaHref: "/shop?brand=crayola",
      secondaryCtaLabel: "Browse arts",
      secondaryCtaHref: "/shop?department=arts-and-crafts",
      heroSize: "compact"
    });
  });

  it("migrates legacy Halloween rows into reusable seasonal product rows", () => {
    const seasonalRow = homepageSections.find(
      (section) => section.sectionId === "home.seasonal-products-row-1"
    );

    expect(seasonalRow).toBeDefined();

    const merged = mergeHomepageSections(homepageSections, [
      {
        ...seasonalRow!,
        sectionId: "home.halloween-categories-row-1",
        title: "Halloween Costumes",
        variant: "halloween-category-carousel",
        items: [
          {
            id: "legacy-demo",
            title: "Demo category",
            href: "/shop",
            linkType: "page"
          },
          {
            id: "selected-product",
            title: "Selected product",
            href: "/products/catalog-product",
            linkType: "product",
            linkValue: "catalog-product",
            productSlug: "catalog-product",
            squareVariationId: "square-variation"
          }
        ]
      }
    ]);
    const migratedRows = merged.filter(
      (section) => section.sectionId === "home.seasonal-products-row-1"
    );

    expect(migratedRows).toHaveLength(1);
    expect(migratedRows[0]).toMatchObject({
      title: "Seasonal Category 1",
      variant: "seasonal-product-carousel"
    });
    expect(migratedRows[0].items).toEqual([
      expect.objectContaining({
        id: "selected-product",
        squareVariationId: "square-variation"
      })
    ]);
    expect(
      merged.some(
        (section) => section.sectionId === "home.halloween-categories-row-1"
      )
    ).toBe(false);
  });

  it("preserves the category selected for the new and trending carousel", () => {
    const newTrending = homepageSections.find(
      (section) => section.sectionId === "home.new-trending"
    );

    expect(newTrending).toBeDefined();

    const normalized = normalizeHomepageSections([
      {
        ...newTrending!,
        categorySlug: "  arts-and-crafts  "
      }
    ]);

    expect(normalized[0]).toMatchObject({
      sectionId: "home.new-trending",
      categorySlug: "arts-and-crafts",
      variant: "new-trending-carousel"
    });
  });

  it("keeps editable photo presets usable with fallback images", () => {
    const presets = normalizeHomepageImagePresets([
      { id: "hero", label: "Hero", url: "" },
      { id: "hero", label: "", url: "https://example.com/photo.jpg" }
    ]);

    expect(presets).toEqual([
      { id: "hero", label: "Hero", url: defaultHomepageImage },
      { id: "hero-2", label: "Photo 2", url: "https://example.com/photo.jpg" }
    ]);
  });

  it("removes retired campaign photos without deleting saved uploads", () => {
    const merged = mergeHomepageImagePresets(
      [
        { id: "storefront", label: "Storefront", url: "/images/storefront.jpg" },
        { id: "halloween", label: "Halloween", url: halloweenHomepageImage }
      ],
      [{ id: "custom", label: "My saved photo", url: "/uploads/admin/custom.jpg" }]
    );

    expect(merged.map((preset) => preset.id)).toEqual(["custom"]);
  });
});
