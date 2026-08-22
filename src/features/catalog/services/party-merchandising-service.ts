/**
 * Defines the Party Supplies merchandising taxonomy and recommendation rules.
 * Suggestions never publish products; Admin applies them to the existing draft.
 */

import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import {
  orderWebsiteCategories,
  type WebsiteCategory,
  type WebsiteCategoryKind
} from "@/features/catalog/services/website-merchandising-service";

export const partyCategoryKinds = ["party-theme", "party-product-type", "party-solid-color"] as const;
export type PartyCategoryKind = (typeof partyCategoryKinds)[number];

export type PartyProductRecommendation = {
  squareVariationId: string;
  confidence: number;
  reasons: string[];
  categoryIds: string[];
};

type PartyCategorySeed = {
  id: string;
  name: string;
  slug: string;
  kind: WebsiteCategoryKind;
  recommendationTerms?: string[];
  swatchColor?: string;
  visible: boolean;
};

const groupSeeds: PartyCategorySeed[] = [
  { id: "web-category-party-solid-colors", name: "Solid Colors", slug: "solid-colors", kind: "party-group", visible: true },
  { id: "web-category-party-themes", name: "Themes", slug: "themes", kind: "party-group", visible: true },
  { id: "web-category-party-product-types", name: "Product Types", slug: "product-types", kind: "party-group", visible: true }
];

const solidColorSeeds: PartyCategorySeed[] = [
  { id: "web-category-party-solid-white", name: "White", slug: "solid-white", kind: "party-solid-color", recommendationTerms: ["white"], swatchColor: "#F2F1EC", visible: true },
  { id: "web-category-party-solid-black", name: "Black", slug: "solid-black", kind: "party-solid-color", recommendationTerms: ["black"], swatchColor: "#252629", visible: true },
  { id: "web-category-party-solid-red", name: "Red", slug: "solid-red", kind: "party-solid-color", recommendationTerms: ["red"], swatchColor: "#D94149", visible: true },
  { id: "web-category-party-solid-royal-blue", name: "Royal Blue", slug: "solid-royal-blue", kind: "party-solid-color", recommendationTerms: ["royal blue"], swatchColor: "#245CA9", visible: true },
  { id: "web-category-party-solid-light-blue", name: "Light Blue", slug: "solid-light-blue", kind: "party-solid-color", recommendationTerms: ["light blue", "lt blue"], swatchColor: "#86C7E6", visible: true },
  { id: "web-category-party-solid-pink", name: "Pink", slug: "solid-pink", kind: "party-solid-color", recommendationTerms: ["pink", "blush"], swatchColor: "#E99BBB", visible: true },
  { id: "web-category-party-solid-yellow", name: "Yellow", slug: "solid-yellow", kind: "party-solid-color", recommendationTerms: ["yellow"], swatchColor: "#F2CD43", visible: true },
  { id: "web-category-party-solid-green", name: "Green", slug: "solid-green", kind: "party-solid-color", recommendationTerms: ["green"], swatchColor: "#3D925C", visible: true },
  { id: "web-category-party-solid-purple", name: "Purple", slug: "solid-purple", kind: "party-solid-color", recommendationTerms: ["purple"], swatchColor: "#7858A9", visible: true },
  { id: "web-category-party-solid-gold", name: "Gold", slug: "solid-gold", kind: "party-solid-color", recommendationTerms: ["gold"], swatchColor: "#C69C36", visible: true }
];

