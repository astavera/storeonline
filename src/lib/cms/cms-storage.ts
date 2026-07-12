import type { CmsEntityType, CmsPageDocument } from "./cms-types";
import { buildCmsDocumentId, normalizeCmsEntityId } from "./cms-scopes";
import { validateCmsPageDocument } from "./validation";

export type CmsStoragePayload = {
  cmsDocument: CmsPageDocument;
};

export function cmsStorageEntityId(entityType: CmsEntityType, entityId: string) {
  return buildCmsDocumentId(entityType, normalizeCmsEntityId(entityId));
}

export function serializeCmsPageDocument(document: CmsPageDocument): CmsStoragePayload {
  return {
    cmsDocument: document
  };
}

export function parseCmsPageDocumentPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("cmsDocument" in payload)) {
    return {
      ok: false as const,
      document: null,
      errors: ["payload.cmsDocument is required."]
    };
  }

  return validateCmsPageDocument((payload as Partial<CmsStoragePayload>).cmsDocument);
}
