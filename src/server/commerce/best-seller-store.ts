/**
 * Reads best-seller signals without mutating orders or catalog data.
 */

import "server-only";
import { getPrismaClient } from "@/server/db/prisma";

export type BestSellerResult = {
  source: "hybrid" | "manual" | "none" | "sales";
  variationIds: string[];
};

const completedOrderStatuses = ["COMPLETED", "FULFILLED", "PAID"];

export async function readDepartmentBestSellers(departmentSlug: string, limit = 12): Promise<BestSellerResult> {
  if (!process.env.DATABASE_URL) return { source: "none", variationIds: [] };

  try {
    const prisma = getPrismaClient();
    const sectionIds = [
      "best-sellers",
      "department.best-sellers",
      "popular",
      `${departmentSlug}.best-sellers`,
      `${departmentSlug}.popular`
    ];
    const since = new Date();
    since.setUTCFullYear(since.getUTCFullYear() - 1);

    const [manualPlacements, sales] = await Promise.all([
      prisma.websiteProductPlacement.findMany({
        where: {
          placementTargetSlug: departmentSlug,
          placementType: "DEPARTMENT",
          sectionId: { in: sectionIds }
        },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
        select: { squareVariationId: true, visible: true }
      }),
      prisma.orderItemMirror.groupBy({
        by: ["squareVariationId"],
        where: {
          order: {
            createdAt: { gte: since },
            status: { in: completedOrderStatuses }
          }
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: Math.max(limit * 3, limit)
      })
    ]);

    const excludedIds = new Set(manualPlacements.filter((placement) => !placement.visible).map((placement) => placement.squareVariationId));
    const manualIds = manualPlacements.filter((placement) => placement.visible).map((placement) => placement.squareVariationId);
    const salesIds = sales
      .filter((row) => (row._sum.quantity ?? 0) > 0 && !excludedIds.has(row.squareVariationId))
      .map((row) => row.squareVariationId);
    const variationIds = Array.from(new Set([...manualIds, ...salesIds])).slice(0, limit);

    return {
      source: salesIds.length > 0 && manualIds.length > 0
        ? "hybrid"
        : salesIds.length > 0
          ? "sales"
          : manualIds.length > 0
            ? "manual"
            : "none",
      variationIds
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[department-best-sellers] Sales aggregation unavailable; continuing without a best-seller shelf.", error);
    }
    return { source: "none", variationIds: [] };
  }
}
