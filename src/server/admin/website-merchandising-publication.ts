/**
 * Implements server-side website merchandising publication behavior and persistence boundaries.
 */

import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { websitePlacementReadinessIssues } from "@/features/catalog/services/website-merchandising-service";
import { parseWebsiteMerchandising } from "@/server/admin/website-merchandising-store";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { toPrismaJson } from "@/server/prisma-json";

const entityType = "WEBSITE_MERCHANDISING";
const entityId = "global";

type ContentVersionReference = {
  status: string;
  versionNumber: number;
  payload: unknown;
};

export type WebsiteMerchandisingPublicationPlan = {
  sourceStatus: string;
  sourceVersion: number;
  digest: string;
  confirmation: string;
  visiblePlacements: number;
  readyPlacements: number;
  canPublish: boolean;
  alreadyPublished: boolean;
};

export type WebsiteMerchandisingRollbackPlan = {
  currentPublishedVersion: number;
  targetPublishedVersion: number | null;
  currentDigest: string;
  targetDigest: string;
  confirmation: string;
  currentVisiblePlacements: number;
  targetVisiblePlacements: number;
  canRollback: boolean;
  alreadyRolledBack: boolean;
};

export class WebsiteMerchandisingPublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebsiteMerchandisingPublicationError";
  }
}

export function planWebsiteMerchandisingPublication(
  source: ContentVersionReference,
  publishedPayload?: unknown
): WebsiteMerchandisingPublicationPlan {
  const config = parseWebsiteMerchandising(source.payload);
  if (!config) throw new WebsiteMerchandisingPublicationError("The selected merchandising version is invalid.");
  const visiblePlacements = config.placements.filter((placement) => placement.visible);
  const readyPlacements = visiblePlacements.filter((placement) =>
    websitePlacementReadinessIssues(placement, config.categories, config.holidays).length === 0
  );
  const digest = digestPayload(config);
  const publishedConfig = publishedPayload === undefined ? null : parseWebsiteMerchandising(publishedPayload);
  return {
    sourceStatus: source.status,
    sourceVersion: source.versionNumber,
    digest,
    confirmation: `modern-state-publish-merchandising-v1-${digest}`,
    visiblePlacements: visiblePlacements.length,
    readyPlacements: readyPlacements.length,
    canPublish: visiblePlacements.length > 0 && readyPlacements.length === visiblePlacements.length,
    alreadyPublished: Boolean(publishedConfig && digestPayload(publishedConfig) === digest)
  };
}

export function planWebsiteMerchandisingRollback(
  currentPublished: ContentVersionReference,
  targetPublished?: ContentVersionReference
): WebsiteMerchandisingRollbackPlan {
  const currentConfig = parseWebsiteMerchandising(currentPublished.payload);
  if (!currentConfig) throw new WebsiteMerchandisingPublicationError("The current published merchandising version is invalid.");
  const targetConfig = targetPublished
    ? parseWebsiteMerchandising(targetPublished.payload)
    : emptyMerchandisingConfig(currentConfig.updatedAt);
  if (!targetConfig) throw new WebsiteMerchandisingPublicationError("The rollback target merchandising version is invalid.");
  const currentDigest = digestPayload(currentConfig);
  const targetDigest = digestPayload(targetConfig);
  const confirmationDigest = digestPayload({
    currentPublishedVersion: currentPublished.versionNumber,
    currentDigest,
    targetPublishedVersion: targetPublished?.versionNumber ?? null,
    targetDigest
  });
  return {
    currentPublishedVersion: currentPublished.versionNumber,
    targetPublishedVersion: targetPublished?.versionNumber ?? null,
    currentDigest,
    targetDigest,
    confirmation: `modern-state-rollback-merchandising-v1-${confirmationDigest}`,
    currentVisiblePlacements: currentConfig.placements.filter((placement) => placement.visible).length,
    targetVisiblePlacements: targetConfig.placements.filter((placement) => placement.visible).length,
    canRollback: currentDigest !== targetDigest,
    alreadyRolledBack: false
  };
}

