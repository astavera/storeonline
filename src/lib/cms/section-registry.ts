/**
 * Provides shared section registry types and utilities for the application.
 */

import { cmsKnownSectionTypes, type CmsKnownSectionType, type CmsScope, type CmsSection, type CmsSectionType, type SectionRegistryItem } from "./cms-types";
import { createSectionDataSource } from "./data-sources";
import { defaultResponsiveVisibility, sectionDefinitions, settingsSchemaFor } from "./section-defaults";

export const legacySectionTypeAliases: Record<string, CmsKnownSectionType> = {
  "product-grid": "productGrid",
  "image-banner": "hero",
  "feature-grid": "featuredCategories",
  "split-media": "splitMedia",
  "trust-bar": "trustBar",
  departments: "featuredCategories",
  promo: "promoBanner",
  storefront: "storeLocationCard",
  content: "editorialStory"
};

export const sectionRegistry: SectionRegistryItem[] = sectionDefinitions.map((definition) => ({
  ...definition,
  defaultVisibility: { ...defaultResponsiveVisibility },
  settingsSchema: definition.settingsSchema ?? settingsSchemaFor(definition.type)
}));

const registryByType = new Map<CmsKnownSectionType, SectionRegistryItem>(sectionRegistry.map((item) => [item.type, item]));

export function isKnownSectionType(type: string): type is CmsKnownSectionType {
  return (cmsKnownSectionTypes as readonly string[]).includes(type);
}

export function normalizeSectionType(type: CmsSectionType): CmsKnownSectionType | null {
  if (typeof type !== "string") {
    return null;
  }

  if (isKnownSectionType(type)) {
    return type;
  }

  return legacySectionTypeAliases[type] ?? null;
}

export function resolveSectionRegistryItem(type: CmsSectionType): SectionRegistryItem | null {
  const normalizedType = normalizeSectionType(type);

  return normalizedType ? registryByType.get(normalizedType) ?? null : null;
}

export function getSectionRegistryItem(type: CmsSectionType): SectionRegistryItem {
  const item = resolveSectionRegistryItem(type);

  if (!item) {
    throw new Error(`Unknown CMS section type: ${type}`);
  }

  return item;
}

export function isSectionCompatibleWithScope(type: CmsSectionType, scope: CmsScope) {
  const item = resolveSectionRegistryItem(type);

  return Boolean(item?.compatibleScopes.includes(scope));
}

export function sectionsForScope(scope: CmsScope) {
  return sectionRegistry.filter((item) => item.compatibleScopes.includes(scope));
}

export function createCmsSection(type: CmsKnownSectionType, input: Partial<CmsSection> = {}): CmsSection {
  const item = getSectionRegistryItem(type);
  const nowId = `${type}-${Date.now().toString(36)}`;

  return {
    id: input.id ?? nowId,
    type,
    variant: input.variant ?? item.variants[0]?.id ?? "standard",
    label: input.label ?? item.label,
    hidden: input.hidden ?? false,
    locked: input.locked ?? false,
    content: {
      ...item.defaultContent,
      ...input.content
    },
    design: {
      ...item.defaultDesign,
      ...input.design
    },
    layout: {
      ...item.defaultLayout,
      ...input.layout
    },
    media: {
      ...item.defaultMedia,
      ...input.media
    },
    dataSource: {
      ...createSectionDataSource(item.defaultDataSource.type),
      ...item.defaultDataSource,
      ...input.dataSource
    },
    visibility: {
      ...item.defaultVisibility,
      ...input.visibility
    },
    advanced: {
      ...input.advanced
    }
  };
}

export function createUnknownSectionFallback(section: Pick<CmsSection, "id" | "type" | "label">): CmsSection {
  return createCmsSection("emptyState", {
    id: `${section.id}.fallback`,
    label: `Unsupported: ${section.label || section.type}`,
    content: {
      title: "Unsupported section",
      body: `The section type "${section.type}" is not registered yet. The page can still render safely while the registry is updated.`
    },
    advanced: {
      notes: "Development fallback for an unknown CMS section type."
    }
  });
}
