/**
 * Permanently removes editable storefront CMS pages while retaining a minimal
 * tombstone so configured routes stay hidden and return 404.
 */

import "server-only";

import type { CmsEntityType } from "@/lib/cms";
import { getPrismaClient } from "@/server/db/prisma";
import {
  isDevelopmentLocalPersistenceEnabled,
  PersistenceUnavailableError,
  requireDatabaseOrDevelopmentFallback
} from "@/server/db/persistence-policy";
import { toPrismaJson } from "@/server/prisma-json";
import {
  readLocalCmsVersions,
  readLocalCmsVersionsByEntityPrefix,
  replaceLocalCmsVersions,
  type LocalCmsVersion
} from "./admin-local-cms-store";

const deletableEntityTypes = new Set<CmsEntityType>([
  "department",
  "holiday",
  "location",
  "policy",
  "landing"
]);

type StorefrontPageDeletionPayload = {
  deleted: true;
  deletedAt: string;
  entityId: string;
  entityType: CmsEntityType;
  title: string;
};

export type DeletedStorefrontPage = {
  deletedAt: string;
  entityId: string;
  entityType: CmsEntityType;
  key: string;
  title: string;
};

export function storefrontPageDeletionKey(entityType: CmsEntityType, entityId: string) {
  return `${entityType}:${entityId}`;
}

export function canDeleteStorefrontPage(entityType: CmsEntityType, entityId: string) {
  return deletableEntityTypes.has(entityType) && entityId.trim().length > 0;
}

export async function deleteStorefrontPage(input: {
  entityId: string;
  entityType: CmsEntityType;
  title: string;
}) {
  if (!canDeleteStorefrontPage(input.entityType, input.entityId)) {
    throw new Error("This core or operational page cannot be deleted.");
  }

  const deletedAt = new Date().toISOString();
  const payload: StorefrontPageDeletionPayload = {
    deleted: true,
    deletedAt,
    entityId: input.entityId,
    entityType: input.entityType,
    title: input.title.trim() || input.entityId
  };
  const persistence = requireDatabaseOrDevelopmentFallback("Storefront page deletion");

  if (persistence === "database") {
    try {
      const database = getPrismaClient();
      const entityType = databaseEntityType(input.entityType);

      await database.$transaction(async (transaction) => {
        await transaction.cmsContentVersion.deleteMany({
          where: { entityType, entityId: input.entityId }
        });
        await transaction.cmsContentVersion.create({
          data: {
            entityType,
            entityId: input.entityId,
            versionNumber: 1,
            status: "ARCHIVED",
            title: payload.title,
            payload: toPrismaJson(payload)
          }
        });
      });

      return { deleted: true, deletedAt, mode: "database" as const };
    } catch (error) {
      if (!isDevelopmentLocalPersistenceEnabled()) {
        throw new PersistenceUnavailableError("Storefront page deletion", { cause: error });
      }
      console.warn("[development-local-persistence] Storefront page deletion database write failed; using the explicit local fallback.");
    }
  }

  await replaceLocalCmsVersions(
    localEntityId(input.entityType, input.entityId),
    [localDeletionVersion(payload)]
  );

  return { deleted: true, deletedAt, mode: "local-file" as const };
}

export async function isStorefrontPageDeleted(input: {
  entityId: string;
  entityType: CmsEntityType;
}) {
  if (!canDeleteStorefrontPage(input.entityType, input.entityId)) {
    return false;
  }

  const persistence = requireDatabaseOrDevelopmentFallback("Storefront page deletion");

  if (persistence === "database") {
    try {
      const latest = await getPrismaClient().cmsContentVersion.findFirst({
        where: {
          entityType: databaseEntityType(input.entityType),
          entityId: input.entityId
        },
        orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
        select: { payload: true, status: true }
      });

      return latest?.status === "ARCHIVED" && isStorefrontPageDeletionPayload(latest.payload);
    } catch (error) {
      if (!isDevelopmentLocalPersistenceEnabled()) {
        throw new PersistenceUnavailableError("Storefront page deletion", { cause: error });
      }
      console.warn("[development-local-persistence] Storefront page deletion database read failed; using the explicit local fallback.");
    }
  }

  const versions = await readLocalCmsVersions(localEntityId(input.entityType, input.entityId));
  const latest = versions.sort(
    (first, second) =>
      second.versionNumber - first.versionNumber ||
      Date.parse(second.createdAt) - Date.parse(first.createdAt)
  )[0];

  return Boolean(latest && isStorefrontPageDeletionPayload(latest.payload));
}

export async function listDeletedStorefrontPages(): Promise<DeletedStorefrontPage[]> {
  const persistence = requireDatabaseOrDevelopmentFallback("Storefront page deletion");

  if (persistence === "database") {
    try {
      const records = await getPrismaClient().cmsContentVersion.findMany({
        where: {
          entityType: { startsWith: "CMS_" },
          status: "ARCHIVED"
        },
        orderBy: { createdAt: "desc" },
        select: { payload: true }
      });

      return uniqueDeletedPages(
        records
          .map((record) => deletedPageFromPayload(record.payload))
          .filter((page): page is DeletedStorefrontPage => Boolean(page))
      );
    } catch (error) {
      if (!isDevelopmentLocalPersistenceEnabled()) {
        throw new PersistenceUnavailableError("Storefront page deletion", { cause: error });
      }
      console.warn("[development-local-persistence] Storefront page deletion list failed; using the explicit local fallback.");
    }
  }

  const versions = await readLocalCmsVersionsByEntityPrefix("cms-");
  return uniqueDeletedPages(
    versions
      .map((version) => deletedPageFromPayload(version.payload))
      .filter((page): page is DeletedStorefrontPage => Boolean(page))
  );
}

export function isStorefrontPageDeletionPayload(value: unknown): value is StorefrontPageDeletionPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<StorefrontPageDeletionPayload>;
  return (
    payload.deleted === true &&
    typeof payload.deletedAt === "string" &&
    typeof payload.entityId === "string" &&
    typeof payload.entityType === "string" &&
    deletableEntityTypes.has(payload.entityType as CmsEntityType) &&
    typeof payload.title === "string"
  );
}

function deletedPageFromPayload(value: unknown): DeletedStorefrontPage | null {
  if (!isStorefrontPageDeletionPayload(value)) {
    return null;
  }

  return {
    deletedAt: value.deletedAt,
    entityId: value.entityId,
    entityType: value.entityType,
    key: storefrontPageDeletionKey(value.entityType, value.entityId),
    title: value.title
  };
}

function uniqueDeletedPages(pages: DeletedStorefrontPage[]) {
  return Array.from(new Map(pages.map((page) => [page.key, page])).values());
}

function databaseEntityType(entityType: CmsEntityType) {
  return `CMS_${entityType}`;
}

function localEntityId(entityType: CmsEntityType, entityId: string) {
  return `cms-${entityType}-${entityId}`;
}

function localDeletionVersion(payload: StorefrontPageDeletionPayload): LocalCmsVersion {
  return {
    entityType: "ADMIN_MODULE",
    entityId: localEntityId(payload.entityType, payload.entityId),
    versionNumber: 1,
    status: "UNPUBLISHED",
    title: payload.title,
    payload,
    createdAt: payload.deletedAt,
    publishedAt: null
  };
}
