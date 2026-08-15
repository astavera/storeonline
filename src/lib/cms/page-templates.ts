/**
 * Provides shared page templates types and utilities for the application.
 */

import type { CmsEntityType, CmsPageDocument, CmsScope, CmsSection, SeoConfig } from "./cms-types";
import { buildCmsDocumentId, cmsScopeToEntityType, normalizeCmsEntityId } from "./cms-scopes";
import { createCmsSection } from "./section-registry";

export type CmsPageTemplateKey = CmsEntityType;

const defaultSeo: SeoConfig = {
  title: "Modern State",
  description: "Modern State / State News NYC ecommerce page.",
  ogTitle: "Modern State",
  ogDescription: "Shop Modern State / State News NYC.",
  ogImage: "",
  canonicalUrl: "",
  indexable: true
};

const templateSections: Record<CmsPageTemplateKey, CmsSection[]> = {
  homepage: [
    createCmsSection("announcementBar", { id: "home.announcement", label: "Announcement" }),
    createCmsSection("header", { id: "home.header", label: "Header", locked: true }),
    createCmsSection("hero", { id: "home.hero", label: "Homepage Hero" }),
    createCmsSection("featuredCategories", { id: "home.featured-categories", label: "Featured Categories" }),
    createCmsSection("productGrid", { id: "home.product-grid", label: "Featured Products", dataSource: { type: "productPlacement", id: "homepage-featured" } }),
    createCmsSection("promoBanner", { id: "home.promo", label: "Promo Banner" }),
    createCmsSection("benefitsIcons", { id: "home.benefits", label: "Benefits" }),
    createCmsSection("testimonials", { id: "home.testimonials", label: "Testimonials" }),
    createCmsSection("faqPreview", { id: "home.faq-preview", label: "FAQ Preview" }),
    createCmsSection("newsletter", { id: "home.newsletter", label: "Newsletter" }),
    createCmsSection("footer", { id: "home.footer", label: "Footer", locked: true })
  ],
  department: [
    createCmsSection("header", { id: "department.header", locked: true }),
    createCmsSection("hero", { id: "department.hero", label: "Department Hero", dataSource: { type: "department" } }),
    createCmsSection("collectionShowcase", { id: "department.showcase", label: "Collection Showcase", dataSource: { type: "department" } }),
    createCmsSection("productGrid", { id: "department.products", label: "Department Products", dataSource: { type: "productPlacement" } }),
    createCmsSection("localSeoContentBlock", { id: "department.local-seo", label: "Local SEO Copy" }),
    createCmsSection("faq", { id: "department.faq", label: "Department FAQ" }),
    createCmsSection("newsletter", { id: "department.newsletter" }),
    createCmsSection("footer", { id: "department.footer", locked: true })
  ],
  holiday: [
    createCmsSection("header", { id: "holiday.header", locked: true }),
    createCmsSection("holidayHero", { id: "holiday.hero", label: "Holiday Hero", dataSource: { type: "holiday" } }),
    createCmsSection("countdownPromo", { id: "holiday.countdown", label: "Countdown Promo" }),
    createCmsSection("giftGuideGrid", { id: "holiday.gift-guide", label: "Gift Guide", dataSource: { type: "holiday" } }),
    createCmsSection("seasonalCollection", { id: "holiday.collection", label: "Seasonal Collection", dataSource: { type: "productPlacement" } }),
    createCmsSection("limitedAvailabilityBanner", { id: "holiday.limited", label: "Limited Availability" }),
    createCmsSection("faq", { id: "holiday.faq" }),
    createCmsSection("footer", { id: "holiday.footer", locked: true })
  ],
  product: [
    createCmsSection("header", { id: "product.header", locked: true }),
    createCmsSection("productImageGallery", { id: "product.gallery", dataSource: { type: "squareCatalog" } }),
    createCmsSection("productTitle", { id: "product.title", dataSource: { type: "squareCatalog" } }),
    createCmsSection("productPrice", { id: "product.price", dataSource: { type: "squareCatalog" } }),
    createCmsSection("productBadges", { id: "product.badges", dataSource: { type: "squareCatalog" } }),
    createCmsSection("variantSelector", { id: "product.variants", dataSource: { type: "squareCatalog" } }),
    createCmsSection("quantitySelector", { id: "product.quantity", dataSource: { type: "squareCatalog" } }),
    createCmsSection("addToCartButton", { id: "product.add-to-cart", dataSource: { type: "squareCatalog" } }),
    createCmsSection("buyNowButton", { id: "product.buy-now", dataSource: { type: "squareCatalog" } }),
    createCmsSection("productDescription", { id: "product.description", dataSource: { type: "squareCatalog" } }),
    createCmsSection("shippingInfo", { id: "product.shipping" }),
    createCmsSection("returnsInfo", { id: "product.returns" }),
    createCmsSection("productReviews", { id: "product.reviews", dataSource: { type: "custom" } }),
    createCmsSection("relatedProducts", { id: "product.related", dataSource: { type: "relatedProducts" } }),
    createCmsSection("trustBadges", { id: "product.trust" }),
    createCmsSection("footer", { id: "product.footer", locked: true })
  ],
  location: [
    createCmsSection("header", { id: "location.header", locked: true }),
    createCmsSection("locationHero", { id: "location.hero", dataSource: { type: "locationData" } }),
    createCmsSection("storeLocationCard", { id: "location.card", dataSource: { type: "locationData" } }),
    createCmsSection("mapboxDeliveryMap", { id: "location.map", dataSource: { type: "locationData" } }),
    createCmsSection("serviceAreaGrid", { id: "location.service-area", dataSource: { type: "locationData" } }),
    createCmsSection("localSeoContentBlock", { id: "location.local-seo" }),
    createCmsSection("pickupDeliveryInfo", { id: "location.pickup-delivery" }),
    createCmsSection("faq", { id: "location.faq" }),
    createCmsSection("footer", { id: "location.footer", locked: true })
  ],
  policy: [
    createCmsSection("header", { id: "policy.header", locked: true }),
    createCmsSection("editorialStory", { id: "policy.content", label: "Policy Content", dataSource: { type: "policyContent" } }),
    createCmsSection("faq", { id: "policy.faq" }),
    createCmsSection("footer", { id: "policy.footer", locked: true })
  ],
  landing: [
    createCmsSection("header", { id: "landing.header", locked: true }),
    createCmsSection("hero", { id: "landing.hero" }),
    createCmsSection("promoBanner", { id: "landing.promo" }),
    createCmsSection("productGrid", { id: "landing.products", dataSource: { type: "productPlacement" } }),
    createCmsSection("testimonials", { id: "landing.testimonials" }),
    createCmsSection("newsletter", { id: "landing.newsletter" }),
    createCmsSection("footer", { id: "landing.footer", locked: true })
  ],
  globalHeader: [
    createCmsSection("announcementBar", { id: "global-header.announcement" }),
    createCmsSection("header", { id: "global-header.main", locked: true }),
    createCmsSection("navigationMenu", { id: "global-header.navigation" }),
    createCmsSection("megaMenu", { id: "global-header.mega-menu" }),
    createCmsSection("mobileMenu", { id: "global-header.mobile-menu" })
  ],
  globalFooter: [
    createCmsSection("newsletter", { id: "global-footer.newsletter" }),
    createCmsSection("footer", { id: "global-footer.main", locked: true }),
    createCmsSection("trustBadges", { id: "global-footer.trust" })
  ],
  theme: []
};

