/**
 * Implements the merchandising spreadsheet service workflow for the catalog feature.
 */

import {
  productAgeGroupIds,
  type FulfillmentMode,
  type ProductAgeGroup,
  type StorefrontProduct
} from "@/features/catalog/product-catalog";
import {
  websitePlacementReadinessIssues,
  websiteSurfaceIds,
  websiteSurfaceOptions,
  type WebsiteCategory,
  type WebsiteBrand,
  type WebsiteHoliday,
  type WebsiteHolidayAssignment,
  type WebsiteProductPlacement,
  type WebsiteSurface
} from "@/features/catalog/services/website-merchandising-service";

export const merchandisingSpreadsheetHeaders = [
  "row_action",
  "square_variation_id",
  "product_name",
  "square_category",
  "website_categories",
  "website_brands",
  "website_surfaces",
  "age_ranges",
  "fulfillment",
  "holiday_assignments",
  "sort_order",
  "publishing",
  "instructions"
] as const;

export type MerchandisingSpreadsheetPatch = {
  squareVariationId: string;
  categoryIds?: string[];
  brandIds?: string[];
  surfaceIds?: WebsiteSurface[];
  ageGroups?: ProductAgeGroup[];
  fulfillmentModes?: FulfillmentMode[];
  holidayAssignments?: WebsiteHolidayAssignment[];
  sortOrder?: number;
  visibilityMode?: "hidden" | "publish-ready";
};

export type MerchandisingSpreadsheetError = {
  row: number;
  squareVariationId?: string;
  message: string;
};

export type MerchandisingSpreadsheetParseResult = {
  rows: MerchandisingSpreadsheetPatch[];
  errors: MerchandisingSpreadsheetError[];
  totalDataRows: number;
  ignoredRowCount: number;
};

export type MerchandisingSpreadsheetApplyResult = {
  placements: WebsiteProductPlacement[];
  updatedCount: number;
  publishedCount: number;
  skippedPublishCount: number;
};

type SpreadsheetContext = {
  products: StorefrontProduct[];
  categories: WebsiteCategory[];
  brands: WebsiteBrand[];
  holidays: WebsiteHoliday[];
};

const editableHeaders = new Set([
  "website_categories",
  "website_brands",
  "website_surfaces",
  "age_ranges",
  "fulfillment",
  "holiday_assignments",
  "sort_order",
  "publishing"
]);
const fulfillmentIds: FulfillmentMode[] = ["pickup", "local-delivery", "shipping"];

