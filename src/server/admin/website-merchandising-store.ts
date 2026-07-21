import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { productAgeGroupIds, type StorefrontProduct } from "@/features/catalog/product-catalog";
import {
  applyWebsiteBulkEditToVariationIds,
  type WebsiteBulkEdit
} from "@/features/catalog/services/bulk-merchandising-service";
import {
  MAX_WEBSITE_CATEGORY_DEPTH,
  createDefaultWebsiteMerchandising,
  reconcileWebsiteMerchandising,
  websitePlacementReadinessIssues,
  websiteSurfaceIds,
  type WebsiteMerchandisingConfig
} from "@/features/catalog/services/website-merchandising-service";
import { createDatabaseCmsVersion, readLatestDatabaseCmsVersion } from "@/server/db/cms-version-repository";
import { isDevelopmentLocalPersistenceEnabled, PersistenceUnavailableError, requireDatabaseOrDevelopmentFallback } from "@/server/db/persistence-policy";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

const websiteCategorySchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(240),
  parentId: z.string().min(1).max(120).nullable().default(null),
  visible: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000)
});

const websiteBrandSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(240),
  logoUrl: z.string().trim().max(500),
  imageAlt: z.string().trim().max(160),
  squareVendorIds: z.array(z.string().trim().min(1).max(160)).max(20),
  visible: z.boolean(),
  featuredOnHomepage: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000)
});

const websiteHolidaySchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().trim().min(1).max(80),
    slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().trim().max(240),
    startDate: dateSchema,
    endDate: dateSchema,
    visible: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000)
  })
  .refine((holiday) => holiday.startDate <= holiday.endDate, { message: "Holiday end date must be on or after its start date.", path: ["endDate"] });

const websiteHolidayAssignmentSchema = z
  .object({
    holidayId: z.string().min(1).max(120),
    startsAt: dateSchema,
    endsAt: dateSchema
  })
  .refine((assignment) => assignment.startsAt <= assignment.endsAt, { message: "Assignment end date must be on or after its start date.", path: ["endsAt"] });

const websitePlacementSchema = z.object({
  squareVariationId: z.string().min(1).max(160),
  categoryIds: z.array(z.string().min(1).max(120)).max(30),
  brandIds: z.array(z.string().min(1).max(120)).max(20),
  holidayAssignments: z.array(websiteHolidayAssignmentSchema).max(50),
  ageGroups: z.array(z.enum(productAgeGroupIds)).max(productAgeGroupIds.length),
  fulfillmentModes: z.array(z.enum(["pickup", "local-delivery", "shipping"])).max(3),
  surfaceIds: z.array(z.enum(websiteSurfaceIds)).max(websiteSurfaceIds.length),
  visible: z.boolean(),
  sortOrder: z.number().int().min(0).max(1_000_000)
});

