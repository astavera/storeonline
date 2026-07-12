import type { CmsPageDocument, CmsVersionStatus } from "./cms-types";

export type CmsDocumentVersionSummary = {
  version: number;
  status: CmsVersionStatus;
  title: string;
  updatedAt: string;
  publishedAt: string | null;
};

export function canPublishCmsDocument(document: CmsPageDocument) {
  return document.status === "DRAFT" || document.status === "PREVIEW";
}

export function markCmsDocumentPublished(document: CmsPageDocument, now = new Date().toISOString()): CmsPageDocument {
  return {
    ...document,
    status: "PUBLISHED",
    updatedAt: now,
    publishedAt: now,
    version: document.version + 1
  };
}

export function createCmsDraftVersion(document: CmsPageDocument, now = new Date().toISOString()): CmsPageDocument {
  return {
    ...document,
    status: "DRAFT",
    updatedAt: now,
    publishedAt: null,
    version: document.version + 1
  };
}

export function summarizeCmsDocumentVersion(document: CmsPageDocument): CmsDocumentVersionSummary {
  return {
    version: document.version,
    status: document.status,
    title: document.title,
    updatedAt: document.updatedAt,
    publishedAt: document.publishedAt
  };
}

export function selectLatestPublishedCmsDocument(documents: CmsPageDocument[]) {
  return [...documents]
    .filter((document) => document.status === "PUBLISHED")
    .sort((a, b) => b.version - a.version || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
}