const themeSeeds: PartyCategorySeed[] = [
  { id: "web-category-party-theme-disney", name: "Disney", slug: "disney", kind: "party-theme", recommendationTerms: ["disney"], visible: true },
  { id: "web-category-party-theme-cars", name: "Cars", slug: "cars", kind: "party-theme", recommendationTerms: ["cars", "disney cars", "lightning mcqueen"], visible: true },
  { id: "web-category-party-theme-princess", name: "Princess", slug: "princess", kind: "party-theme", recommendationTerms: ["princess"], visible: true },
  { id: "web-category-party-theme-toy-story", name: "Toy Story", slug: "toy-story", kind: "party-theme", recommendationTerms: ["toy story", "woody", "buzz lightyear"], visible: true },
  { id: "web-category-party-theme-sweet-16", name: "Sweet 16", slug: "sweet-16", kind: "party-theme", recommendationTerms: ["sweet 16", "sweet sixteen"], visible: true },
  { id: "web-category-party-theme-21st-birthday", name: "21st Birthday", slug: "21st-birthday", kind: "party-theme", recommendationTerms: ["21st birthday", "21 birthday"], visible: true },
  { id: "web-category-party-theme-retirement", name: "Retirement", slug: "retirement", kind: "party-theme", recommendationTerms: ["retirement", "retired"], visible: true },
  { id: "web-category-party-theme-just-engaged", name: "Just Engaged", slug: "just-engaged", kind: "party-theme", recommendationTerms: ["just engaged", "engagement"], visible: true },
  { id: "web-category-party-theme-bachelorette", name: "Bachelorette", slug: "bachelorette", kind: "party-theme", recommendationTerms: ["bachelorette"], visible: true },
  { id: "web-category-party-theme-happy-birthday", name: "Happy Birthday", slug: "happy-birthday", kind: "party-theme", recommendationTerms: ["happy birthday", "birthday"], visible: true },
  { id: "web-category-party-theme-spider-man", name: "Spider-Man", slug: "spider-man", kind: "party-theme", recommendationTerms: ["spider-man", "spiderman", "webbed wonder"], visible: false },
  { id: "web-category-party-theme-batman", name: "Batman", slug: "batman", kind: "party-theme", recommendationTerms: ["batman"], visible: false },
  { id: "web-category-party-theme-disney-princess", name: "Disney Princess", slug: "disney-princess", kind: "party-theme", recommendationTerms: ["disney princess", "princess", "cinderella", "ariel", "rapunzel", "little mermaid"], visible: false },
  { id: "web-category-party-theme-paw-patrol", name: "Paw Patrol", slug: "paw-patrol", kind: "party-theme", recommendationTerms: ["paw patrol"], visible: false },
  { id: "web-category-party-theme-bluey", name: "Bluey", slug: "bluey", kind: "party-theme", recommendationTerms: ["bluey"], visible: false },
  { id: "web-category-party-theme-barbie", name: "Barbie", slug: "barbie", kind: "party-theme", recommendationTerms: ["barbie"], visible: false },
  { id: "web-category-party-theme-dinosaurs", name: "Dinosaurs", slug: "dinosaurs", kind: "party-theme", recommendationTerms: ["dinosaur", "dinosaurs", "dino", "jurassic"], visible: false },
  { id: "web-category-party-theme-unicorns", name: "Unicorns", slug: "unicorns", kind: "party-theme", recommendationTerms: ["unicorn", "unicorns"], visible: false },
  { id: "web-category-party-theme-rainbow", name: "Rainbow", slug: "rainbow", kind: "party-theme", recommendationTerms: ["rainbow"], visible: false },
  { id: "web-category-party-theme-frozen", name: "Frozen", slug: "frozen", kind: "party-theme", recommendationTerms: ["frozen", "elsa", "olaf"], visible: false },
  { id: "web-category-party-theme-mickey-mouse", name: "Mickey Mouse", slug: "mickey-mouse", kind: "party-theme", recommendationTerms: ["mickey", "mickey mouse"], visible: false },
  { id: "web-category-party-theme-minnie-mouse", name: "Minnie Mouse", slug: "minnie-mouse", kind: "party-theme", recommendationTerms: ["minnie", "minnie mouse"], visible: false },
  { id: "web-category-party-theme-minecraft", name: "Minecraft", slug: "minecraft", kind: "party-theme", recommendationTerms: ["minecraft", "creeper"], visible: false }
];

