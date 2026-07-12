import { describe, expect, it } from "vitest";
import { addCmsSection, applySectionPresetToSection, applyThemePresetToDocument, changeCmsSectionVariant, createCmsPageDocument, duplicateCmsSection, moveCmsSection, removeCmsSection, renameCmsSection, sectionPresets, setCmsSectionHidden, themePresets, updateCmsSection, updateCmsThemeOverrides } from "@/lib/cms";

describe("cms builder operations", () => {
  it("adds, duplicates, reorders and removes sections at schema level", () => {
    const document = createCmsPageDocument("landing", "builder-test", {
      createdAt: "2026-07-09T12:00:00.000Z",
      updatedAt: "2026-07-09T12:00:00.000Z",
      sections: []
    });

    const withHero = addCmsSection(document, "hero", { id: "landing.hero" });
    const withFaq = addCmsSection(withHero, "faq", { id: "landing.faq" });
    const withDuplicate = duplicateCmsSection(withFaq, "landing.hero");
    const moved = moveCmsSection(withDuplicate, "landing.faq", -1);
    const removed = removeCmsSection(moved, "landing.hero.copy");

    expect(withHero.sections.map((section) => section.id)).toEqual(["landing.hero"]);
    expect(withDuplicate.sections.map((section) => section.id)).toEqual(["landing.hero", "landing.hero.copy", "landing.faq"]);
    expect(moved.sections.map((section) => section.id)).toEqual(["landing.hero", "landing.faq", "landing.hero.copy"]);
    expect(removed.sections.map((section) => section.id)).toEqual(["landing.hero", "landing.faq"]);
    expect(removed.sections.map((section) => section.layout.sortOrder)).toEqual([10, 20]);
  });

  it("hides locked sections instead of deleting them", () => {
    const document = createCmsPageDocument("globalHeader", "main", {
      createdAt: "2026-07-09T12:00:00.000Z",
      updatedAt: "2026-07-09T12:00:00.000Z"
    });
    const lockedHeader = document.sections.find((section) => section.locked);

    expect(lockedHeader).toBeDefined();

    const updated = removeCmsSection(document, lockedHeader!.id);

    expect(updated.sections.map((section) => section.id)).toContain(lockedHeader!.id);
    expect(updated.sections.find((section) => section.id === lockedHeader!.id)?.hidden).toBe(true);
  });

  it("edits content, design, media, layout, visibility and metadata", () => {
    const document = createCmsPageDocument("landing", "edit-test", {
      createdAt: "2026-07-09T12:00:00.000Z",
      updatedAt: "2026-07-09T12:00:00.000Z",
      sections: []
    });
    const withHero = addCmsSection(document, "hero", { id: "landing.hero" });
    const edited = updateCmsSection(withHero, "landing.hero", {
      content: { title: "Edited title" },
      design: { backgroundTone: "dark" },
      layout: { alignment: "center" },
      media: { image: "/uploads/admin/hero.jpg" },
      dataSource: { type: "manual", id: "manual-hero" },
      visibility: { mobile: false },
      advanced: { anchorId: "hero" }
    });
    const renamed = renameCmsSection(edited, "landing.hero", "Hero renamed");
    const variantChanged = changeCmsSectionVariant(renamed, "landing.hero", "fullBleed");
    const hidden = setCmsSectionHidden(variantChanged, "landing.hero", true);
    const section = hidden.sections[0];

    expect(section.content.title).toBe("Edited title");
    expect(section.design.backgroundTone).toBe("dark");
    expect(section.layout.alignment).toBe("center");
    expect(section.media.image).toBe("/uploads/admin/hero.jpg");
    expect(section.dataSource.id).toBe("manual-hero");
    expect(section.visibility.mobile).toBe(false);
    expect(section.advanced.anchorId).toBe("hero");
    expect(section.label).toBe("Hero renamed");
    expect(section.variant).toBe("fullBleed");
    expect(section.hidden).toBe(true);
  });

  it("applies theme presets while preserving manual theme overrides", () => {
    const document = createCmsPageDocument("landing", "preset-test", {
      createdAt: "2026-07-09T12:00:00.000Z",
      updatedAt: "2026-07-09T12:00:00.000Z"
    });
    const withManualColor = updateCmsThemeOverrides(document, {
      colors: {
        accent: "#123456"
      }
    });
    const preset = themePresets.find((item) => item.id === "clean-marketplace")!;
    const updated = applyThemePresetToDocument(withManualColor, preset);

    expect(updated.themeOverrides?.colors?.accent).toBe("#123456");
    expect(updated.themeOverrides?.grid?.desktopColumns).toBe(4);
    expect(updated.themeOverrides?.cards?.imageRatio).toBe("1:1");
  });

  it("applies compatible section presets", () => {
    const document = createCmsPageDocument("landing", "section-preset-test", {
      createdAt: "2026-07-09T12:00:00.000Z",
      updatedAt: "2026-07-09T12:00:00.000Z",
      sections: []
    });
    const withGrid = addCmsSection(document, "productGrid", { id: "landing.products" });
    const preset = sectionPresets.find((item) => item.id === "product-grid-dense")!;
    const updated = applySectionPresetToSection(withGrid, "landing.products", preset);

    expect(updated.sections[0].layout.columns).toBe(4);
    expect(updated.sections[0].design.cardStyle).toBe("bordered");
  });
});
