import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backToSchoolHomepageImage, defaultHomepageImage, homepageSections } from "@/config/homepage.config";
import { mergeHomepageSections, normalizeHomepageImagePresets, normalizeHomepageSections } from "@/features/admin/services/homepage-visual-editor-service";

describe("homepage visual editor service", () => {
  it("uses a tracked hero asset and customer-facing homepage copy", () => {
    expect(existsSync(join(process.cwd(), "public", backToSchoolHomepageImage.slice(1)))).toBe(true);
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

  it("preserves the four homepage promotional card destinations and colors", () => {
    const cards = [
      { id: "manual", title: "Manual", href: "/stationery", image: "/images/category-stationery.svg", linkType: "manual" as const, tone: "yellow" as const, presentation: "cutout" as const },
      { id: "brand", title: "Crayola", href: "/shop?brand=crayola", linkType: "brand" as const, linkValue: "crayola", tone: "cyan" as const },
      { id: "category", title: "Arts", href: "/shop?department=arts-and-crafts", linkType: "category" as const, linkValue: "arts-and-crafts", tone: "green" as const },
      { id: "product", title: "Building set", href: "/products/premium-building-set", linkType: "product" as const, linkValue: "premium-building-set", tone: "red" as const, productSlug: "premium-building-set", squareVariationId: "seed-toy-building-set" }
    ];
    const merged = mergeHomepageSections(homepageSections, [{ ...homepageSections[0], items: cards }]);
    const hero = merged.find((section) => section.sectionId === "home.hero");

    expect(hero?.items).toHaveLength(4);
    expect(hero?.items).toEqual(cards);
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
});
