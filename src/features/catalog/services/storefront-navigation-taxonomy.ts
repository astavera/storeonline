/**
 * Bootstraps the editable website categories that back storefront department menus.
 * Existing categories always win; this migration only fills missing records once.
 */

import { createPartyMerchandisingStructure } from "@/features/catalog/services/party-merchandising-service";
import {
  orderWebsiteCategories,
  type WebsiteCategory,
  type WebsiteMerchandisingConfig
} from "@/features/catalog/services/website-merchandising-service";

export const STOREFRONT_NAVIGATION_CATEGORY_SEED_VERSION = 1;

const toyCategorySeeds = [
  ["outdoor", "Outdoor"],
  ["building-toys", "Building Toys"],
  ["dolls", "Dolls"],
  ["pretend-play", "Pretend Play"],
  ["stem-and-learning", "STEM & Learning"],
  ["plush-toys", "Plush Toys"],
  ["vehicles", "Vehicles"],
  ["arts-and-craft", "Arts & Craft"],
  ["sports", "Sports"],
  ["bath-toys", "Bath Toys"],
  ["board-games", "Board Games"]
] as const;

export function upgradeStorefrontNavigationTaxonomy(
  config: WebsiteMerchandisingConfig
): WebsiteMerchandisingConfig {
  if (
    (config.navigationCategorySeedVersion ?? 0) >=
    STOREFRONT_NAVIGATION_CATEGORY_SEED_VERSION
  ) {
    return config;
  }

  const toys = ensureToyCategories(config.categories);
  const party = createPartyMerchandisingStructure(toys.categories);

  return {
    ...config,
    navigationCategorySeedVersion: STOREFRONT_NAVIGATION_CATEGORY_SEED_VERSION,
    categories: orderWebsiteCategories(party.categories)
  };
}

export function ensureToyCategories(categories: WebsiteCategory[]) {
  const next = [...categories];
  const createdIds: string[] = [];
  const root = ensureCategory(next, {
    id: "web-category-toys",
    name: "Toys",
    slug: "toys",
    parentId: null,
    sortOrder: next.filter((category) => category.parentId === null).length
  }, createdIds);

  toyCategorySeeds.forEach(([slug, name], sortOrder) => {
    ensureCategory(next, {
      id: `web-category-toys-${slug}`,
      name,
      slug,
      parentId: root.id,
      sortOrder
    }, createdIds);
  });

  return {
    categories: orderWebsiteCategories(next),
    createdIds,
    rootId: root.id
  };
}

function ensureCategory(
  categories: WebsiteCategory[],
  seed: Pick<WebsiteCategory, "id" | "name" | "slug" | "parentId" | "sortOrder">,
  createdIds: string[]
) {
  const existing = categories.find(
    (category) => category.id === seed.id || category.slug === seed.slug
  );
  if (existing) return existing;

  const category: WebsiteCategory = {
    ...seed,
    description: "",
    imageUrl: "",
    imageAlt: "",
    visible: true,
    kind: "standard",
    recommendationTerms: [],
    swatchColor: ""
  };
  categories.push(category);
  createdIds.push(category.id);
  return category;
}
