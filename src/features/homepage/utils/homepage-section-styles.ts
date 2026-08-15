/**
 * Maps homepage section settings to stable section types and presentation classes.
 */

import type {
  HomepageSectionConfig,
  HomepageSectionElement
} from "@/features/homepage/config/homepage.config";

export function getHomepageHeroCardPositionClass(section: HomepageSectionConfig) {
  if (section.textPosition === "center") {
    return "mx-auto text-center";
  }

  if (section.textPosition === "right") {
    return "ml-auto text-right";
  }

  return "mr-auto text-left";
}

export function getHomepageTextPositionClass(section: HomepageSectionConfig) {
  if (section.textPosition === "center") {
    return "mx-auto text-center";
  }

  if (section.textPosition === "right") {
    return "ml-auto text-right";
  }

  return "text-left";
}

export function getHomepageTextWidthClass(section: HomepageSectionConfig) {
  return section.textPosition === "center"
    ? "mx-auto"
    : section.textPosition === "right"
      ? "ml-auto"
      : "";
}

export function getHomepageSectionType(
  section: HomepageSectionConfig
): NonNullable<HomepageSectionConfig["sectionType"]> {
  if (section.sectionType) {
    return section.sectionType;
  }

  if (section.sectionId === "home.hero") {
    return "hero";
  }

  if (section.sectionId === "home.departments") {
    return "departments";
  }

  if (
    section.sectionId === "home.featured-products" ||
    section.sectionId === "home.toys-featured-products"
  ) {
    return "product-grid";
  }

  if (section.sectionId === "home.balloon-promo") {
    return "promo";
  }

  if (
    section.sectionId === "home.party-supplies-callout" ||
    section.sectionId === "home.toys-callout"
  ) {
    return "promo";
  }

  if (section.sectionId === "home.local-storefront") {
    return "storefront";
  }

  return "content";
}

export function isHomepageSectionElementVisible(
  section: HomepageSectionConfig,
  element: HomepageSectionElement
) {
  return !section.hiddenElements?.includes(element);
}

export function getHomepageSectionPaddingClass(section: HomepageSectionConfig) {
  if (section.verticalPadding === "compact") {
    return "py-8";
  }

  if (section.verticalPadding === "spacious") {
    return "py-20";
  }

  return "py-14";
}

export function getHomepageSectionToneClass(section: HomepageSectionConfig) {
  if (section.backgroundTone === "muted") {
    return "bg-surface-muted";
  }

  if (section.backgroundTone === "brand" || section.backgroundTone === "dark") {
    return "bg-primary text-white";
  }

  if (section.backgroundTone === "accent") {
    return "bg-[rgba(255,221,87,0.18)]";
  }

  return "bg-surface";
}

export function getHomepageSectionContentWidthClass(
  section: HomepageSectionConfig
) {
  if (section.contentWidth === "narrow") {
    return "max-w-3xl";
  }

  if (section.contentWidth === "normal") {
    return "max-w-5xl";
  }

  return "";
}

export function getHomepageSectionColumnsClass(section: HomepageSectionConfig) {
  if (section.columns === 2) {
    return "md:grid-cols-2";
  }

  if (section.columns === 4) {
    return "md:grid-cols-2 lg:grid-cols-4";
  }

  return "md:grid-cols-3";
}