const websiteMerchandisingSchema = z
  .object({
    version: z.literal(3),
    updatedAt: z.string().datetime(),
    categories: z.array(websiteCategorySchema).max(500),
    brands: z.array(websiteBrandSchema).max(500),
    holidays: z.array(websiteHolidaySchema).max(100),
    placements: z.array(websitePlacementSchema).max(100_000)
  })
  .superRefine((value, context) => {
    const categoryIds = new Set(value.categories.map((category) => category.id));
    const brandIds = new Set(value.brands.map((brand) => brand.id));
    const holidayById = new Map(value.holidays.map((holiday) => [holiday.id, holiday]));
    reportDuplicates(value.categories.map((category) => category.id), "Category ids must be unique.", ["categories"], context);
    reportDuplicates(value.categories.map((category) => category.slug), "Category slugs must be unique.", ["categories"], context);
    reportDuplicates(value.brands.map((brand) => brand.id), "Brand ids must be unique.", ["brands"], context);
    reportDuplicates(value.brands.map((brand) => brand.slug), "Brand slugs must be unique.", ["brands"], context);
    reportDuplicates(value.holidays.map((holiday) => holiday.id), "Holiday ids must be unique.", ["holidays"], context);
    reportDuplicates(value.holidays.map((holiday) => holiday.slug), "Holiday slugs must be unique.", ["holidays"], context);
    reportDuplicates(value.placements.map((placement) => placement.squareVariationId), "Product placements must be unique.", ["placements"], context);

    const categoryById = new Map(value.categories.map((category) => [category.id, category]));
    for (const [index, category] of value.categories.entries()) {
      const visited = new Set([category.id]);
      let current = category;
      let depth = 1;

      while (current.parentId) {
        const parent = categoryById.get(current.parentId);
        if (!parent) {
          context.addIssue({ code: "custom", message: "Subcategories must reference an existing website category.", path: ["categories", index, "parentId"] });
          break;
        }
        if (visited.has(parent.id)) {
          context.addIssue({ code: "custom", message: "Website categories cannot contain circular parent relationships.", path: ["categories", index, "parentId"] });
          break;
        }

        visited.add(parent.id);
        depth += 1;
        if (depth > MAX_WEBSITE_CATEGORY_DEPTH) {
          context.addIssue({ code: "custom", message: `Website categories support up to ${MAX_WEBSITE_CATEGORY_DEPTH} levels.`, path: ["categories", index, "parentId"] });
          break;
        }
        current = parent;
      }
    }

    for (const [index, placement] of value.placements.entries()) {
      reportDuplicates(placement.holidayAssignments.map((assignment) => assignment.holidayId), "A product can only have one schedule per holiday.", ["placements", index, "holidayAssignments"], context);

      for (const categoryId of placement.categoryIds) {
        if (!categoryIds.has(categoryId)) {
          context.addIssue({ code: "custom", message: "Product references an unknown website category.", path: ["placements", index, "categoryIds"] });
        }
      }

      for (const brandId of placement.brandIds) {
        if (!brandIds.has(brandId)) {
          context.addIssue({ code: "custom", message: "Product references an unknown website brand.", path: ["placements", index, "brandIds"] });
        }
      }

      for (const [assignmentIndex, assignment] of placement.holidayAssignments.entries()) {
        const holiday = holidayById.get(assignment.holidayId);

        if (!holiday) {
          context.addIssue({ code: "custom", message: "Product references an unknown holiday.", path: ["placements", index, "holidayAssignments", assignmentIndex, "holidayId"] });
        } else if (assignment.startsAt < holiday.startDate || assignment.endsAt > holiday.endDate) {
          context.addIssue({ code: "custom", message: "Product holiday dates must stay within the holiday campaign window.", path: ["placements", index, "holidayAssignments", assignmentIndex] });
        }
      }
    }
  });

const versionTwoMerchandisingSchema = z.object({
  version: z.literal(2),
  updatedAt: z.string().datetime(),
  categories: z.array(websiteCategorySchema).max(500),
  holidays: z.array(websiteHolidaySchema).max(100),
  placements: z.array(websitePlacementSchema.omit({ brandIds: true })).max(100_000)
});

const legacyPlacementSchema = z.object({
  squareVariationId: z.string().min(1).max(160),
  categoryIds: z.array(z.string()).default([]),
  ageGroups: z.array(z.enum(productAgeGroupIds)).default([]),
  visible: z.boolean().default(false),
  sortOrder: z.number().int().default(0)
});

const legacyMerchandisingSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().datetime(),
  categories: z.array(websiteCategorySchema),
  placements: z.array(legacyPlacementSchema)
});

const dataDirectory = path.join(process.cwd(), "data");
const merchandisingFile = path.join(dataDirectory, "admin-merchandising.json");
const merchandisingEntityType = "WEBSITE_MERCHANDISING";
const merchandisingEntityId = "global";

export async function readWebsiteMerchandising(products: StorefrontProduct[]): Promise<WebsiteMerchandisingConfig> {
  const parsed = await readSavedWebsiteMerchandising();
  return parsed ? reconcileWebsiteMerchandising(parsed, products) : createDefaultWebsiteMerchandising(products);
}

export async function readWebsiteMerchandisingSnapshot(): Promise<WebsiteMerchandisingConfig> {
  return await readSavedWebsiteMerchandising() ?? createDefaultWebsiteMerchandising([]);
}