const productTypeSeeds: PartyCategorySeed[] = [
  { id: "web-category-party-type-plates", name: "Plates", slug: "plates", kind: "party-product-type", recommendationTerms: ["plate", "plates", "plt"], visible: true },
  { id: "web-category-party-type-napkins", name: "Napkins", slug: "napkins", kind: "party-product-type", recommendationTerms: ["napkin", "napkins"], visible: true },
  { id: "web-category-party-type-cups", name: "Cups", slug: "cups", kind: "party-product-type", recommendationTerms: ["cup", "cups", "tumbler"], visible: true },
  { id: "web-category-party-type-table-covers", name: "Table Covers", slug: "table-covers", kind: "party-product-type", recommendationTerms: ["table cover", "tablecover", "tablecloth"], visible: true },
  { id: "web-category-party-type-spoons", name: "Spoons", slug: "spoons", kind: "party-product-type", recommendationTerms: ["spoon", "spoons"], visible: true },
  { id: "web-category-party-type-cutlery", name: "Cutlery", slug: "cutlery", kind: "party-product-type", recommendationTerms: ["cutlery", "fork", "forks", "knife", "knives"], visible: true },
  { id: "web-category-party-type-decorations", name: "Decorations", slug: "decorations", kind: "party-product-type", recommendationTerms: ["decoration", "decorations", "banner", "garland", "centerpiece"], visible: true },
  { id: "web-category-party-type-favors", name: "Party Favors", slug: "party-favors", kind: "party-product-type", recommendationTerms: ["party favor", "favor", "favors", "lootbag", "loot bag"], visible: true },
  { id: "web-category-party-type-candles", name: "Candles", slug: "candles", kind: "party-product-type", recommendationTerms: ["candle", "candles"], visible: true },
  { id: "web-category-party-type-balloons", name: "Balloons", slug: "party-balloons", kind: "party-product-type", recommendationTerms: ["balloon", "balloons", "airwalker", "supershape"], visible: true }
];

const patternTerms = [
  "pattern", "printed", "print", "stripe", "striped", "polka dot", "confetti", "floral", "flower",
  "rainbow", "ombre", "geometric", "plaid", "checkered", "character", "licensed"
];

const solidTablewareTypeSlugs = new Set(["plates", "napkins", "cups", "table-covers", "spoons", "cutlery"]);

export function createPartyMerchandisingStructure(categories: WebsiteCategory[]) {
  const next = [...categories];
  let root = next.find((category) => category.slug === "party-supplies");

  if (!root) {
    root = createCategory({
      id: "web-category-party-supplies",
      name: "Party Supplies",
      slug: "party-supplies",
      kind: "standard",
      visible: true
    }, null, next.filter((category) => category.parentId === null).length);
    next.push(root);
  }

  const createdIds: string[] = [];
  for (const groupSeed of groupSeeds) {
    const group = ensureSeed(next, groupSeed, root.id, createdIds);
    const leafSeeds = groupSeed.slug === "themes"
      ? themeSeeds
      : groupSeed.slug === "solid-colors"
        ? solidColorSeeds
        : productTypeSeeds;
    for (const seed of leafSeeds) ensureSeed(next, seed, group.id, createdIds);
  }

  return { categories: orderWebsiteCategories(next), createdIds, rootId: root.id };
}

export function partyCategoriesByKind(categories: WebsiteCategory[], kind: PartyCategoryKind) {
  return orderWebsiteCategories(categories).filter((category) => category.kind === kind);
}

export function isRecommendablePartyCategory(category: WebsiteCategory): category is WebsiteCategory & { kind: PartyCategoryKind } {
  return partyCategoryKinds.includes(category.kind as PartyCategoryKind) && recommendationTerms(category).length > 0;
}

export function recommendationTerms(category: WebsiteCategory) {
  return Array.from(new Set((category.recommendationTerms ?? []).map(normalizeText).filter(Boolean))).slice(0, 20);
}

export function recommendPartyProduct(
  product: StorefrontProduct,
  targetCategory: WebsiteCategory,
  categories: WebsiteCategory[]
): PartyProductRecommendation | null {
  if (!isRecommendablePartyCategory(targetCategory) || isDemoCatalogProduct(product)) return null;
  const productName = normalizeText(product.name);
  const targetTerms = recommendationTerms(targetCategory);
  const targetMatchedTerms = targetTerms.filter((term) => containsTerm(productName, term));

  if (targetCategory.kind === "party-solid-color") {
    if (!isEligibleSolidTableware(product, targetCategory, categories)) return null;
  } else if (targetMatchedTerms.length === 0) {
    return null;
  }

  const assignments = new Set<string>([targetCategory.id]);
  const reasons: string[] = [];

  if (targetCategory.kind === "party-theme") reasons.push(`Theme match: ${targetCategory.name}`);
  if (targetCategory.kind === "party-product-type") reasons.push(`Product type: ${targetCategory.name}`);
  if (targetCategory.kind === "party-solid-color") reasons.push(`Plain ${targetCategory.name.toLowerCase()} tableware`);

  for (const category of categories) {
    if (!isRecommendablePartyCategory(category) || category.id === targetCategory.id) continue;
    if (category.kind === "party-solid-color") {
      if (isEligibleSolidTableware(product, category, categories)) assignments.add(category.id);
      continue;
    }
    if (recommendationTerms(category).some((term) => containsTerm(productName, term))) {
      assignments.add(category.id);
      if (category.kind === "party-product-type") reasons.push(`Product type: ${category.name}`);
      if (category.kind === "party-theme") reasons.push(`Theme match: ${category.name}`);
    }
  }

  const confidence = targetCategory.kind === "party-solid-color"
    ? 90
    : targetMatchedTerms.some((term) => productName === term || productName.startsWith(`${term} `))
      ? 98
      : targetCategory.kind === "party-product-type" ? 95 : 94;

  return {
    squareVariationId: product.squareVariationId,
    confidence,
    reasons: Array.from(new Set(reasons)).slice(0, 4),
    categoryIds: Array.from(assignments)
  };
}

