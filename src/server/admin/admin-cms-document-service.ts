import "server-only";

import type { CmsEntityType, CmsPageDocument, CmsVersionStatus } from "@/lib/cms";
import { parseCmsPageDocumentPayload, serializeCmsPageDocument, validateCmsPageDocument } from "@/lib/cms";
import { readLocalCmsVersions, writeLocalCmsVersion, type LocalCmsStatus } from "./admin-local-cms-store";

export type CmsDocumentOperation = "save_draft" | "preview" | "publish";

export type CmsDocumentStorageResult = {
  mode: "database" | "local-file" | "validated-only";
  persisted: boolean;
  message: string;
  id?: string;
  versionNumber?: number;
};

export type PersistCmsDocumentResult = {
  ok: boolean;
  status?: CmsVersionStatus;
  storage?: CmsDocumentStorageResult;
  errors: string[];
};

export type ReadCmsDocumentInput = {
  entityType: CmsEntityType;
  entityId: string;
  statuses?: CmsVersionStatus[];
};

const operationStatus: Record<CmsDocumentOperation, CmsVersionStatus> = {
  save_draft: "DRAFT",
  preview: "PREVIEW",
  publish: "PUBLISHED"
};

export async function readLatestCmsDocument(input: ReadCmsDocumentInput): Promise<CmsPageDocument | null> {
  const statuses = input.statuses ?? ["PUBLISHED"];

  if (process.env.DATABASE_URL) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      const cmsContentVersion = (prisma as any).cmsContentVersion;
      const record = await cmsContentVersion.findFirst({
        where: {
          entityType: `CMS_${input.entityType}`,
          entityId: input.entityId,
          status: {
            in: statuses
          }
        },
        orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }]
      });
      await prisma.$disconnect();

      if (!record) {
        return null;
      }

      const parsed = parseCmsPageDocumentPayload(record.payload);
      return parsed.ok ? parsed.document : null;
    } catch {
      return null;
    }
  }

  const versions = await readLocalCmsVersions(`cms-${input.entityType}-${input.entityId}`);
  const latest = versions
    .filter((version) => statuses.includes(version.status as CmsVersionStatus))
    .sort((a, b) => b.versionNumber - a.versionNumber || Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

  if (!latest) {
    return null;
  }

  const parsed = parseCmsPageDocumentPayload(latest.payload);
  return parsed.ok ? parsed.document : null;
}

export async function persistCmsDocument(input: { document: CmsPageDocument; operation: CmsDocumentOperation }): Promise<PersistCmsDocumentResult> {
  const status = operationStatus[input.operation];
  const now = new Date().toISOString();
  const document: CmsPageDocument = {
    ...input.document,
    status,
    updatedAt: now,
    publishedAt: status === "PUBLISHED" ? now : input.document.publishedAt
  };
  const validation = validateCmsPageDocument(document);

  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors
    };
  }

  const payload = serializeCmsPageDocument(validation.document);

  if (process.env.DATABASE_URL) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      const cmsContentVersion = (prisma as any).cmsContentVersion;
      const latest = await cmsContentVersion.aggregate({
        where: {
          entityType: `CMS_${validation.document.entityType}`,
          entityId: validation.document.entityId
        },
        _max: {
          versionNumber: true
        }
      });
      const nextVersionNumber = (latest._max.versionNumber ?? 0) + 1;
      const created = await cmsContentVersion.create({
        data: {
          entityType: `CMS_${validation.document.entityType}`,
          entityId: validation.document.entityId,
          versionNumber: nextVersionNumber,
          status,
          title: validation.document.title,
          payload,
          publishedAt: status === "PUBLISHED" ? new Date(now) : null
        }
      });
      await prisma.$disconnect();

      return {
        ok: true,
        status,
        errors: [],
        storage: {
          mode: "database",
          persisted: true,
          id: created.id,
          versionNumber: nextVersionNumber,
          message: `Saved CMS document version ${nextVersionNumber}.`
        }
      };
    } catch (error) {
      return {
        ok: true,
        status,
        errors: [],
        storage: {
          mode: "validated-only",
          persisted: false,
          message: `Validated but database persistence failed: ${error instanceof Error ? error.message : "unknown error"}`
        }
      };
    }
  }

  const localVersion = await writeLocalCmsVersion({
    entityType: "ADMIN_MODULE",
    entityId: `cms-${validation.document.entityType}-${validation.document.entityId}`,
    status: toLocalCmsStatus(status),
    title: validation.document.title,
    payload
  });

  return {
    ok: true,
    status,
    errors: [],
    storage: {
      mode: "local-file",
      persisted: true,
      id: `${localVersion.entityId}:${localVersion.versionNumber}`,
      versionNumber: localVersion.versionNumber,
      message: `Saved local CMS document version ${localVersion.versionNumber}.`
    }
  };
}

function toLocalCmsStatus(status: CmsVersionStatus): LocalCmsStatus {
  if (status === "ARCHIVED") {
    return "UNPUBLISHED";
  }

  return status;
}