export async function saveWebsiteMerchandising(input: unknown, products: StorefrontProduct[]) {
  const parsed = websiteMerchandisingSchema.parse(input);
  const updatedAt = new Date().toISOString();
  const subset = reconcileWebsiteMerchandising(parsed, products, updatedAt);
  const existing = await readSavedWebsiteMerchandising() ?? createDefaultWebsiteMerchandising([]);
  const config = mergeWebsiteMerchandisingProductSubset(
    existing,
    subset,
    products.map((product) => product.squareVariationId),
    updatedAt
  );

  await writeWebsiteMerchandising(config);

  return reconcileWebsiteMerchandising(config, products, updatedAt);
}

export async function applyBulkWebsiteMerchandisingToVariationIds(
  variationIds: Iterable<string>,
  edit: WebsiteBulkEdit
) {
  const config = await readSavedWebsiteMerchandising() ?? createDefaultWebsiteMerchandising([]);
  assertBulkReferencesExist(config, edit);
  const result = applyWebsiteBulkEditToVariationIds(
    config.placements,
    variationIds,
    edit,
    config.categories,
    config.holidays
  );
  const updatedAt = new Date().toISOString();
  const nextConfig = normalizeWebsiteMerchandisingReferences(
    { ...config, placements: result.placements },
    updatedAt
  );

  await writeWebsiteMerchandising(nextConfig);

  return {
    createdPlacementCount: result.createdPlacementCount,
    updatedCount: result.updatedCount,
    publishedCount: result.publishedCount,
    skippedPublishCount: result.skippedPublishCount,
    updatedAt
  };
}

export async function saveWebsiteProductPlacement(input: unknown) {
  const placement = websitePlacementSchema.parse(input);
  const config = await readSavedWebsiteMerchandising() ?? createDefaultWebsiteMerchandising([]);
  const updatedAt = new Date().toISOString();
  const nextConfig = normalizeWebsiteMerchandisingReferences(
    {
      ...config,
      placements: [
        ...config.placements.filter((current) => current.squareVariationId !== placement.squareVariationId),
        placement
      ]
    },
    updatedAt
  );

  await writeWebsiteMerchandising(nextConfig);

  return {
    placement: nextConfig.placements.find((current) => current.squareVariationId === placement.squareVariationId)!,
    updatedAt
  };
}

export function mergeWebsiteMerchandisingProductSubset(
  existing: WebsiteMerchandisingConfig,
  subset: WebsiteMerchandisingConfig,
  managedVariationIds: Iterable<string>,
  updatedAt = subset.updatedAt
) {
  const managedIds = new Set(managedVariationIds);
  const subsetPlacements = subset.placements.filter((placement) => managedIds.has(placement.squareVariationId));
  const preservedPlacements = existing.placements.filter((placement) => !managedIds.has(placement.squareVariationId));

  return normalizeWebsiteMerchandisingReferences(
    { ...subset, placements: [...preservedPlacements, ...subsetPlacements] },
    updatedAt
  );
}

export function parseWebsiteMerchandising(input: unknown): WebsiteMerchandisingConfig | null {
  const current = websiteMerchandisingSchema.safeParse(input);

  if (current.success) {
    return current.data;
  }

  const versionTwo = versionTwoMerchandisingSchema.safeParse(input);
  if (versionTwo.success) {
    return migrateVersionTwoMerchandising(versionTwo.data);
  }

  const legacy = legacyMerchandisingSchema.safeParse(input);
  return legacy.success ? migrateLegacyMerchandising(legacy.data) : null;
}

function migrateLegacyMerchandising(legacy: z.infer<typeof legacyMerchandisingSchema>): WebsiteMerchandisingConfig {
  const categories = legacy.categories.filter((category) => !category.id.startsWith("square-"));
  const categoryIds = new Set(categories.map((category) => category.id));

  return {
    version: 3,
    updatedAt: legacy.updatedAt,
    categories,
    brands: [],
    holidays: [],
    placements: legacy.placements.map((placement) => ({
      squareVariationId: placement.squareVariationId,
      categoryIds: placement.categoryIds.filter((categoryId) => categoryIds.has(categoryId)),
      brandIds: [],
      holidayAssignments: [],
      ageGroups: placement.ageGroups,
      fulfillmentModes: [],
      surfaceIds: [],
      visible: false,
      sortOrder: placement.sortOrder
    }))
  };
}

