/**
 * Implements server-side admin CMS document service behavior and persistence boundaries.
 */

import "server-only";

import type { CmsEntityType, CmsPageDocument, CmsVersionStatus } from "@/lib/cms";
import { parseCmsPageDocumentPayload, serializeCmsPageDocument, validateCmsPageDocument } from "@/lib/cms";
import { readLocalCmsVersions, writeLocalCmsVersion, type LocalCmsStatus } from "./admin-local-cms-store";
import {
  createDatabaseCmsVersion,
  readDatabaseCmsVersion,
  readDatabaseCmsVersions,
  readLatestDatabaseCmsVersion
} from "@/server/db/cms-version-repository";
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

export type CmsDocumentVersionSummary = {
  status: string;
  title: string;
  updatedAt: string;
  version: number;
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

export async function listCmsDocumentVersions(input: {
  entityType: CmsEntityType;
  entityId: string;
  limit?: number;
}): Promise<CmsDocumentVersionSummary[]> {
  const persistence = requireDatabaseOrDevelopmentFallback("CMS");

  if (persistence === "database") {
    try {
      const versions = await readDatabaseCmsVersions({
        entityType: `CMS_${input.entityType}`,
        entityId: input.entityId,
        limit: input.limit
      });
      return versions.map((version) => ({
        status: version.status,
        title: version.title ?? input.entityId,
        updatedAt: version.createdAt.toISOString(),
        version: version.versionNumber
      }));
    } catch (error) {
      if (!isDevelopmentLocalPersistenceEnabled()) throw error;
      console.warn("[development-local-persistence] CMS history read failed; reading the explicit local fallback.");
    }
  }

  const versions = await readLocalCmsVersions(`cms-${input.entityType}-${input.entityId}`);
  return versions
    .sort((a, b) => b.versionNumber - a.versionNumber || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, Math.min(Math.max(input.limit ?? 12, 1), 50))
    .map((version) => ({
      status: version.status,
      title: version.title,
      updatedAt: version.createdAt,
      version: version.versionNumber
    }));
}

export async function readCmsDocumentVersion(input: {
  entityType: CmsEntityType;
  entityId: string;
  versionNumber: number;
}): Promise<CmsPageDocument | null> {
  const persistence = requireDatabaseOrDevelopmentFallback("CMS");

  if (persistence === "database") {
    try {
      const version = await readDatabaseCmsVersion({
        entityType: `CMS_${input.entityType}`,
        entityId: input.entityId,
        versionNumber: input.versionNumber
      });
      if (!version) return null;
      const parsed = parseCmsPageDocumentPayload(version.payload);
      return parsed.ok ? parsed.document : null;
    } catch (error) {
      if (!isDevelopmentLocalPersistenceEnabled()) throw error;
      console.warn("[development-local-persistence] CMS version read failed; reading the explicit local fallback.");
    }
  }

  const versions = await readLocalCmsVersions(`cms-${input.entityType}-${input.entityId}`);
  const version = versions.find((candidate) => candidate.versionNumber === input.versionNumber);
  if (!version) return null;
  const parsed = parseCmsPageDocumentPayload(version.payload);
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
          message: status === "PUBLISHED" ? "Published successfully" : `Saved CMS document version ${created.versionNumber}.`
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
      message: status === "PUBLISHED" ? "Published successfully" : `Saved local CMS document version ${localVersion.versionNumber}.`
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