export function createWebsiteMerchandisingCsv(
  products: StorefrontProduct[],
  placements: WebsiteProductPlacement[],
  categories: WebsiteCategory[],
  brands: WebsiteBrand[],
  holidays: WebsiteHoliday[]
) {
  const placementById = new Map(placements.map((placement) => [placement.squareVariationId, placement]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const holidayById = new Map(holidays.map((holiday) => [holiday.id, holiday]));
  const rows: string[][] = [
    ...createMerchandisingGuideRows(categories, brands, holidays),
    [],
    Array.from(merchandisingSpreadsheetHeaders)
  ];
  const exampleCategorySlugs = categories.slice(0, 2).map((category) => category.slug).join("|") || "CLEAR";
  const exampleBrandSlugs = brands.slice(0, 2).map((brand) => brand.slug).join("|") || "CLEAR";
  const exampleHoliday = holidays[0];

  rows.push([
    "EXAMPLE",
    "EXAMPLE_ONLY_DO_NOT_EDIT",
    "Example product — copy this format",
    "Square Arts & Crafts (reference only)",
    exampleCategorySlugs,
    exampleBrandSlugs,
    "shop|category-pages|search",
    "5-7|8-10",
    "pickup|local-delivery|shipping",
    exampleHoliday ? `${exampleHoliday.slug}@${exampleHoliday.startDate}@${exampleHoliday.endDate}` : "CLEAR",
    "10",
    "PUBLISH_READY",
    "EXAMPLE ONLY. On real product rows change row_action from SKIP to APPLY. Blank cells keep the current value; CLEAR removes all values; use | between multiple values."
  ]);

  for (const product of products) {
    const placement = placementById.get(product.squareVariationId);
    rows.push([
      "SKIP",
      product.squareVariationId,
      protectSpreadsheetFormula(product.name),
      protectSpreadsheetFormula(product.department),
      placement?.categoryIds.map((id) => categoryById.get(id)?.slug ?? id).join("|") ?? "",
      placement?.brandIds.map((id) => brandById.get(id)?.slug ?? id).join("|") ?? "",
      placement?.surfaceIds.join("|") ?? "",
      placement?.ageGroups.join("|") ?? "",
      placement?.fulfillmentModes.join("|") ?? "",
      placement?.holidayAssignments
        .map((assignment) => {
          const holiday = holidayById.get(assignment.holidayId);
          return `${holiday?.slug ?? assignment.holidayId}@${assignment.startsAt}@${assignment.endsAt}`;
        })
        .join("|") ?? "",
      placement ? String(placement.sortOrder) : "",
      placement?.visible ? "PUBLISH_READY" : "HIDDEN",
      "Set row_action to APPLY only when this row is ready to import."
    ]);
  }

  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
}

export function parseCsvTable(text: string): unknown[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function parseWebsiteMerchandisingTable(
  table: unknown[][],
  { products, categories, brands, holidays }: SpreadsheetContext
): MerchandisingSpreadsheetParseResult {
  const nonEmptyRows = table
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(({ row }) => row.some((cell) => normalizeCell(cell) !== ""));
  if (nonEmptyRows.length === 0) {
    return { rows: [], errors: [{ row: 1, message: "The spreadsheet is empty." }], totalDataRows: 0, ignoredRowCount: 0 };
  }

  const headerRowPosition = nonEmptyRows.findIndex(({ row }) => row.some((cell) => normalizeHeader(normalizeCell(cell)) === "square_variation_id"));
  if (headerRowPosition === -1) {
    return {
      rows: [],
      errors: [{ row: 1, message: "Missing required square_variation_id header. Download a fresh guided template." }],
      totalDataRows: 0,
      ignoredRowCount: 0
    };
  }

  const headerRow = nonEmptyRows[headerRowPosition];
  const headers = headerRow.row.map((cell) => normalizeHeader(normalizeCell(cell)));
  const variationIndex = headers.indexOf("square_variation_id");
  const dataRows = nonEmptyRows.slice(headerRowPosition + 1);

  const productIds = new Set(products.map((product) => product.squareVariationId));
  const categoryLookup = createLookup(categories.flatMap((category) => [[category.id, category.id], [category.slug, category.id], [category.name, category.id]]));
  const brandLookup = createLookup(brands.flatMap((brand) => [[brand.id, brand.id], [brand.slug, brand.id], [brand.name, brand.id]]));
  const surfaceLookup = createLookup([
    ...websiteSurfaceIds.map((id) => [id, id] as const),
    ...websiteSurfaceOptions.map((option) => [option.label, option.id] as const)
  ]);
  const ageLookup = createLookup(productAgeGroupIds.map((id) => [id, id] as const));
  const fulfillmentLookup = createLookup(fulfillmentIds.map((id) => [id, id] as const));
  const holidayLookup = createLookup(holidays.flatMap((holiday) => [[holiday.id, holiday.id], [holiday.slug, holiday.id], [holiday.name, holiday.id]]));
  const holidayById = new Map(holidays.map((holiday) => [holiday.id, holiday]));
  const seenIds = new Set<string>();
  const rows: MerchandisingSpreadsheetPatch[] = [];
  const errors: MerchandisingSpreadsheetError[] = [];
  let ignoredRowCount = 0;

  dataRows.forEach(({ row: rawRow, rowNumber }) => {
    const rowActionCell = cellForHeader(rawRow, headers, "row_action");
    const rowAction = normalizeLookupKey(rowActionCell ?? "").replaceAll(/[_\s]+/g, "-");
    if (["skip", "ignore", "example"].includes(rowAction)) {
      ignoredRowCount += 1;
      return;
    }

    const squareVariationId = normalizeCell(rawRow[variationIndex]);
    const rowErrors: string[] = [];
    if (rowAction && !["apply", "update", "import"].includes(rowAction)) rowErrors.push("row_action must be APPLY or SKIP. EXAMPLE rows are ignored automatically.");
    if (!squareVariationId) rowErrors.push("square_variation_id is required.");
    else if (!productIds.has(squareVariationId)) rowErrors.push("Variation ID is not present in the currently loaded Square catalog.");
    else if (seenIds.has(squareVariationId)) rowErrors.push("Duplicate variation ID in this spreadsheet.");
    if (squareVariationId) seenIds.add(squareVariationId);

    const patch: MerchandisingSpreadsheetPatch = { squareVariationId };
    parseListColumn(rawRow, headers, "website_categories", categoryLookup, "website category", rowErrors, (values) => { patch.categoryIds = values; });
    parseListColumn(rawRow, headers, "website_brands", brandLookup, "website brand", rowErrors, (values) => { patch.brandIds = values; });
    parseListColumn(rawRow, headers, "website_surfaces", surfaceLookup, "website surface", rowErrors, (values) => { patch.surfaceIds = values as WebsiteSurface[]; });
    parseListColumn(rawRow, headers, "age_ranges", ageLookup, "age range", rowErrors, (values) => { patch.ageGroups = values as ProductAgeGroup[]; });
    parseListColumn(rawRow, headers, "fulfillment", fulfillmentLookup, "fulfillment mode", rowErrors, (values) => { patch.fulfillmentModes = values as FulfillmentMode[]; });

    const holidayCell = cellForHeader(rawRow, headers, "holiday_assignments");
    if (holidayCell !== undefined && holidayCell !== "") {
      if (isClearValue(holidayCell)) {
        patch.holidayAssignments = [];
      } else {
        const assignments: WebsiteHolidayAssignment[] = [];
        const seenHolidayIds = new Set<string>();
        for (const token of splitValues(holidayCell)) {
          const [holidayKey = "", startsAt = "", endsAt = "", ...extra] = token.split("@").map((value) => value.trim());
          const holidayId = holidayLookup.get(normalizeLookupKey(holidayKey));
          const holiday = holidayId ? holidayById.get(holidayId) : undefined;
          if (!holiday || extra.length > 0 || !isIsoDate(startsAt) || !isIsoDate(endsAt)) {
            rowErrors.push(`Invalid holiday assignment "${token}". Use holiday-slug@YYYY-MM-DD@YYYY-MM-DD.`);
            continue;
          }
          if (seenHolidayIds.has(holiday.id)) {
            rowErrors.push(`Holiday "${holiday.name}" appears more than once.`);
            continue;
          }
          if (startsAt < holiday.startDate || endsAt > holiday.endDate || startsAt > endsAt) {
            rowErrors.push(`Dates for "${holiday.name}" must stay inside ${holiday.startDate} to ${holiday.endDate}.`);
            continue;
          }
          seenHolidayIds.add(holiday.id);
          assignments.push({ holidayId: holiday.id, startsAt, endsAt });
        }
        patch.holidayAssignments = assignments;
      }
    }

    const sortCell = cellForHeader(rawRow, headers, "sort_order");
    if (sortCell !== undefined && sortCell !== "") {
      const sortOrder = Number(sortCell);
      if (!Number.isInteger(sortOrder) || sortOrder < 0) rowErrors.push("sort_order must be a whole number of 0 or greater.");
      else patch.sortOrder = sortOrder;
    }

    const publishingCell = cellForHeader(rawRow, headers, "publishing");
    if (publishingCell !== undefined && publishingCell !== "" && normalizeLookupKey(publishingCell) !== "keep") {
      const publishing = normalizeLookupKey(publishingCell).replaceAll("_", "-");
      if (["hidden", "no", "false"].includes(publishing)) patch.visibilityMode = "hidden";
      else if (["publish-ready", "publish", "live", "yes", "true"].includes(publishing)) patch.visibilityMode = "publish-ready";
      else rowErrors.push("publishing must be KEEP, HIDDEN, or PUBLISH_READY.");
    }

    const hasEditableValue = Object.keys(patch).some((key) => key !== "squareVariationId");
    if (!hasEditableValue && rowErrors.length === 0) {
      ignoredRowCount += 1;
      return;
    }
    if (rowErrors.length > 0) {
      errors.push(...rowErrors.map((message) => ({ row: rowNumber, squareVariationId: squareVariationId || undefined, message })));
      return;
    }
    rows.push(patch);
  });

  const missingEditableHeaders = Array.from(editableHeaders).every((header) => !headers.includes(header));
  if (missingEditableHeaders) errors.unshift({ row: headerRow.rowNumber, message: "No editable merchandising columns were found. Download a fresh template." });
  return { rows, errors, totalDataRows: dataRows.length, ignoredRowCount };
}

function createMerchandisingGuideRows(categories: WebsiteCategory[], brands: WebsiteBrand[], holidays: WebsiteHoliday[]) {
  const width = merchandisingSpreadsheetHeaders.length;
  const guideRow = (section: string, rule: string, details: string) => {
    const row = Array.from({ length: width }, () => "");
    row[0] = section;
    row[1] = rule;
    row[2] = details;
    return row;
  };
  const categorySlugs = categories.map((category) => category.slug).join(" | ") || "Create website categories first, then download a new template.";
  const brandSlugs = brands.map((brand) => brand.slug).join(" | ") || "Create website brands first, then download a new template.";
  const holidaySlugs = holidays.map((holiday) => holiday.slug).join(" | ") || "No website holidays are currently available.";

  return [
    guideRow("WEBSITE MERCHANDISING CSV GUIDE", "READ THIS BEFORE EDITING", "This guide is part of the CSV. Do not delete the real column-header row below it."),
    guideRow("1. DOWNLOAD", "Start safely", "The EXAMPLE row demonstrates the format. Every real Square product starts with row_action = SKIP."),
    guideRow("2. EDIT", "Choose rows explicitly", "Find a real product row, edit its website values, then change row_action from SKIP to APPLY."),
    guideRow("3. UPLOAD", "Validate before saving", "Upload the file. The website validates APPLY rows, updates only the Admin draft, and waits for Save changes."),
    guideRow("ROW ACTION", "APPLY / SKIP / EXAMPLE", "APPLY processes a real product row. SKIP and EXAMPLE are ignored. Invalid actions produce an error."),
    guideRow("KEEP OR REMOVE", "Blank / CLEAR", "A blank editable cell keeps its current value. CLEAR removes every assignment from that field."),
    guideRow("MULTIPLE VALUES", "Use the | separator", "Example: pickup|shipping or 5-7|8-10. Do not use commas to separate multiple values."),
    guideRow("PUBLISHING", "HIDDEN / PUBLISH_READY", "HIDDEN keeps the product private. PUBLISH_READY publishes only when all required website decisions are complete."),
    guideRow("ACCEPTED SURFACES", "website_surfaces", "shop | homepage | search | category-pages | holiday-pages"),
    guideRow("ACCEPTED AGE RANGES", "age_ranges", "0-2 | 3-4 | 5-7 | 8-10 | 11-12 | 13+"),
    guideRow("ACCEPTED FULFILLMENT", "fulfillment", "pickup | local-delivery | shipping"),
    guideRow("HOLIDAY FORMAT", "holiday_assignments", "holiday-slug@YYYY-MM-DD@YYYY-MM-DD; use | between multiple holiday assignments."),
    guideRow("CURRENT CATEGORY SLUGS", "website_categories", categorySlugs),
    guideRow("CURRENT BRAND SLUGS", "website_brands", brandSlugs),
    guideRow("CURRENT HOLIDAY SLUGS", "holiday_assignments", holidaySlugs),
    guideRow("IMPORTANT", "Read-only Square fields", "Do not edit square_variation_id, product_name, or square_category. They identify the source product."),
    guideRow("TABLE STARTS BELOW", "Find the row_action header", "Keep the header row intact. Product data begins with the EXAMPLE row immediately after it.")
  ];
}

export function applyWebsiteMerchandisingSpreadsheetRows(
  placements: WebsiteProductPlacement[],
  rows: MerchandisingSpreadsheetPatch[],
  categories: WebsiteCategory[],
  holidays: WebsiteHoliday[]
): MerchandisingSpreadsheetApplyResult {
  const rowById = new Map(rows.map((row) => [row.squareVariationId, row]));
  let updatedCount = 0;
  let publishedCount = 0;
  let skippedPublishCount = 0;

  const nextPlacements = placements.map((placement) => {
    const patch = rowById.get(placement.squareVariationId);
    if (!patch) return placement;
    const structuralChange = patch.categoryIds !== undefined || patch.brandIds !== undefined || patch.surfaceIds !== undefined || patch.ageGroups !== undefined ||
      patch.fulfillmentModes !== undefined || patch.holidayAssignments !== undefined || patch.sortOrder !== undefined;
    let next: WebsiteProductPlacement = {
      ...placement,
      categoryIds: patch.categoryIds ?? placement.categoryIds,
      brandIds: patch.brandIds ?? placement.brandIds,
      surfaceIds: patch.surfaceIds ?? placement.surfaceIds,
      ageGroups: patch.ageGroups ?? placement.ageGroups,
      fulfillmentModes: patch.fulfillmentModes ?? placement.fulfillmentModes,
      holidayAssignments: patch.holidayAssignments ?? placement.holidayAssignments,
      sortOrder: patch.sortOrder ?? placement.sortOrder,
      visible: structuralChange ? false : placement.visible
    };

    if (patch.holidayAssignments !== undefined) {
      next = {
        ...next,
        surfaceIds: patch.holidayAssignments.length > 0
          ? Array.from(new Set([...next.surfaceIds, "holiday-pages" as const]))
          : next.surfaceIds.filter((surfaceId) => surfaceId !== "holiday-pages")
      };
    }
    if (patch.visibilityMode === "hidden") next = { ...next, visible: false };
    else if (patch.visibilityMode === "publish-ready") {
      if (websitePlacementReadinessIssues(next, categories, holidays).length === 0) {
        next = { ...next, visible: true };
        publishedCount += 1;
      } else {
        next = { ...next, visible: false };
        skippedPublishCount += 1;
      }
    }
    updatedCount += 1;
    return next;
  });

  return { placements: nextPlacements, updatedCount, publishedCount, skippedPublishCount };
}

function parseListColumn<T extends string>(
  row: unknown[],
  headers: string[],
  header: string,
  lookup: Map<string, T>,
  label: string,
  errors: string[],
  assign: (values: T[]) => void
) {
  const cell = cellForHeader(row, headers, header);
  if (cell === undefined || cell === "") return;
  if (isClearValue(cell)) return assign([]);
  const values: T[] = [];
  for (const token of splitValues(cell)) {
    const value = lookup.get(normalizeLookupKey(token));
    if (!value) errors.push(`Unknown ${label} "${token}".`);
    else if (!values.includes(value)) values.push(value);
  }
  assign(values);
}

function cellForHeader(row: unknown[], headers: string[], header: string) {
  const index = headers.indexOf(header);
  return index === -1 ? undefined : normalizeCell(row[index]);
}

function createLookup<T extends string>(entries: ReadonlyArray<readonly [string, T]>) {
  return new Map(entries.map(([key, value]) => [normalizeLookupKey(key), value]));
}

function splitValues(value: string) {
  return value.split("|").map((token) => token.trim()).filter(Boolean);
}

function normalizeCell(value: unknown) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeLookupKey(value: string) {
  return value.trim().toLowerCase();
}

function isClearValue(value: string) {
  return normalizeLookupKey(value) === "clear";
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function protectSpreadsheetFormula(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeCsvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