export async function auditWebsiteMerchandisingPublication() {
  try {
    const [candidate, published] = await Promise.all([
      getPrismaClient().cmsContentVersion.findFirst({
        where: { entityType, entityId, status: { in: ["DRAFT", "PREVIEW"] } },
        orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
        select: { status: true, versionNumber: true, payload: true }
      }),
      getPrismaClient().cmsContentVersion.findFirst({
        where: { entityType, entityId, status: "PUBLISHED" },
        orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
        select: { status: true, versionNumber: true, payload: true }
      })
    ]);
    const source = selectLatestPublicationSource(candidate, published);
    if (!source) throw new WebsiteMerchandisingPublicationError("No merchandising version is available to publish.");
    return planWebsiteMerchandisingPublication(source, published?.payload);
  } catch (error) {
    if (error instanceof WebsiteMerchandisingPublicationError || error instanceof PersistenceUnavailableError) throw error;
    throw new PersistenceUnavailableError("Website merchandising publication audit", { cause: error });
  }
}

export async function publishWebsiteMerchandising(confirmation: string) {
  try {
    return await getPrismaClient().$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 'locked'::text AS status FROM pg_advisory_xact_lock(hashtext('modern-state-website-merchandising-publication'))`;
      const [candidate, published, latest] = await Promise.all([
        transaction.cmsContentVersion.findFirst({
          where: { entityType, entityId, status: { in: ["DRAFT", "PREVIEW"] } },
          orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
          select: { status: true, versionNumber: true, payload: true }
        }),
        transaction.cmsContentVersion.findFirst({
          where: { entityType, entityId, status: "PUBLISHED" },
          orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
          select: { id: true, status: true, versionNumber: true, payload: true }
        }),
        transaction.cmsContentVersion.findFirst({
          where: { entityType, entityId },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true }
        })
      ]);
      const source = selectLatestPublicationSource(candidate, published);
      if (!source) throw new WebsiteMerchandisingPublicationError("No merchandising version is available to publish.");
      const plan = planWebsiteMerchandisingPublication(source, published?.payload);
      if (confirmation !== plan.confirmation) {
        throw new WebsiteMerchandisingPublicationError(`Confirmation must be ${plan.confirmation}.`);
      }
      if (!plan.canPublish) {
        throw new WebsiteMerchandisingPublicationError("The selected merchandising version has visible placements that are not publication-ready.");
      }
      if (plan.alreadyPublished) return { ...plan, applied: false, publishedVersion: published!.versionNumber };

      const config = parseWebsiteMerchandising(source.payload)!;
      const publishedVersion = (latest?.versionNumber ?? 0) + 1;
      const now = new Date();
      await transaction.cmsContentVersion.create({
        data: {
          entityType,
          entityId,
          versionNumber: publishedVersion,
          status: "PUBLISHED",
          title: `Published merchandising from ${source.status} v${source.versionNumber}`,
          payload: toPrismaJson(config),
          publishedAt: now
        }
      });
      await transaction.auditLog.create({
        data: {
          action: "WEBSITE_MERCHANDISING_PUBLISHED",
          entityType,
          entityId,
          after: {
            sourceStatus: plan.sourceStatus,
            sourceVersion: plan.sourceVersion,
            publishedVersion,
            digest: plan.digest,
            visiblePlacements: plan.visiblePlacements,
            readyPlacements: plan.readyPlacements,
            previousPublishedVersion: published?.versionNumber ?? null,
            previousPublishedDigest: published ? digestPayload(parseWebsiteMerchandising(published.payload) ?? published.payload) : null
          }
        }
      });
      return { ...plan, applied: true, publishedVersion };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  } catch (error) {
    if (error instanceof WebsiteMerchandisingPublicationError || error instanceof PersistenceUnavailableError) throw error;
    throw new PersistenceUnavailableError("Website merchandising publication", { cause: error });
  }
}

export async function auditWebsiteMerchandisingRollback() {
  try {
    const prisma = getPrismaClient();
    const [currentPublished, publicationAudit, rollbackAudit] = await Promise.all([
      prisma.cmsContentVersion.findFirst({
        where: { entityType, entityId, status: "PUBLISHED" },
        orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
        select: { status: true, versionNumber: true, payload: true }
      }),
      prisma.auditLog.findFirst({
        where: { action: "WEBSITE_MERCHANDISING_PUBLISHED", entityType, entityId },
        orderBy: { createdAt: "desc" },
        select: { after: true }
      }),
      prisma.auditLog.findFirst({
        where: { action: "WEBSITE_MERCHANDISING_ROLLED_BACK", entityType, entityId },
        orderBy: { createdAt: "desc" },
        select: { after: true }
      })
    ]);
    if (!currentPublished) throw new WebsiteMerchandisingPublicationError("No published merchandising version is available to roll back.");
    const publication = publicationAudit ? parsePublicationAudit(publicationAudit.after) : null;
    if (!publication) throw new WebsiteMerchandisingPublicationError("The current publication has no verified rollback metadata.");
    const rollback = rollbackAudit ? parseRollbackAudit(rollbackAudit.after) : null;
    if (rollback?.rollbackVersion === currentPublished.versionNumber && rollback.rolledBackPublishedVersion === publication.publishedVersion) {
      return alreadyRolledBackResult(currentPublished, rollback.targetPublishedVersion);
    }
    if (publication.publishedVersion !== currentPublished.versionNumber) {
      throw new WebsiteMerchandisingPublicationError("The latest published version was not created by the verified publication workflow; automatic rollback is refused.");
    }
    const target = publication.previousPublishedVersion === null
      ? null
      : await prisma.cmsContentVersion.findFirst({
        where: { entityType, entityId, versionNumber: publication.previousPublishedVersion },
        select: { status: true, versionNumber: true, payload: true }
      });
    if (publication.previousPublishedVersion !== null && !target) {
      throw new WebsiteMerchandisingPublicationError("The previous published merchandising version is missing.");
    }
    return planWebsiteMerchandisingRollback(currentPublished, target ?? undefined);
  } catch (error) {
    if (error instanceof WebsiteMerchandisingPublicationError || error instanceof PersistenceUnavailableError) throw error;
    throw new PersistenceUnavailableError("Website merchandising rollback audit", { cause: error });
  }
}

export async function rollbackWebsiteMerchandising(confirmation: string) {
  try {
    return await getPrismaClient().$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 'locked'::text AS status FROM pg_advisory_xact_lock(hashtext('modern-state-website-merchandising-publication'))`;
      const [currentPublished, publicationAudit, rollbackAudit, latest] = await Promise.all([
        transaction.cmsContentVersion.findFirst({
          where: { entityType, entityId, status: "PUBLISHED" },
          orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
          select: { id: true, status: true, versionNumber: true, payload: true }
        }),
        transaction.auditLog.findFirst({
          where: { action: "WEBSITE_MERCHANDISING_PUBLISHED", entityType, entityId },
          orderBy: { createdAt: "desc" },
          select: { after: true }
        }),
        transaction.auditLog.findFirst({
          where: { action: "WEBSITE_MERCHANDISING_ROLLED_BACK", entityType, entityId },
          orderBy: { createdAt: "desc" },
          select: { after: true }
        }),
        transaction.cmsContentVersion.findFirst({
          where: { entityType, entityId },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true }
        })
      ]);
      if (!currentPublished) throw new WebsiteMerchandisingPublicationError("No published merchandising version is available to roll back.");
      const publication = publicationAudit ? parsePublicationAudit(publicationAudit.after) : null;
      if (!publication) throw new WebsiteMerchandisingPublicationError("The current publication has no verified rollback metadata.");
      const rollback = rollbackAudit ? parseRollbackAudit(rollbackAudit.after) : null;
      if (rollback?.rollbackVersion === currentPublished.versionNumber && rollback.rolledBackPublishedVersion === publication.publishedVersion) {
        return { ...alreadyRolledBackResult(currentPublished, rollback.targetPublishedVersion), applied: false, rollbackVersion: rollback.rollbackVersion };
      }
      if (publication.publishedVersion !== currentPublished.versionNumber) {
        throw new WebsiteMerchandisingPublicationError("The latest published version was not created by the verified publication workflow; automatic rollback is refused.");
      }
      const target = publication.previousPublishedVersion === null
        ? null
        : await transaction.cmsContentVersion.findFirst({
          where: { entityType, entityId, versionNumber: publication.previousPublishedVersion },
          select: { status: true, versionNumber: true, payload: true }
        });
      if (publication.previousPublishedVersion !== null && !target) {
        throw new WebsiteMerchandisingPublicationError("The previous published merchandising version is missing.");
      }
      const plan = planWebsiteMerchandisingRollback(currentPublished, target ?? undefined);
      if (confirmation !== plan.confirmation) {
        throw new WebsiteMerchandisingPublicationError(`Confirmation must be ${plan.confirmation}.`);
      }
      if (!plan.canRollback) throw new WebsiteMerchandisingPublicationError("The rollback target is identical to the current published version.");

      const currentConfig = parseWebsiteMerchandising(currentPublished.payload)!;
      const targetConfig = target ? parseWebsiteMerchandising(target.payload)! : emptyMerchandisingConfig(currentConfig.updatedAt);
      const rollbackVersion = (latest?.versionNumber ?? 0) + 1;
      await transaction.cmsContentVersion.create({
        data: {
          entityType,
          entityId,
          versionNumber: rollbackVersion,
          status: "PUBLISHED",
          title: `Rollback of published merchandising v${currentPublished.versionNumber}`,
          payload: toPrismaJson(targetConfig),
          publishedAt: new Date(),
          rollbackOfVersionId: currentPublished.id
        }
      });
      await transaction.auditLog.create({
        data: {
          action: "WEBSITE_MERCHANDISING_ROLLED_BACK",
          entityType,
          entityId,
          before: {
            publishedVersion: currentPublished.versionNumber,
            digest: plan.currentDigest,
            visiblePlacements: plan.currentVisiblePlacements
          },
          after: {
            rolledBackPublishedVersion: currentPublished.versionNumber,
            rollbackVersion,
            targetPublishedVersion: plan.targetPublishedVersion,
            digest: plan.targetDigest,
            visiblePlacements: plan.targetVisiblePlacements
          }
        }
      });
      return { ...plan, applied: true, rollbackVersion };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  } catch (error) {
    if (error instanceof WebsiteMerchandisingPublicationError || error instanceof PersistenceUnavailableError) throw error;
    throw new PersistenceUnavailableError("Website merchandising rollback", { cause: error });
  }
}

