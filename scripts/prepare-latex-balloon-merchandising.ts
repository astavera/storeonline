import { existsSync } from "node:fs";
import { resolve } from "node:path";

loadEnvironment();

const {
  latexBalloonAddOnVariationIds,
  latexBalloonOrderVariationIds
} = await import("@/config/balloons.config");
const { readSquareStorefrontProductsByVariationIds } = await import("@/server/square/catalog-test-cache-store");
const {
  readWebsiteMerchandisingSnapshot,
  saveWebsiteMerchandising
} = await import("@/server/admin/website-merchandising-store");

const latexCategoryId = "web-category-latex-balloons";
const addOnCategoryId = "web-category-balloon-add-ons";
const addOnVariationIds = [
  latexBalloonAddOnVariationIds.hiFloat,
  ...latexBalloonAddOnVariationIds.weights
];
const managedVariationIds = [...latexBalloonOrderVariationIds, ...addOnVariationIds];
const products = readSquareStorefrontProductsByVariationIds(managedVariationIds);

if (products.length !== managedVariationIds.length) {
  const foundIds = new Set(products.map((product) => product.squareVariationId));
  const missingIds = managedVariationIds.filter((id) => !foundIds.has(id));
  throw new Error(`Square Latex merchandising is missing ${missingIds.length} approved variations: ${missingIds.join(", ")}`);
}

const current = await readWebsiteMerchandisingSnapshot();
const categories = [
  ...current.categories.filter((category) => ![latexCategoryId, addOnCategoryId].includes(category.id)),
  {
    id: latexCategoryId,
    name: "Latex Balloons",
    slug: "latex-balloons",
    description: "Inflated Latex balloons available for pickup and local delivery.",
    parentId: null,
    visible: true,
    sortOrder: 0
  },
  {
    id: addOnCategoryId,
    name: "Balloon Add-ons",
    slug: "balloon-add-ons",
    description: "Operational extras offered during balloon customization.",
    parentId: null,
    visible: true,
    sortOrder: 50
  }
];
const placementByVariationId = new Map(current.placements.map((placement) => [placement.squareVariationId, placement]));
const latexSortOrderById = new Map(latexBalloonOrderVariationIds.map((id, index) => [id, index]));
const addOnSortOrderById = new Map(addOnVariationIds.map((id, index) => [id, index]));

for (const variationId of latexBalloonOrderVariationIds) {
  const existing = placementByVariationId.get(variationId);
  placementByVariationId.set(variationId, {
    squareVariationId: variationId,
    categoryIds: [latexCategoryId],
    brandIds: existing?.brandIds ?? [],
    holidayAssignments: existing?.holidayAssignments ?? [],
    ageGroups: existing?.ageGroups ?? [],
    fulfillmentModes: ["pickup", "local-delivery"],
    surfaceIds: ["shop", "search", "category-pages"],
    visible: true,
    sortOrder: latexSortOrderById.get(variationId) ?? 0
  });
}

for (const variationId of addOnVariationIds) {
  const existing = placementByVariationId.get(variationId);
  placementByVariationId.set(variationId, {
    squareVariationId: variationId,
    categoryIds: [addOnCategoryId],
    brandIds: existing?.brandIds ?? [],
    holidayAssignments: existing?.holidayAssignments ?? [],
    ageGroups: existing?.ageGroups ?? [],
    fulfillmentModes: ["pickup", "local-delivery"],
    surfaceIds: ["category-pages"],
    visible: true,
    sortOrder: addOnSortOrderById.get(variationId) ?? 0
  });
}

const saved = await saveWebsiteMerchandising({
  ...current,
  categories,
  placements: Array.from(placementByVariationId.values())
}, products);

console.log(JSON.stringify({
  mode: "latex-balloon-merchandising",
  squareWritesEnabled: false,
  latexProductsPublished: latexBalloonOrderVariationIds.length,
  addOnsPublished: addOnVariationIds.length,
  updatedAt: saved.updatedAt
}, null, 2));

function loadEnvironment() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), name);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}
