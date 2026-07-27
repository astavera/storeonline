import type { WebsiteProductPlacement } from "@/features/catalog/services/website-merchandising-service";

export const catalogPublishingWorkspaceStorageKey = "modern-state:admin:catalog-publishing-workspace:v1";

const workspaceVersion = 1;
const workspaceLifetimeMs = 7 * 24 * 60 * 60 * 1_000;
const maximumSelectedProducts = 5_000;
const maximumPayloadLength = 1_000_000;

export type CatalogPublishingImageFilter = "all" | "with" | "without";

export type CatalogPublishingWorkspaceState = {
  version: typeof workspaceVersion;
  savedAt: number;
  snapshotUpdatedAt: string | null;
  queryInput: string;
  query: string;
  squareCategoryId: string;
  squareVendorId: string;
  websiteCategoryId: string;
  imageFilter: CatalogPublishingImageFilter;
  page: number;
  selectedId: string;
  selectedIds: string[];
  draft: WebsiteProductPlacement | null;
  draftBaseline: WebsiteProductPlacement | null;
  listScrollTop: number;
};

type WorkspaceStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function readCatalogPublishingWorkspace(storage: WorkspaceStorage, now = Date.now()): CatalogPublishingWorkspaceState | null {
  try {
    const serialized = storage.getItem(catalogPublishingWorkspaceStorageKey);
    if (!serialized) return null;
    if (serialized.length > maximumPayloadLength) {
      removeWorkspace(storage);
      return null;
    }
    const parsed = JSON.parse(serialized) as unknown;
    const workspace = parseWorkspace(parsed);
    if (!workspace || now - workspace.savedAt > workspaceLifetimeMs) {
      removeWorkspace(storage);
      return null;
    }
    return workspace;
  } catch {
    removeWorkspace(storage);
    return null;
  }
}

export function writeCatalogPublishingWorkspace(storage: WorkspaceStorage, workspace: Omit<CatalogPublishingWorkspaceState, "version" | "savedAt">, now = Date.now()) {
  try {
    const normalized: CatalogPublishingWorkspaceState = {
      version: workspaceVersion,
      savedAt: now,
      snapshotUpdatedAt: cleanOptionalString(workspace.snapshotUpdatedAt, 80),
      queryInput: cleanString(workspace.queryInput, 200),
      query: cleanString(workspace.query, 200),
      squareCategoryId: cleanString(workspace.squareCategoryId, 160),
      squareVendorId: cleanString(workspace.squareVendorId, 160),
      websiteCategoryId: cleanString(workspace.websiteCategoryId, 160),
      imageFilter: isImageFilter(workspace.imageFilter) ? workspace.imageFilter : "all",
      page: cleanPositiveInteger(workspace.page, 1),
      selectedId: cleanString(workspace.selectedId, 160),
      selectedIds: cleanStringArray(workspace.selectedIds, maximumSelectedProducts, 160),
      draft: parsePlacement(workspace.draft),
      draftBaseline: parsePlacement(workspace.draftBaseline),
      listScrollTop: cleanNonNegativeNumber(workspace.listScrollTop)
    };
    let serialized = JSON.stringify(normalized);
    if (serialized.length > maximumPayloadLength) {
      normalized.selectedIds = normalized.selectedIds.slice(0, 500);
      serialized = JSON.stringify(normalized);
    }
    if (serialized.length <= maximumPayloadLength) storage.setItem(catalogPublishingWorkspaceStorageKey, serialized);
  } catch {
    // Storage can be unavailable or full. The catalog remains usable without persistence.
  }
}

export function placementsMatch(left: WebsiteProductPlacement | null, right: WebsiteProductPlacement | null) {
  if (!left || !right) return left === right;
  return JSON.stringify(normalizePlacement(left)) === JSON.stringify(normalizePlacement(right));
}

