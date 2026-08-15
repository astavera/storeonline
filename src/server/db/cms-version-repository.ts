/**
 * Implements server-side CMS version repository behavior and persistence boundaries.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { toPrismaJson } from "@/server/prisma-json";

type CmsVersionTransaction = {
  cmsContentVersion: {
    findFirst(args: unknown): Promise<{ versionNumber: number } | null>;
    create(args: unknown): Promise<{ id: string; versionNumber: number }>;
  };
};

export type CmsVersionTransactionRunner = {
  $transaction<T>(
    operation: (transaction: CmsVersionTransaction) => Promise<T>,
    options: { isolationLevel: "Serializable" }
  ): Promise<T>;
};

export type CreateCmsVersionInput = {
  entityType: string;
  entityId: string;
  status: string;
  title: string;
  payload: unknown;
  publishedAt?: Date | null;
  scheduledPublishAt?: Date | null;
  scheduledUnpublishAt?: Date | null;
};

export async function readLatestDatabaseCmsVersion(input: {
  entityType: string;
  entityId: string;
  statuses?: string[];
}) {
  try {
    return await getPrismaClient().cmsContentVersion.findFirst({
      where: {
        entityType: input.entityType,
        entityId: input.entityId,
        ...(input.statuses ? { status: { in: input.statuses as never[] } } : {})
      },
      orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }]
    });
  } catch (error) {
    throw new PersistenceUnavailableError("CMS", { cause: error });
  }
}

export async function readDatabaseCmsVersions(input: {
  entityType: string;
  entityId: string;
  limit?: number;
}) {
  try {
    return await getPrismaClient().cmsContentVersion.findMany({
      where: {
        entityType: input.entityType,
        entityId: input.entityId
      },
      orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
      take: Math.min(Math.max(input.limit ?? 12, 1), 50),
      select: {
        versionNumber: true,
        status: true,
        title: true,
        createdAt: true
      }
    });
  } catch (error) {
    throw new PersistenceUnavailableError("CMS", { cause: error });
  }
}

export async function readDatabaseCmsVersion(input: {
  entityType: string;
  entityId: string;
  versionNumber: number;
}) {
  try {
    return await getPrismaClient().cmsContentVersion.findUnique({
      where: {
        entityType_entityId_versionNumber: {
          entityType: input.entityType,
          entityId: input.entityId,
          versionNumber: input.versionNumber
        }
      }
    });
  } catch (error) {
    throw new PersistenceUnavailableError("CMS", { cause: error });
  }
}

export async function createDatabaseCmsVersion(
  input: CreateCmsVersionInput,
  runner: CmsVersionTransactionRunner = getPrismaClient() as unknown as CmsVersionTransactionRunner,
  maxAttempts = 3
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runner.$transaction(async (transaction) => {
        const latest = await transaction.cmsContentVersion.findFirst({
          where: { entityType: input.entityType, entityId: input.entityId },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true }
        });
        const versionNumber = (latest?.versionNumber ?? 0) + 1;
        const created = await transaction.cmsContentVersion.create({
          data: {
            entityType: input.entityType,
            entityId: input.entityId,
            versionNumber,
            status: input.status,
            title: input.title,
            payload: toPrismaJson(input.payload),
            publishedAt: input.publishedAt ?? null,
            scheduledPublishAt: input.scheduledPublishAt ?? null,
            scheduledUnpublishAt: input.scheduledUnpublishAt ?? null
          },
          select: { id: true, versionNumber: true }
        });
        return created;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (attempt < maxAttempts && isRetryableWriteConflict(error)) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 10));
        continue;
      }
      throw new PersistenceUnavailableError("CMS", { cause: error });
    }
  }

  throw new PersistenceUnavailableError("CMS");
}

function isRetryableWriteConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code === "P2002" || error.code === "P2034"
    : Boolean(error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034"));
}
