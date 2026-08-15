/**
 * Provides shared CMS scopes types and utilities for the application.
 */

import { cmsScopes, type CmsEntityType, type CmsScope } from "./cms-types";

export { cmsScopes, type CmsScope };

export const cmsScopeEntityTypeMap: Record<CmsScope, CmsEntityType> = {
  homepage: "homepage",
  department: "department",
  holiday: "holiday",
  product: "product",
  location: "location",
  policy: "policy",
  landing: "landing",
  "global-header": "globalHeader",
  "global-footer": "globalFooter",
  theme: "theme"
};

export function normalizeCmsScope(value: string): CmsScope | null {
  return (cmsScopes as readonly string[]).includes(value) ? (value as CmsScope) : null;
}

export function cmsScopeToEntityType(scope: CmsScope): CmsEntityType {
  return cmsScopeEntityTypeMap[scope];
}

export function cmsEntityTypeToScope(entityType: CmsEntityType): CmsScope {
  const match = Object.entries(cmsScopeEntityTypeMap).find(([, mappedEntityType]) => mappedEntityType === entityType);

  return (match?.[0] as CmsScope | undefined) ?? "landing";
}

export function buildCmsDocumentId(entityType: CmsEntityType, entityId: string) {
  return `${entityType}:${entityId}`;
}

export function normalizeCmsEntityId(entityId: string) {
  return entityId.trim().replace(/[^a-zA-Z0-9._-]/g, "-") || "default";
}
