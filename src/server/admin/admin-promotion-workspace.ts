/** Read-only campaign visibility built from the CMS versions that already drive the storefront. */

import "server-only";

import { getPrismaClient } from "@/server/db/prisma";

const promotionSectionTypes = new Set([
  "promo",
  "countdownpromo",
  "holidayhero",
  "limitedavailabilitybanner",
  "herocarousel",
  "newslettercta",
  "modalpopup",
  "seasonalcollection"
]);

export type AdminPromotionCampaign = {
  id: string;
  name: string;
  sectionType: string;
  entityType: string;
  entityId: string;
  versionNumber: number;
  status: string;
  publishedAt: string | null;
  scheduledPublishAt: string | null;
  scheduledUnpublishAt: string | null;
  editorHref: string;
};

export async function readAdminPromotionWorkspace() {
  if (!process.env.DATABASE_URL) return emptyWorkspace(false);

  try {
    const versions = await getPrismaClient().cmsContentVersion.findMany({
      where: { entityType: { in: ["homepage", "holiday", "landing"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        versionNumber: true,
        status: true,
        payload: true,
        publishedAt: true,
        scheduledPublishAt: true,
        scheduledUnpublishAt: true
      }
    });

    const campaigns = versions.flatMap((version) =>
      extractPromotionSections(version.payload).map((section, index) => ({
        id: `${version.id}:${index}`,
        name: section.name,
        sectionType: section.sectionType,
        entityType: version.entityType,
        entityId: version.entityId,
        versionNumber: version.versionNumber,
        status: version.status,
        publishedAt: version.publishedAt?.toISOString() ?? null,
        scheduledPublishAt: version.scheduledPublishAt?.toISOString() ?? null,
        scheduledUnpublishAt: version.scheduledUnpublishAt?.toISOString() ?? null,
        editorHref: editorHref(version.entityType, version.entityId)
      }))
    );

    return {
      available: true,
      campaigns,
      statusCounts: countBy(campaigns.map(({ status }) => status)),
      sourceVersionCount: versions.length,
      boundary: "Storefront content only. Square remains authoritative for financial discounts and coupons."
    };
  } catch (error) {
    console.warn("[admin-promotions] Could not read CMS campaign visibility.", error);
    return emptyWorkspace(false);
  }
}

export function extractPromotionSections(payload: unknown): Array<{ name: string; sectionType: string }> {
  const found: Array<{ name: string; sectionType: string }> = [];
  const visited = new Set<object>();

  function visit(value: unknown) {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    const record = value as Record<string, unknown>;
    const rawType = stringValue(record.type) || stringValue(record.sectionType);
    const normalizedType = rawType.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
    if (promotionSectionTypes.has(normalizedType)) {
      found.push({
        sectionType: rawType,
        name: firstText(record.title, record.heading, record.label, record.name) || humanize(rawType)
      });
    }
    for (const nested of Object.values(record)) visit(nested);
  }

  visit(payload);
  return found.slice(0, 100);
}

function editorHref(entityType: string, entityId: string) {
  if (entityType === "homepage") return "/admin/homepage";
  return `/admin/builder/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

function firstText(...values: unknown[]) {
  return values.map(stringValue).find(Boolean) ?? "";
}

function humanize(value: string) {
  return value.replaceAll(/([a-z])([A-Z])/g, "$1 $2").replaceAll(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {});
}

function emptyWorkspace(available: boolean) {
  return {
    available,
    campaigns: [] as AdminPromotionCampaign[],
    statusCounts: {} as Record<string, number>,
    sourceVersionCount: 0,
    boundary: "Storefront content only. Square remains authoritative for financial discounts and coupons."
  };
}
