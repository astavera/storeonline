/**
 * Implements server-side website merchandising draft preparation behavior and persistence boundaries.
 */

import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  websitePlacementReadinessIssues,
  type WebsiteMerchandisingConfig
} from "@/features/catalog/services/website-merchandising-service";
import { parseWebsiteMerchandising } from "@/server/admin/website-merchandising-store";
import { WebsiteMerchandisingPublicationError } from "@/server/admin/website-merchandising-publication";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { toPrismaJson } from "@/server/prisma-json";

const entityType = "WEBSITE_MERCHANDISING";
const entityId = "global";

type DraftSource = {
  status: string;
  versionNumber: number;
  payload: unknown;
};

export type NoShippingDraftPlan = {
  sourceStatus: string;
  sourceVersion: number;
  sourceDigest: string;
  targetDigest: string;
  confirmation: string;
  visiblePlacements: number;
  readyPlacements: number;
  totalShippingPlacements: number;
  visibleShippingPlacements: number;
  canApply: boolean;
  alreadyPrepared: boolean;
};

export function planNoShippingDraft(source: DraftSource): NoShippingDraftPlan {
  const config = parseWebsiteMerchandising(source.payload);
  if (!config) throw new WebsiteMerchandisingPublicationError("The selected merchandising draft is invalid.");
  const target = removeShipping(config);
  const visiblePlacements = target.placements.filter((placement) => placement.visible);
  const readyPlacements = visiblePlacements.filter((placement) =>
    websitePlacementReadinessIssues(placement, target.categories, target.holidays).length === 0
  );
  const totalShippingPlacements = config.placements.filter((placement) => placement.fulfillmentModes.includes("shipping")).length;
  const visibleShippingPlacements = config.placements.filter((placement) => placement.visible && placement.fulfillmentModes.includes("shipping")).length;
  const sourceDigest = digest(config);
  const targetDigest = digest(target);
  return {
    sourceStatus: source.status,
    sourceVersion: source.versionNumber,
    sourceDigest,
    targetDigest,
    confirmation: `modern-state-prepare-no-shipping-draft-v1-${digest({ sourceVersion: source.versionNumber, sourceDigest, targetDigest })}`,
    visiblePlacements: visiblePlacements.length,
    readyPlacements: readyPlacements.length,
    totalShippingPlacements,
    visibleShippingPlacements,
    canApply: totalShippingPlacements > 0 && readyPlacements.length === visiblePlacements.length,
    alreadyPrepared: totalShippingPlacements === 0
  };
}

export async function auditNoShippingDraft() {
  try {
    const source = await readLatestDraft(getPrismaClient());
    if (!source) throw new WebsiteMerchandisingPublicationError("No DRAFT or PREVIEW merchandising version is available.");
    return planNoShippingDraft(source);
  } catch (error) {
    if (error instanceof WebsiteMerchandisingPublicationError || error instanceof PersistenceUnavailableError) throw error;
    throw new PersistenceUnavailableError("No-shipping merchandising draft audit", { cause: error });
  }
}

export async function createNoShippingDraft(confirmation: string) {
  try {
    return await getPrismaClient().$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 'locked'::text AS status FROM pg_advisory_xact_lock(hashtext('modern-state-website-merchandising-draft-preparation'))`;
      const [source, latest] = await Promise.all([
        readLatestDraft(transaction),
        transaction.cmsContentVersion.findFirst({
          where: { entityType, entityId },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true }
        })
      ]);
      if (!source) throw new WebsiteMerchandisingPublicationError("No DRAFT or PREVIEW merchandising version is available.");
      const plan = planNoShippingDraft(source);
      if (plan.alreadyPrepared) return { ...plan, applied: false, draftVersion: source.versionNumber };
      if (confirmation !== plan.confirmation) {
        throw new WebsiteMerchandisingPublicationError(`Confirmation must be ${plan.confirmation}.`);
      }
      if (!plan.canApply) {
        throw new WebsiteMerchandisingPublicationError("Removing shipping would leave one or more visible placements unready.");
      }
      const config = parseWebsiteMerchandising(source.payload)!;
      const target = removeShipping(config);
      const draftVersion = (latest?.versionNumber ?? 0) + 1;
      await transaction.cmsContentVersion.create({
        data: {
          entityType,
          entityId,
          versionNumber: draftVersion,
          status: "DRAFT",
          title: `No-shipping draft from ${source.status} v${source.versionNumber}`,
          payload: toPrismaJson(target)
        }
      });
      await transaction.auditLog.create({
        data: {
          action: "WEBSITE_MERCHANDISING_NO_SHIPPING_DRAFT_CREATED",
          entityType,
          entityId,
          before: {
            sourceVersion: plan.sourceVersion,
            sourceDigest: plan.sourceDigest,
            visibleShippingPlacements: plan.visibleShippingPlacements,
            totalShippingPlacements: plan.totalShippingPlacements
          },
          after: {
            draftVersion,
            targetDigest: plan.targetDigest,
            visiblePlacements: plan.visiblePlacements,
            readyPlacements: plan.readyPlacements,
            visibleShippingPlacements: 0,
            totalShippingPlacements: 0
          }
        }
      });
      return { ...plan, applied: true, draftVersion };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  } catch (error) {
    if (error instanceof WebsiteMerchandisingPublicationError || error instanceof PersistenceUnavailableError) throw error;
    throw new PersistenceUnavailableError("No-shipping merchandising draft", { cause: error });
  }
}

function removeShipping(config: WebsiteMerchandisingConfig): WebsiteMerchandisingConfig {
  return {
    ...config,
    placements: config.placements.map((placement) => ({
      ...placement,
      fulfillmentModes: placement.fulfillmentModes.filter((mode) => mode !== "shipping")
    }))
  };
}

function readLatestDraft(client: Pick<Prisma.TransactionClient, "cmsContentVersion">) {
  return client.cmsContentVersion.findFirst({
    where: { entityType, entityId, status: { in: ["DRAFT", "PREVIEW"] } },
    orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
    select: { status: true, versionNumber: true, payload: true }
  });
}

function digest(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