export function createCmsPageDocument(entityType: CmsEntityType, entityId = "default", input: Partial<CmsPageDocument> = {}): CmsPageDocument {
  const normalizedEntityId = normalizeCmsEntityId(entityId);
  const now = new Date().toISOString();
  const title = input.title ?? titleFor(entityType, normalizedEntityId);

  return {
    id: input.id ?? buildCmsDocumentId(entityType, normalizedEntityId),
    entityType,
    entityId: normalizedEntityId,
    title,
    slug: input.slug ?? slugFor(entityType, normalizedEntityId),
    seo: {
      ...defaultSeo,
      title,
      canonicalUrl: slugFor(entityType, normalizedEntityId),
      ...input.seo
    },
    themeOverrides: input.themeOverrides,
    sections: input.sections ?? cloneSections(templateSections[entityType]),
    status: input.status ?? "DRAFT",
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    publishedAt: input.publishedAt ?? null,
    version: input.version ?? 1,
    createdBy: input.createdBy,
    updatedBy: input.updatedBy
  };
}

export function createCmsPageDocumentForScope(scope: CmsScope, entityId = "default", input: Partial<CmsPageDocument> = {}) {
  return createCmsPageDocument(cmsScopeToEntityType(scope), entityId, input);
}

export function getCmsPageTemplateSections(entityType: CmsEntityType) {
  return cloneSections(templateSections[entityType]);
}

function cloneSections(sections: CmsSection[]) {
  return sections.map((section) => ({
    ...section,
    content: { ...section.content, items: section.content.items ? section.content.items.map((item) => ({ ...item })) : undefined },
    design: { ...section.design },
    layout: { ...section.layout },
    media: { ...section.media },
    dataSource: { ...section.dataSource, query: section.dataSource.query ? { ...section.dataSource.query } : undefined, manualIds: section.dataSource.manualIds ? [...section.dataSource.manualIds] : undefined },
    visibility: { ...section.visibility },
    advanced: { ...section.advanced }
  }));
}

function titleFor(entityType: CmsEntityType, entityId: string) {
  if (entityType === "homepage") {
    return "Homepage";
  }

  if (entityType === "globalHeader") {
    return "Global Header";
  }

  if (entityType === "globalFooter") {
    return "Global Footer";
  }

  if (entityType === "theme") {
    return "Global Theme";
  }

  return `${toTitle(entityType)}: ${toTitle(entityId)}`;
}

function slugFor(entityType: CmsEntityType, entityId: string) {
  if (entityType === "homepage") {
    return "/";
  }

  if (entityType === "globalHeader" || entityType === "globalFooter" || entityType === "theme") {
    return `/admin/builder/${entityType}/${entityId}`;
  }

  return `/${entityType}/${entityId}`;
}

function toTitle(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