export function isEligibleSolidTableware(product: StorefrontProduct, colorCategory: WebsiteCategory, categories: WebsiteCategory[]) {
  if (colorCategory.kind !== "party-solid-color") return false;
  const productName = normalizeText(product.name);
  const productTypeCategories = partyCategoriesByKind(categories, "party-product-type");
  const solidTablewareType = productTypeCategories.some((category) =>
    solidTablewareTypeSlugs.has(category.slug) &&
    recommendationTerms(category).some((term) => containsTerm(productName, term))
  );
  if (!solidTablewareType) return false;

  const themeMatch = partyCategoriesByKind(categories, "party-theme").some((category) =>
    recommendationTerms(category).some((term) => containsTerm(productName, term))
  );
  if (themeMatch || patternTerms.some((term) => containsTerm(productName, term))) return false;

  const matchedColors = partyCategoriesByKind(categories, "party-solid-color").filter((category) =>
    recommendationTerms(category).some((term) => containsTerm(productName, term))
  );
  return matchedColors.length === 1 && matchedColors[0]?.id === colorCategory.id;
}

export function partyAssignmentIssues(product: StorefrontProduct, categoryIds: string[], categories: WebsiteCategory[]) {
  return categoryIds.flatMap((categoryId) => {
    const category = categories.find((candidate) => candidate.id === categoryId);
    if (!category || category.kind !== "party-solid-color" || isEligibleSolidTableware(product, category, categories)) return [];
    return [`${product.name} cannot be assigned to ${category.name} Solid Colors. Only plain, single-color plates, napkins, cups, cutlery, and table covers are eligible.`];
  });
}

export function isDemoCatalogProduct(product: StorefrontProduct) {
  const values = [product.id, product.squareVariationId, product.slug, product.badge ?? ""].map((value) => normalizeText(value));
  return values.some((value) => value.startsWith("seed ") || value.startsWith("demo ") || value.startsWith("sample ") || value.includes(" demo product"));
}

export function isApprovedPersistentPartyAsset(imageUrl: string) {
  const normalized = imageUrl.trim().toLowerCase();
  const persistent = normalized.startsWith("/images/") || normalized.startsWith("/uploads/");
  if (!persistent) return false;
  return !normalized.includes("fallback") && !normalized.includes("placeholder");
}

function ensureSeed(categories: WebsiteCategory[], seed: PartyCategorySeed, parentId: string, createdIds: string[]) {
  const existing = categories.find((category) => category.id === seed.id || category.slug === seed.slug);
  if (existing) return existing;
  const category = createCategory(seed, parentId, categories.filter((candidate) => candidate.parentId === parentId).length);
  categories.push(category);
  createdIds.push(category.id);
  return category;
}

function createCategory(seed: PartyCategorySeed, parentId: string | null, sortOrder: number): WebsiteCategory {
  return {
    id: seed.id,
    name: seed.name,
    slug: seed.slug,
    description: "",
    imageUrl: "",
    imageAlt: "",
    parentId,
    visible: seed.visible,
    sortOrder,
    kind: seed.kind,
    recommendationTerms: seed.recommendationTerms ?? [],
    swatchColor: seed.swatchColor ?? ""
  };
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsTerm(value: string, term: string) {
  if (!term) return false;
  return ` ${value} `.includes(` ${term} `);
}
