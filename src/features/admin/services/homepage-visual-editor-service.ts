import "server-only";

import { defaultHeaderNavigation, normalizeHeaderNavigation, type HeaderNavigationConfig } from "@/config/header-navigation.config";
import { defaultHomepageImage, homepageImagePresets, homepageSectionElements, homepageSections, type HomepageImagePreset, type HomepageSectionConfig } from "@/config/homepage.config";
import type { CmsVersionStatus } from "@/lib/cms";
import { readLocalCmsVersions, type LocalCmsVersion } from "@/server/admin/admin-local-cms-store";

type CmsHomepagePayload = {
  changeSummary?: string;
  headerNavigation?: string | HeaderNavigationConfig;
  photoPresets?: string | HomepageImagePreset[];
  seoMetadata?: string | Partial<HomepageSeoConfig>;
  summary?: string;
  visualSections?: string | HomepageSectionConfig[];
};

export type HomepageSeoConfig = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  canonicalUrl: string;
  indexable: boolean;
};

export type HomepageVersionSummary = {
  versionNumber: number;
  status: string;
  title: string;
  createdAt: string;
  publishedAt: string | null;
  summary: string;
};

export type HomepageVisualEditorState = {
  headerNavigation: HeaderNavigationConfig;
  photoPresets: HomepageImagePreset[];
  sections: HomepageSectionConfig[];
  seo: HomepageSeoConfig;
  versions: HomepageVersionSummary[];
};

type HomepageStoredVersion = Omit<LocalCmsVersion, "status"> & {
  status: string;
};

export const defaultHomepageSeo: HomepageSeoConfig = {
  title: "Modern State - State News NYC",
  description: "Toys, party supplies, balloons, stationery, arts and crafts, greeting cards, and gifts on the Upper East Side.",
  ogTitle: "Modern State - State News NYC",
  ogDescription: "Shop Modern State for toys, balloons, party supplies, stationery, gifts, and neighborhood essentials.",
  ogImage: defaultHomepageImage,
  canonicalUrl: "/",
  indexable: true
};

