import "server-only";

import type { CmsEntityType, CmsPageDocument, CmsVersionStatus } from "@/lib/cms";
import { parseCmsPageDocumentPayload, serializeCmsPageDocument, validateCmsPageDocument } from "@/lib/cms";
import { readLocalCmsVersions, writeLocalCmsVersion, type LocalCmsStatus } from "./admin-local-cms-store";
import { createDatabaseCmsVersion, readLatestDatabaseCmsVersion } from "@/server/db/cms-version-repository";
import {
  isDevelopmentLocalPersistenceEnabled,
  PersistenceUnavailableError,
  requireDatabaseOrDevelopmentFallback
} from "@/server/db/persistence-policy";

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
  const persistence = requireDatabaseOrDevelopmentFallback("CMS");

  if (persistence === "database") {
    try {
      const record = await readLatestDatabaseCmsVersion({
        entityType: `CMS_${input.entityType}`,
        entityId: input.entityId,
        statuses
      });
      if (!record) {
        return null;
      }

      const parsed = parseCmsPageDocumentPayload(record.payload);
      if (!parsed.ok) throw new PersistenceUnavailableError("CMS content");
      return parsed.document;
    } catch (error) {
      if (!isDevelopmentLocalPersistenceEnabled()) throw error;
      console.warn("[development-local-persistence] CMS database read failed; reading the explicit local fallback.");
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

  const persistence = requireDatabaseOrDevelopmentFallback("CMS");

  if (persistence === "database") {
    try {
      const created = await createDatabaseCmsVersion({
        entityType: `CMS_${validation.document.entityType}`,
        entityId: validation.document.entityId,
        status,
        title: validation.document.title,
        payload,
        publishedAt: status === "PUBLISHED" ? new Date(now) : null
      });
      return {
        ok: true,
        status,
        errors: [],
        storage: {
          mode: "database",
          persisted: true,
          id: created.id,
          versionNumber: created.versionNumber,
          message: `Saved CMS document version ${created.versionNumber}.`
        }
      };
    } catch (error) {
      if (!isDevelopmentLocalPersistenceEnabled()) return failedPersistenceResult(status, error);
      console.warn("[development-local-persistence] CMS database write failed; using the explicit local fallback.");
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

function failedPersistenceResult(status: CmsVersionStatus, error: unknown): PersistCmsDocumentResult {
  const persistenceError = error instanceof PersistenceUnavailableError ? error : new PersistenceUnavailableError("CMS", { cause: error });
  return {
    ok: false,
    status,
    errors: [persistenceError.message],
    storage: { mode: "validated-only", persisted: false, message: persistenceError.message }
  };
}

function toLocalCmsStatus(status: CmsVersionStatus): LocalCmsStatus {
  if (status === "ARCHIVED") {
    return "UNPUBLISHED";
  }

  return status;
}
