import type { FulfillmentMode, ProductAgeGroup } from "@/features/catalog/product-catalog";
import {
  websitePlacementReadinessIssues,
  type WebsiteCategory,
  type WebsiteHoliday,
  type WebsiteProductPlacement,
  type WebsiteSurface
} from "@/features/catalog/services/website-merchandising-service";

export type BulkValueMode = "keep" | "add" | "remove" | "replace";
export type BulkHolidayMode = "keep" | "assign" | "remove";
export type BulkVisibilityMode = "keep" | "hidden" | "publish-ready";

export type WebsiteBulkEdit = {
  categoryMode: BulkValueMode;
  categoryIds: string[];
  brandMode: BulkValueMode;
  brandIds: string[];
  surfaceMode: BulkValueMode;
  surfaceIds: WebsiteSurface[];
  ageMode: BulkValueMode;
  ageGroups: ProductAgeGroup[];
  fulfillmentMode: BulkValueMode;
  fulfillmentModes: FulfillmentMode[];
  holidayMode: BulkHolidayMode;
  holidayId?: string;
  holidayStartsAt?: string;
  holidayEndsAt?: string;
  sortOrder?: number;
  sortStep?: number;
  visibilityMode: BulkVisibilityMode;
};

export type WebsiteBulkEditResult = {
  placements: WebsiteProductPlacement[];
  createdPlacementCount: number;
  updatedCount: number;
  publishedCount: number;
  skippedPublishCount: number;
};

export function applyWebsiteBulkEdit(
  placements: WebsiteProductPlacement[],
  selectedVariationIds: Iterable<string>,
  edit: WebsiteBulkEdit,
  categories: WebsiteCategory[],
  holidays: WebsiteHoliday[]
): WebsiteBulkEditResult {
  const selectedIds = new Set(selectedVariationIds);
  let updatedCount = 0;
  let publishedCount = 0;
  let skippedPublishCount = 0;
  let selectedIndex = 0;

  const nextPlacements = placements.map((placement) => {
    if (!selectedIds.has(placement.squareVariationId)) {
      return placement;
    }

    const structuralChange =
      hasBulkValueChange(edit.categoryMode, edit.categoryIds.length) ||
      hasBulkValueChange(edit.brandMode, edit.brandIds.length) ||
      hasBulkValueChange(edit.surfaceMode, edit.surfaceIds.length) ||
      hasBulkValueChange(edit.ageMode, edit.ageGroups.length) ||
      hasBulkValueChange(edit.fulfillmentMode, edit.fulfillmentModes.length) ||
      (edit.holidayMode !== "keep" && Boolean(edit.holidayId)) ||
      edit.sortOrder !== undefined;
    let next: WebsiteProductPlacement = {
      ...placement,
      categoryIds: applyBulkValues(placement.categoryIds, edit.categoryIds, edit.categoryMode),
      brandIds: applyBulkValues(placement.brandIds, edit.brandIds, edit.brandMode),
      surfaceIds: applyBulkValues(placement.surfaceIds, edit.surfaceIds, edit.surfaceMode),
      ageGroups: applyBulkValues(placement.ageGroups, edit.ageGroups, edit.ageMode),
      fulfillmentModes: applyBulkValues(placement.fulfillmentModes, edit.fulfillmentModes, edit.fulfillmentMode),
      visible: structuralChange ? false : placement.visible,
      sortOrder: edit.sortOrder === undefined ? placement.sortOrder : Math.max(0, Math.trunc(edit.sortOrder + selectedIndex * (edit.sortStep ?? 0)))
    };

    if (edit.holidayMode !== "keep" && edit.holidayId) {
      const otherAssignments = next.holidayAssignments.filter((assignment) => assignment.holidayId !== edit.holidayId);
      next = edit.holidayMode === "assign"
        ? {
            ...next,
            holidayAssignments: [
              ...otherAssignments,
              { holidayId: edit.holidayId, startsAt: edit.holidayStartsAt ?? "", endsAt: edit.holidayEndsAt ?? "" }
            ],
            surfaceIds: Array.from(new Set([...next.surfaceIds, "holiday-pages" as const]))
          }
        : {
            ...next,
            holidayAssignments: otherAssignments,
            surfaceIds: otherAssignments.length > 0 ? next.surfaceIds : next.surfaceIds.filter((surfaceId) => surfaceId !== "holiday-pages")
          };
    }

    if (edit.visibilityMode === "hidden") {
      next = { ...next, visible: false };
    } else if (edit.visibilityMode === "publish-ready") {
      if (websitePlacementReadinessIssues(next, categories, holidays).length === 0) {
        next = { ...next, visible: true };
        publishedCount += 1;
      } else {
        next = { ...next, visible: false };
        skippedPublishCount += 1;
      }
    }

    updatedCount += 1;
    selectedIndex += 1;
    return next;
  });

  return { placements: nextPlacements, createdPlacementCount: 0, updatedCount, publishedCount, skippedPublishCount };
}

export function applyWebsiteBulkEditToVariationIds(
  placements: WebsiteProductPlacement[],
  selectedVariationIds: Iterable<string>,
  edit: WebsiteBulkEdit,
  categories: WebsiteCategory[],
  holidays: WebsiteHoliday[]
): WebsiteBulkEditResult {
  const selectedIds = Array.from(new Set(selectedVariationIds));
  const existingIds = new Set(placements.map((placement) => placement.squareVariationId));
  const missingPlacements = selectedIds
    .filter((id) => !existingIds.has(id))
    .map((squareVariationId, index): WebsiteProductPlacement => ({
      squareVariationId,
      categoryIds: [],
      brandIds: [],
      holidayAssignments: [],
      ageGroups: [],
      fulfillmentModes: [],
      surfaceIds: [],
      visible: false,
      sortOrder: placements.length + index
    }));
  const result = applyWebsiteBulkEdit(
    [...placements, ...missingPlacements],
    selectedIds,
    edit,
    categories,
    holidays
  );

  return { ...result, createdPlacementCount: missingPlacements.length };
}

function applyBulkValues<T extends string>(current: T[], selected: T[], mode: BulkValueMode): T[] {
  if (mode === "keep") return current;
  if (mode === "replace") return Array.from(new Set(selected));
  if (mode === "add") return Array.from(new Set([...current, ...selected]));
  const removed = new Set(selected);
  return current.filter((value) => !removed.has(value));
}

function hasBulkValueChange(mode: BulkValueMode, selectedCount: number) {
  return mode === "replace" || ((mode === "add" || mode === "remove") && selectedCount > 0);
}
