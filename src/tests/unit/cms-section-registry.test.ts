/**
 * Verifies the isolated behavior of CMS section registry.
 */

import { describe, expect, it } from "vitest";
import { createUnknownSectionFallback, isSectionCompatibleWithScope, resolveSectionRegistryItem, sectionRegistry, type CmsKnownSectionType } from "@/lib/cms";

const requiredSectionTypes = [
  "announcementBar",
  "header",
  "navigationMenu",
  "megaMenu",
  "footer",
  "breadcrumbs",
  "layoutContainer",
  "mobileMenu",
  "floatingElements",
  "hero",
  "heroCarousel",
  "featuredCategories",
  "featuredProducts",
  "collectionShowcase",
  "promoBanner",
  "brandStory",
  "benefitsIcons",
  "testimonials",
  "beforeAfter",
  "socialFeed",
  "newsletter",
  "faqPreview",
  "blogPreview",
  "logoCloud",
  "videoSection",
  "customHtml",
  "spacer",
  "divider",
  "productGrid",
  "productCarousel",
  "featuredCollection",
  "departmentShowcase",
  "holidayCollection",
  "bestSellers",
  "newArrivals",
  "recentlyViewed",
  "productBundle",
  "upsellStrip",
  "cartUpsell",
  "productCard",
  "productImageGallery",
  "productTitle",
  "productPrice",
  "productBadges",
  "variantSelector",
  "quantitySelector",
  "addToCartButton",
  "buyNowButton",
  "productDescription",
  "productSpecs",
  "shippingInfo",
  "returnsInfo",
  "productReviews",
  "relatedProducts",
  "stockIndicator",
  "sizeGuide",
  "trustBadges",
  "deliveryZoneChecker",
  "storeLocationCard",
  "locationHero",
  "localSeoContentBlock",
  "sameDayDeliveryBanner",
  "pickupDeliveryInfo",
  "serviceAreaGrid",
  "mapboxDeliveryMap",
  "holidayHero",
  "countdownPromo",
  "giftGuideGrid",
  "occasionCards",
  "seasonalCollection",
  "limitedAvailabilityBanner",
  "preorderCta",
  "reviews",
  "trustBar",
  "faq",
  "returnPolicyHighlight",
  "secureCheckoutBadges",
  "squarePaymentTrust",
  "shippingDeliveryPromise",
  "editorialStory",
  "imageWithText",
  "splitMedia",
  "lookbookGrid",
  "founderNote",
  "pressMentions",
  "newsletterCta",
  "searchOverlay",
  "filterSidebar",
  "sortDropdown",
  "emptyState",
  "modalPopup",
  "cookieBanner",
  "customCodeEmbed"
] satisfies CmsKnownSectionType[];

describe("cms section registry", () => {
  it("registers every required builder section type", () => {
    const registeredTypes = new Set(sectionRegistry.map((section) => section.type));

    for (const sectionType of requiredSectionTypes) {
      expect(registeredTypes.has(sectionType)).toBe(true);
    }
  });

  it("resolves known sections with safe defaults and settings", () => {
    const hero = resolveSectionRegistryItem("hero");
    const productGrid = resolveSectionRegistryItem("productGrid");

    expect(hero?.supportsInlineEditing).toBe(true);
    expect(hero?.supportsMedia).toBe(true);
    expect(hero?.variants.map((variant) => variant.id)).toContain("splitMedia");
    expect(productGrid?.supportsDataSource).toBe(true);
    expect(productGrid?.settingsSchema.dataSource?.length).toBeGreaterThan(0);
  });

  it("exposes scope compatibility", () => {
    expect(isSectionCompatibleWithScope("holidayHero", "holiday")).toBe(true);
    expect(isSectionCompatibleWithScope("productImageGallery", "homepage")).toBe(false);
  });

  it("fails safely for unknown section types", () => {
    const unknown = resolveSectionRegistryItem("unknownFeature");
    const fallback = createUnknownSectionFallback({
      id: "section.test",
      type: "unknownFeature",
      label: "Unknown Feature"
    });

    expect(unknown).toBeNull();
    expect(fallback.type).toBe("emptyState");
    expect(fallback.content.body).toContain("unknownFeature");
  });
});