function parseWorkspace(value: unknown): CatalogPublishingWorkspaceState | null {
  if (!isRecord(value) || value.version !== workspaceVersion || typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt)) return null;
  return {
    version: workspaceVersion,
    savedAt: value.savedAt,
    snapshotUpdatedAt: cleanOptionalString(value.snapshotUpdatedAt, 80),
    queryInput: cleanString(value.queryInput, 200),
    query: cleanString(value.query, 200),
    squareCategoryId: cleanString(value.squareCategoryId, 160),
    squareVendorId: cleanString(value.squareVendorId, 160),
    websiteCategoryId: cleanString(value.websiteCategoryId, 160),
    imageFilter: isImageFilter(value.imageFilter) ? value.imageFilter : "all",
    page: cleanPositiveInteger(value.page, 1),
    selectedId: cleanString(value.selectedId, 160),
    selectedIds: cleanStringArray(value.selectedIds, maximumSelectedProducts, 160),
    draft: parsePlacement(value.draft),
    draftBaseline: parsePlacement(value.draftBaseline),
    listScrollTop: cleanNonNegativeNumber(value.listScrollTop)
  };
}

function parsePlacement(value: unknown): WebsiteProductPlacement | null {
  if (!isRecord(value)) return null;
  const squareVariationId = cleanString(value.squareVariationId, 160);
  if (!squareVariationId) return null;
  const holidayAssignments = Array.isArray(value.holidayAssignments)
    ? value.holidayAssignments.slice(0, 50).flatMap((assignment) => {
      if (!isRecord(assignment)) return [];
      const holidayId = cleanString(assignment.holidayId, 160);
      const startsAt = cleanString(assignment.startsAt, 40);
      const endsAt = cleanString(assignment.endsAt, 40);
      return holidayId && startsAt && endsAt ? [{ holidayId, startsAt, endsAt }] : [];
    })
    : [];
  return {
    squareVariationId,
    categoryIds: cleanStringArray(value.categoryIds, 100, 160),
    brandIds: cleanStringArray(value.brandIds, 100, 160),
    holidayAssignments,
    ageGroups: cleanStringArray(value.ageGroups, 20, 80) as WebsiteProductPlacement["ageGroups"],
    fulfillmentModes: cleanStringArray(value.fulfillmentModes, 10, 80) as WebsiteProductPlacement["fulfillmentModes"],
    surfaceIds: cleanStringArray(value.surfaceIds, 20, 80) as WebsiteProductPlacement["surfaceIds"],
    visible: value.visible === true,
    sortOrder: cleanNonNegativeNumber(value.sortOrder)
  };
}

function normalizePlacement(value: WebsiteProductPlacement): WebsiteProductPlacement {
  return {
    ...value,
    categoryIds: [...value.categoryIds].sort(),
    brandIds: [...value.brandIds].sort(),
    holidayAssignments: [...value.holidayAssignments]
      .map((assignment) => ({ ...assignment }))
      .sort((left, right) => left.holidayId.localeCompare(right.holidayId)),
    ageGroups: [...value.ageGroups].sort(),
    fulfillmentModes: [...value.fulfillmentModes].sort(),
    surfaceIds: [...value.surfaceIds].sort()
  };
}

function cleanString(value: unknown, maximumLength: number) {
  return typeof value === "string" ? value.slice(0, maximumLength) : "";
}

function cleanOptionalString(value: unknown, maximumLength: number) {
  const cleaned = cleanString(value, maximumLength);
  return cleaned || null;
}

function cleanStringArray(value: unknown, maximumItems: number, maximumLength: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.flatMap((item) => {
    const cleaned = cleanString(item, maximumLength);
    return cleaned ? [cleaned] : [];
  }))).slice(0, maximumItems);
}

function cleanPositiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function cleanNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function isImageFilter(value: unknown): value is CatalogPublishingImageFilter {
  return value === "all" || value === "with" || value === "without";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function removeWorkspace(storage: WorkspaceStorage) {
  try {
    storage.removeItem(catalogPublishingWorkspaceStorageKey);
  } catch {
    // Storage can be unavailable. Failing closed keeps malformed state out of the UI.
  }
}