function migrateVersionTwoMerchandising(versionTwo: z.infer<typeof versionTwoMerchandisingSchema>): WebsiteMerchandisingConfig {
  return {
    version: 3,
    updatedAt: versionTwo.updatedAt,
    categories: versionTwo.categories,
    brands: [],
    holidays: versionTwo.holidays,
    placements: versionTwo.placements.map((placement) => ({ ...placement, brandIds: [] }))
  };
}

function reportDuplicates(values: string[], message: string, pathParts: Array<string | number>, context: z.RefinementCtx) {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", message, path: pathParts });
  }
}

async function readSavedWebsiteMerchandising() {
  const persistence = requireDatabaseOrDevelopmentFallback("Website merchandising");

  if (persistence === "database") {
    try {
      const record = await readLatestDatabaseCmsVersion({
        entityType: merchandisingEntityType,
        entityId: merchandisingEntityId,
        statuses: ["PUBLISHED"]
      });
      if (!record) return null;
      const parsed = parseWebsiteMerchandising(record.payload);
      if (!parsed) throw new PersistenceUnavailableError("Website merchandising content");
      return parsed;
    } catch (error) {
      if (!isDevelopmentLocalPersistenceEnabled()) throw error;
      console.warn("[development-local-persistence] Website merchandising database read failed; reading the explicit local fallback.");
    }
  }

  try {
    const raw = await readFile(merchandisingFile, "utf8");
    return parseWebsiteMerchandising(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeWebsiteMerchandising(config: WebsiteMerchandisingConfig) {
  const parsed = websiteMerchandisingSchema.parse(config);
  const persistence = requireDatabaseOrDevelopmentFallback("Website merchandising");

  if (persistence === "database") {
    try {
      await createDatabaseCmsVersion({
        entityType: merchandisingEntityType,
        entityId: merchandisingEntityId,
        status: "PUBLISHED",
        title: "Website merchandising",
        payload: parsed,
        publishedAt: new Date()
      });
      return;
    } catch (error) {
      if (!isDevelopmentLocalPersistenceEnabled()) throw error;
      console.warn("[development-local-persistence] Website merchandising database write failed; using the explicit local fallback.");
    }
  }

  const temporaryFile = `${merchandisingFile}.${process.pid}-${Date.now()}.tmp`;

  await mkdir(dataDirectory, { recursive: true });
  await writeFile(temporaryFile, JSON.stringify(parsed, null, 2), "utf8");
  await rename(temporaryFile, merchandisingFile);
}

function normalizeWebsiteMerchandisingReferences(
  config: WebsiteMerchandisingConfig,
  updatedAt: string
): WebsiteMerchandisingConfig {
  const categoryIds = new Set(config.categories.map((category) => category.id));
  const brandIds = new Set(config.brands.map((brand) => brand.id));
  const holidayIds = new Set(config.holidays.map((holiday) => holiday.id));

  return {
    ...config,
    updatedAt,
    placements: config.placements.map((placement) => {
      const next = {
        ...placement,
        categoryIds: Array.from(new Set(placement.categoryIds.filter((id) => categoryIds.has(id)))),
        brandIds: Array.from(new Set(placement.brandIds.filter((id) => brandIds.has(id)))),
        holidayAssignments: placement.holidayAssignments.filter((assignment) => holidayIds.has(assignment.holidayId))
      };

      return next.visible && websitePlacementReadinessIssues(next, config.categories, config.holidays).length > 0
        ? { ...next, visible: false }
        : next;
    })
  };
}

function assertBulkReferencesExist(config: WebsiteMerchandisingConfig, edit: WebsiteBulkEdit) {
  const categoryIds = new Set(config.categories.map((category) => category.id));
  const brandIds = new Set(config.brands.map((brand) => brand.id));
  const holidayIds = new Set(config.holidays.map((holiday) => holiday.id));

  if (edit.categoryIds.some((id) => !categoryIds.has(id))) {
    throw new Error("One or more selected website categories no longer exist. Refresh Products and try again.");
  }
  if (edit.brandIds.some((id) => !brandIds.has(id))) {
    throw new Error("One or more selected website brands no longer exist. Refresh Products and try again.");
  }
  if (edit.holidayId && !holidayIds.has(edit.holidayId)) {
    throw new Error("The selected holiday no longer exists. Refresh Products and try again.");
  }
}
