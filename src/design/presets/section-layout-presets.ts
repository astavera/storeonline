/**
 * Defines the reusable section layout presets preset for the storefront design system.
 */

export type SectionLayoutPresetId =
  | "homepage-hero-split-image"
  | "homepage-hero-centered"
  | "department-hero"
  | "holiday-hero"
  | "category-grid"
  | "featured-products"
  | "product-carousel"
  | "balloon-builder"
  | "delivery-checker"
  | "trust-badges"
  | "promotion-banner"
  | "editorial-content"
  | "faq"
  | "policy-content"
  | "location-card-section";

export const sectionLayoutPresets: Record<SectionLayoutPresetId, string> = {
  "homepage-hero-split-image": "min-h-[520px] items-end bg-cover bg-center",
  "homepage-hero-centered": "min-h-[460px] items-center text-center",
  "department-hero": "min-h-[360px] items-end bg-cover bg-center",
  "holiday-hero": "min-h-[360px] items-end bg-cover bg-center",
  "category-grid": "py-16",
  "featured-products": "py-16",
  "product-carousel": "py-14",
  "balloon-builder": "py-12",
  "delivery-checker": "py-12",
  "trust-badges": "py-10",
  "promotion-banner": "py-8",
  "editorial-content": "py-16",
  faq: "py-14",
  "policy-content": "py-12",
  "location-card-section": "py-14"
};