function parsePublicationAudit(value: unknown) {
  const record = objectRecord(value);
  const publishedVersion = integerValue(record?.publishedVersion);
  const previous = record?.previousPublishedVersion;
  const previousPublishedVersion = previous === null ? null : integerValue(previous);
  if (publishedVersion === null || (previous !== null && previousPublishedVersion === null)) return null;
  return { publishedVersion, previousPublishedVersion };
}

function parseRollbackAudit(value: unknown) {
  const record = objectRecord(value);
  const rolledBackPublishedVersion = integerValue(record?.rolledBackPublishedVersion);
  const rollbackVersion = integerValue(record?.rollbackVersion);
  const target = record?.targetPublishedVersion;
  const targetPublishedVersion = target === null ? null : integerValue(target);
  if (rolledBackPublishedVersion === null || rollbackVersion === null || (target !== null && targetPublishedVersion === null)) return null;
  return { rolledBackPublishedVersion, rollbackVersion, targetPublishedVersion };
}

function alreadyRolledBackResult(currentPublished: ContentVersionReference, targetPublishedVersion: number | null) {
  const config = parseWebsiteMerchandising(currentPublished.payload);
  if (!config) throw new WebsiteMerchandisingPublicationError("The rollback version is invalid.");
  const digest = digestPayload(config);
  return {
    currentPublishedVersion: currentPublished.versionNumber,
    targetPublishedVersion,
    currentDigest: digest,
    targetDigest: digest,
    confirmation: "",
    currentVisiblePlacements: config.placements.filter((placement) => placement.visible).length,
    targetVisiblePlacements: config.placements.filter((placement) => placement.visible).length,
    canRollback: false,
    alreadyRolledBack: true
  };
}

function emptyMerchandisingConfig(updatedAt: string) {
  return { version: 3 as const, updatedAt, categories: [], brands: [], holidays: [], placements: [] };
}

function objectRecord(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function integerValue(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function selectLatestPublicationSource<T extends { versionNumber: number }>(candidate: T | null, published: T | null) {
  if (!candidate) return published;
  if (!published) return candidate;
  return candidate.versionNumber > published.versionNumber ? candidate : published;
}

function digestPayload(value: unknown) {
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