export function normalizeHomepageSections(sections: HomepageSectionConfig[]) {
  return sections
    .filter((section) => section && typeof section === "object")
    .map((section, index) => ({
      ...section,
      sectionId: typeof section.sectionId === "string" && section.sectionId.trim() ? section.sectionId : `home.custom.section-${index + 1}`,
      sectionType: section.sectionType ?? sectionTypeFromSectionId(section.sectionId),
      title: typeof section.title === "string" ? section.title : "Untitled section",
      body: typeof section.body === "string" ? section.body : "",
      sortOrder: Number.isFinite(section.sortOrder) ? section.sortOrder : (index + 1) * 10,
      isVisible: section.isVisible !== false,
      hiddenElements: Array.isArray(section.hiddenElements) ? section.hiddenElements.filter((element) => homepageSectionElements.includes(element)) : undefined,
      items: Array.isArray(section.items) ? section.items : undefined
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getPublishedHomepageSections() {
  const state = await getPublishedHomepageState();

  return state.sections;
}

export async function getHomepageEditorState(): Promise<HomepageVisualEditorState> {
  const fallbackState = fallbackHomepageState();
  const versions = await readHomepageVersions();
  const editableVersion = versions.find((version) => ["DRAFT", "PREVIEW", "PUBLISHED"].includes(version.status));

  if (!editableVersion) {
    return {
      ...fallbackState,
      versions: versions.map(toHomepageVersionSummary)
    };
  }

  return buildHomepageStateFromPayload(editableVersion.payload, {
    ...fallbackState,
    versions: versions.map(toHomepageVersionSummary)
  });
}

export async function getPublishedHomepageState(): Promise<HomepageVisualEditorState> {
  const fallbackState = fallbackHomepageState();
  const versions = await readHomepageVersions("PUBLISHED");
  const publishedVersion = versions[0];

  if (!publishedVersion) {
    return fallbackState;
  }

  return buildHomepageStateFromPayload(publishedVersion.payload, {
    ...fallbackState,
    versions: versions.map(toHomepageVersionSummary)
  });
}

async function readHomepageVersions(status?: CmsVersionStatus): Promise<HomepageStoredVersion[]> {
  if (process.env.DATABASE_URL) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      const cmsContentVersion = prisma.cmsContentVersion;
      const records = await cmsContentVersion.findMany({
        where: {
          entityType: "ADMIN_MODULE",
          entityId: "homepage",
          ...(status ? { status } : {})
        },
        orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
        take: 12
      });
      await prisma.$disconnect();

      return records.map((record) => ({
        entityType: "ADMIN_MODULE" as const,
        entityId: "homepage",
        versionNumber: Number(record.versionNumber),
        status: String(record.status),
        title: String(record.title ?? "Homepage Sections"),
        payload: asPayload(record.payload),
        createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : new Date().toISOString(),
        publishedAt: record.publishedAt instanceof Date ? record.publishedAt.toISOString() : null
      }));
    } catch {
      return readLocalHomepageVersions(status);
    }
  }

  return readLocalHomepageVersions(status);
}

async function readLocalHomepageVersions(status?: string): Promise<HomepageStoredVersion[]> {
  try {
    const localVersions = await readLocalCmsVersions("homepage");

    return localVersions.filter((version) => !status || version.status === status).sort((a, b) => b.versionNumber - a.versionNumber);
  } catch {
    return [];
  }
}

export function mergeHomepageSections(baseSections: HomepageSectionConfig[], editedSections: HomepageSectionConfig[]) {
  const baseById = new Map(baseSections.map((section) => [section.sectionId, section]));
  const editedIds = new Set(editedSections.map((section) => section.sectionId));

  return normalizeHomepageSections(
    [
      ...editedSections.map((section) =>
        baseById.has(section.sectionId)
          ? {
          ...baseById.get(section.sectionId)!,
            ...section,
            sectionType: section.sectionType ?? baseById.get(section.sectionId)!.sectionType
          }
          : section
      ),
      ...baseSections.filter((section) => !editedIds.has(section.sectionId)).map((section) => ({
        ...baseById.get(section.sectionId)!,
        sortOrder: Number.MAX_SAFE_INTEGER
      }))
    ]
  );
}

export function normalizeHomepageImagePresets(presets: HomepageImagePreset[]) {
  const seenIds = new Set<string>();
  const normalizedPresets = presets.map((preset, index) => {
    const source = preset && typeof preset === "object" ? preset : ({} as HomepageImagePreset);
    const fallbackId = `preset-${index + 1}`;
    const rawId = typeof source.id === "string" ? source.id.trim() : "";
    const rawLabel = typeof source.label === "string" ? source.label.trim() : "";
    const rawUrl = typeof source.url === "string" ? source.url.trim() : "";
    const baseId = rawId || fallbackId;
    const id = seenIds.has(baseId) ? `${baseId}-${index + 1}` : baseId;
    seenIds.add(id);

    return {
      id,
      label: rawLabel || `Photo ${index + 1}`,
      url: rawUrl || defaultHomepageImage
    };
  });

  return normalizedPresets.length > 0 ? normalizedPresets : homepageImagePresets;
}

function parsePhotoPresets(value: CmsHomepagePayload["photoPresets"]) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseVisualSections(value: CmsHomepagePayload["visualSections"]) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fallbackHomepageState(): HomepageVisualEditorState {
  return {
    headerNavigation: defaultHeaderNavigation,
    photoPresets: normalizeHomepageImagePresets(homepageImagePresets),
    sections: normalizeHomepageSections(homepageSections),
    seo: defaultHomepageSeo,
    versions: []
  };
}

function buildHomepageStateFromPayload(payload: CmsHomepagePayload, fallbackState: HomepageVisualEditorState): HomepageVisualEditorState {
  const photoPresets = parsePhotoPresets(payload.photoPresets);
  const visualSections = parseVisualSections(payload.visualSections);

  return {
    headerNavigation: parseHeaderNavigation(payload.headerNavigation, fallbackState.headerNavigation),
    photoPresets: normalizeHomepageImagePresets(photoPresets.length > 0 ? photoPresets : fallbackState.photoPresets),
    sections: visualSections.length > 0 ? mergeHomepageSections(fallbackState.sections, visualSections) : fallbackState.sections,
    seo: normalizeHomepageSeo(payload.seoMetadata),
    versions: fallbackState.versions
  };
}

function parseHeaderNavigation(value: CmsHomepagePayload["headerNavigation"], fallback: HeaderNavigationConfig) {
  if (!value) {
    return normalizeHeaderNavigation(fallback);
  }

  if (typeof value === "object") {
    return normalizeHeaderNavigation(value);
  }

  try {
    return normalizeHeaderNavigation(JSON.parse(value));
  } catch {
    return normalizeHeaderNavigation(fallback);
  }
}

function normalizeHomepageSeo(value: CmsHomepagePayload["seoMetadata"]) {
  const parsed = parseSeoMetadata(value);

  return {
    title: parsed.title?.trim() || defaultHomepageSeo.title,
    description: parsed.description?.trim() || defaultHomepageSeo.description,
    ogTitle: parsed.ogTitle?.trim() || parsed.title?.trim() || defaultHomepageSeo.ogTitle,
    ogDescription: parsed.ogDescription?.trim() || parsed.description?.trim() || defaultHomepageSeo.ogDescription,
    ogImage: parsed.ogImage?.trim() || defaultHomepageImage,
    canonicalUrl: parsed.canonicalUrl?.trim() || defaultHomepageSeo.canonicalUrl,
    indexable: parsed.indexable !== false
  };
}

function parseSeoMetadata(value: CmsHomepagePayload["seoMetadata"]): Partial<HomepageSeoConfig> {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toHomepageVersionSummary(version: HomepageStoredVersion): HomepageVersionSummary {
  const payload = asPayload(version.payload);

  return {
    versionNumber: version.versionNumber,
    status: version.status,
    title: version.title,
    createdAt: version.createdAt,
    publishedAt: version.publishedAt,
    summary: String(payload.changeSummary || payload.summary || "Homepage update")
  };
}

function asPayload(value: unknown): CmsHomepagePayload {
  return value && typeof value === "object" ? (value as CmsHomepagePayload) : {};
}

function sectionTypeFromSectionId(sectionId: string) {
  if (sectionId === "home.hero") {
    return "hero";
  }

  if (sectionId === "home.departments") {
    return "departments";
  }

  if (sectionId === "home.featured-products") {
    return "product-grid";
  }

  if (sectionId === "home.balloon-promo") {
    return "promo";
  }

  if (sectionId === "home.local-storefront") {
    return "storefront";
  }

  return "content";
}
