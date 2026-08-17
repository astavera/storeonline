/**
 * Loads, normalizes, and persists homepage editor drafts and published state.
 */

import "server-only";

import { defaultHeaderNavigation, normalizeHeaderNavigation, type HeaderNavigationConfig } from "@/config/header-navigation.config";
import { defaultHomepageImage, defaultHomepageSeo, homepageImagePresets, homepageSectionElements, homepageSections, type HomepageImagePreset, type HomepageSectionConfig, type HomepageSeoConfig } from "@/features/homepage";
import type { CmsVersionStatus } from "@/lib/cms";
import { readLocalCmsVersions, readLocalCmsVersionsByEntityPrefix, type LocalCmsVersion } from "@/server/admin/admin-local-cms-store";
import { getPrismaClient } from "@/server/db/prisma";
import { isDevelopmentLocalPersistenceEnabled, PersistenceUnavailableError, requireDatabaseOrDevelopmentFallback } from "@/server/db/persistence-policy";
import { isStorefrontDesignPreviewEnabled } from "@/server/storefront/design-preview";

type CmsHomepagePayload = {
  changeSummary?: string;
  headerNavigation?: string | HeaderNavigationConfig;
  homepageId?: string;
  homepageName?: string;
  photoPresets?: string | HomepageImagePreset[];
  seoMetadata?: string | Partial<HomepageSeoConfig>;
  summary?: string;
  visualSections?: string | HomepageSectionConfig[];
};

export { defaultHomepageSeo };
export type { HomepageSeoConfig };

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
  workspace: HomepageWorkspaceSummary;
  workspaces: HomepageWorkspaceSummary[];
};

export type HomepageWorkspaceSummary = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  publishedAt: string | null;
};

type HomepageStoredVersion = Omit<LocalCmsVersion, "status"> & {
  status: string;
};

export function normalizeHomepageSections(sections: HomepageSectionConfig[]) {
  return sections
    .filter((section) => section && typeof section === "object")
    .map((section, index) => {
      const rawSectionId =
        typeof section.sectionId === "string" && section.sectionId.trim()
          ? section.sectionId
          : `home.custom.section-${index + 1}`;
      const sectionId = migrateLegacySeasonalProductRowId(rawSectionId);
      const variant =
        section.variant === "halloween-category-carousel"
          ? "seasonal-product-carousel"
          : section.variant;
      const isSeasonalProductRow =
        variant === "seasonal-product-carousel";
      const rawTitle =
        typeof section.title === "string" ? section.title : "Untitled section";
      const normalizedHiddenElements = Array.isArray(section.hiddenElements)
        ? section.hiddenElements.filter((element) =>
            homepageSectionElements.includes(element) &&
            !(variant === "toys-callout" && element === "items")
          )
        : undefined;

      return {
        ...section,
        sectionId,
        sectionType:
          section.sectionType ?? sectionTypeFromSectionId(sectionId),
        title: migrateLegacySeasonalProductRowTitle(
          rawSectionId,
          rawTitle
        ),
        eyebrow: isSeasonalProductRow ? undefined : section.eyebrow,
        body: isSeasonalProductRow
          ? ""
          : typeof section.body === "string"
            ? section.body
            : "",
        variant,
        sortOrder: Number.isFinite(section.sortOrder)
          ? section.sortOrder
          : (index + 1) * 10,
        isVisible: section.isVisible !== false,
        categorySlug:
          typeof section.categorySlug === "string"
            ? section.categorySlug.trim()
            : undefined,
        hiddenElements: normalizedHiddenElements,
        items: Array.isArray(section.items)
          ? isSeasonalProductRow
            ? section.items.filter(
                (item) =>
                  item.linkType === "product" ||
                  Boolean(item.productSlug) ||
                  Boolean(item.squareVariationId)
              )
            : section.items
          : undefined
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getPublishedHomepageSections() {
  const state = await getPublishedHomepageState();

  return state.sections;
}

export async function getHomepageEditorState(requestedWorkspaceId = "main"): Promise<HomepageVisualEditorState> {
  const workspaceId = normalizeHomepageWorkspaceId(requestedWorkspaceId);
  const [versions, existingWorkspaces] = await Promise.all([
    readHomepageVersions(undefined, workspaceId),
    readHomepageWorkspaceSummaries()
  ]);
  const editableVersion = versions.find((version) => ["DRAFT", "PREVIEW", "PUBLISHED"].includes(version.status));
  const versionPayload = editableVersion ? asPayload(editableVersion.payload) : {};
  const workspaceName = cleanWorkspaceName(versionPayload.homepageName) || workspaceNameFromId(workspaceId);
  const currentWorkspace: HomepageWorkspaceSummary = {
    id: workspaceId,
    name: workspaceName,
    status: editableVersion?.status ?? "NEW",
    updatedAt: editableVersion?.createdAt ?? new Date(0).toISOString(),
    publishedAt: editableVersion?.publishedAt ?? null
  };
  const workspaces = mergeWorkspaceSummaries(existingWorkspaces, currentWorkspace);
  const fallbackState = fallbackHomepageState(currentWorkspace, workspaces);

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
  const defaultWorkspace: HomepageWorkspaceSummary = {
    id: "main",
    name: "Main Homepage",
    status: "PUBLISHED",
    updatedAt: new Date(0).toISOString(),
    publishedAt: null
  };
  const fallbackState = fallbackHomepageState(defaultWorkspace, [defaultWorkspace]);

  if (isStorefrontDesignPreviewEnabled()) {
    return fallbackState;
  }

  const versions = await readHomepageVersionsAcrossWorkspaces("PUBLISHED");
  const publishedVersion = versions[0];

  if (!publishedVersion) {
    return fallbackState;
  }

  const workspaceId = workspaceIdFromEntityId(publishedVersion.entityId);
  const payload = asPayload(publishedVersion.payload);
  const workspace: HomepageWorkspaceSummary = {
    id: workspaceId,
    name: cleanWorkspaceName(payload.homepageName) || workspaceNameFromId(workspaceId),
    status: publishedVersion.status,
    updatedAt: publishedVersion.createdAt,
    publishedAt: publishedVersion.publishedAt
  };

  return buildHomepageStateFromPayload(payload, {
    ...fallbackHomepageState(workspace, [workspace]),
    versions: versions.filter((version) => version.entityId === publishedVersion.entityId).slice(0, 12).map(toHomepageVersionSummary)
  });
}

async function readHomepageVersions(status?: CmsVersionStatus, workspaceId = "main"): Promise<HomepageStoredVersion[]> {
  const entityId = homepageEntityId(workspaceId);
  const persistence = requireDatabaseOrDevelopmentFallback("Homepage CMS");
  if (persistence === "database") {
    try {
      const prisma = getPrismaClient();
      const cmsContentVersion = prisma.cmsContentVersion;
      const records = await cmsContentVersion.findMany({
        where: {
          entityType: "ADMIN_MODULE",
          entityId,
          ...(status ? { status } : {})
        },
        orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
        take: 12
      });
      return records.map((record) => ({
        entityType: "ADMIN_MODULE" as const,
        entityId,
        versionNumber: Number(record.versionNumber),
        status: String(record.status),
        title: String(record.title ?? "Homepage Sections"),
        payload: asPayload(record.payload),
        createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : new Date().toISOString(),
        publishedAt: record.publishedAt instanceof Date ? record.publishedAt.toISOString() : null
      }));
    } catch (error) {
      if (!isDevelopmentLocalPersistenceEnabled()) throw new PersistenceUnavailableError("Homepage CMS", { cause: error });
      console.warn("[development-local-persistence] Homepage CMS database read failed; reading the explicit local fallback.");
    }
  }

  return readLocalHomepageVersions(status, entityId);
}

async function readLocalHomepageVersions(status?: string, entityId = "homepage"): Promise<HomepageStoredVersion[]> {
  try {
    const localVersions = await readLocalCmsVersions(entityId);

    return localVersions.filter((version) => !status || version.status === status).sort((a, b) => b.versionNumber - a.versionNumber);
  } catch {
    return [];
  }
}

async function readHomepageVersionsAcrossWorkspaces(status?: CmsVersionStatus): Promise<HomepageStoredVersion[]> {
  const persistence = requireDatabaseOrDevelopmentFallback("Homepage CMS");

  if (persistence === "database") {
    try {
      const records = await getPrismaClient().cmsContentVersion.findMany({
        where: {
          entityType: "ADMIN_MODULE",
          entityId: { startsWith: "homepage" },
          ...(status ? { status } : {})
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }, { versionNumber: "desc" }],
        take: 120
      });

      return records.map((record) => ({
        entityType: "ADMIN_MODULE" as const,
        entityId: String(record.entityId),
        versionNumber: Number(record.versionNumber),
        status: String(record.status),
        title: String(record.title ?? "Homepage"),
        payload: asPayload(record.payload),
        createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : new Date().toISOString(),
        publishedAt: record.publishedAt instanceof Date ? record.publishedAt.toISOString() : null
      }));
    } catch (error) {
      if (!isDevelopmentLocalPersistenceEnabled()) throw new PersistenceUnavailableError("Homepage CMS", { cause: error });
      console.warn("[development-local-persistence] Homepage CMS database read failed; reading named local homepages.");
    }
  }

  const localVersions = await readLocalCmsVersionsByEntityPrefix("homepage");

  return localVersions
    .filter((version) => !status || version.status === status)
    .sort((first, second) =>
      Date.parse(second.publishedAt ?? second.createdAt) - Date.parse(first.publishedAt ?? first.createdAt) ||
      second.versionNumber - first.versionNumber
    );
}

async function readHomepageWorkspaceSummaries(): Promise<HomepageWorkspaceSummary[]> {
  const versions = await readHomepageVersionsAcrossWorkspaces();
  const latestByWorkspace = new Map<string, HomepageWorkspaceSummary>();

  for (const version of versions) {
    const id = workspaceIdFromEntityId(version.entityId);

    if (latestByWorkspace.has(id)) continue;
    const payload = asPayload(version.payload);
    latestByWorkspace.set(id, {
      id,
      name: cleanWorkspaceName(payload.homepageName) || (version.title !== "Editor" && version.title !== "Homepage Sections" ? version.title : workspaceNameFromId(id)),
      status: version.status,
      updatedAt: version.createdAt,
      publishedAt: version.publishedAt
    });
  }

  return Array.from(latestByWorkspace.values()).sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt));
}

export function mergeHomepageSections(baseSections: HomepageSectionConfig[], editedSections: HomepageSectionConfig[]) {
  const normalizedBaseSections = normalizeHomepageSections(baseSections);
  const normalizedEditedSections = normalizeHomepageSections(editedSections);
  const baseById = new Map(
    normalizedBaseSections.map((section) => [section.sectionId, section])
  );
  const editedIds = new Set(
    normalizedEditedSections.map((section) => section.sectionId)
  );

  return normalizeHomepageSections(
    [
      ...normalizedEditedSections.map((section) =>
        baseById.has(section.sectionId)
          ? {
          ...baseById.get(section.sectionId)!,
            ...section,
            items:
              section.sectionId === "home.hero" &&
              section.variant === "seasonal-card" &&
              ((section.items?.length ?? 0) !== 3 || section.items?.some((item) => !item.image))
                ? baseById.get(section.sectionId)!.items
                : section.items ?? baseById.get(section.sectionId)!.items,
            sectionType: section.sectionType ?? baseById.get(section.sectionId)!.sectionType
          }
          : section
      ),
      ...normalizedBaseSections.filter((section) => !editedIds.has(section.sectionId)).map((section) => ({
        ...baseById.get(section.sectionId)!,
        sortOrder: Number.MAX_SAFE_INTEGER
      }))
    ]
  );
}

function migrateLegacySeasonalProductRowId(sectionId: string) {
  const match = sectionId.match(/^home\.halloween-categories-row-([1-3])$/);

  return match ? `home.seasonal-products-row-${match[1]}` : sectionId;
}

function migrateLegacySeasonalProductRowTitle(
  sectionId: string,
  title: string
) {
  const match = sectionId.match(/^home\.halloween-categories-row-([1-3])$/);

  if (!match) {
    return title;
  }

  const legacyDefaultTitles = new Set([
    "Halloween categories",
    "More Halloween favorites",
    "Complete the Halloween look",
    "Halloween Costumes",
    "Halloween Party Supplies",
    "Halloween Gifts & Activities"
  ]);

  return legacyDefaultTitles.has(title)
    ? `Seasonal Category ${match[1]}`
    : title;
}

const retiredHomepageImagePresetIds = new Set([
  "storefront",
  "party",
  "toys",
  "stationery",
  "back-to-school",
  "halloween"
]);

export function normalizeHomepageImagePresets(presets: HomepageImagePreset[]) {
  const seenIds = new Set<string>();
  const normalizedPresets = presets
    .filter((preset) => !retiredHomepageImagePresetIds.has(preset?.id?.trim?.() ?? ""))
    .map((preset, index) => {
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

  return normalizedPresets;
}

export function mergeHomepageImagePresets(basePresets: HomepageImagePreset[], editedPresets: HomepageImagePreset[]) {
  const editedIds = new Set(editedPresets.map((preset) => preset.id));

  return normalizeHomepageImagePresets([
    ...editedPresets,
    ...basePresets.filter((preset) => !editedIds.has(preset.id))
  ]);
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

function fallbackHomepageState(workspace: HomepageWorkspaceSummary, workspaces: HomepageWorkspaceSummary[]): HomepageVisualEditorState {
  return {
    headerNavigation: defaultHeaderNavigation,
    photoPresets: normalizeHomepageImagePresets(homepageImagePresets),
    sections: normalizeHomepageSections(homepageSections),
    seo: defaultHomepageSeo,
    versions: [],
    workspace,
    workspaces
  };
}

function buildHomepageStateFromPayload(payload: CmsHomepagePayload, fallbackState: HomepageVisualEditorState): HomepageVisualEditorState {
  const photoPresets = parsePhotoPresets(payload.photoPresets);
  const visualSections = parseVisualSections(payload.visualSections);

  return {
    headerNavigation: parseHeaderNavigation(payload.headerNavigation, fallbackState.headerNavigation),
    photoPresets: mergeHomepageImagePresets(fallbackState.photoPresets, photoPresets),
    sections: visualSections.length > 0 ? mergeHomepageSections(fallbackState.sections, visualSections) : fallbackState.sections,
    seo: normalizeHomepageSeo(payload.seoMetadata),
    versions: fallbackState.versions,
    workspace: {
      ...fallbackState.workspace,
      id: normalizeHomepageWorkspaceId(payload.homepageId || fallbackState.workspace.id),
      name: cleanWorkspaceName(payload.homepageName) || fallbackState.workspace.name
    },
    workspaces: fallbackState.workspaces
  };
}

function homepageEntityId(workspaceId: string) {
  return workspaceId === "main" ? "homepage" : `homepage:${workspaceId}`;
}

function workspaceIdFromEntityId(entityId: string) {
  return normalizeHomepageWorkspaceId(entityId === "homepage" ? "main" : entityId.replace(/^homepage:/, ""));
}

function normalizeHomepageWorkspaceId(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || "main";
}

function workspaceNameFromId(id: string) {
  if (id === "main") return "Main Homepage";

  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanWorkspaceName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function mergeWorkspaceSummaries(workspaces: HomepageWorkspaceSummary[], current: HomepageWorkspaceSummary) {
  return [current, ...workspaces.filter((workspace) => workspace.id !== current.id)]
    .sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt));
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

  if (
    sectionId === "home.featured-products" ||
    sectionId === "home.toys-featured-products"
  ) {
    return "product-grid";
  }

  if (sectionId === "home.balloon-promo") {
    return "promo";
  }

  if (
    sectionId === "home.party-supplies-callout" ||
    sectionId === "home.toys-callout"
  ) {
    return "promo";
  }

  if (sectionId === "home.local-storefront") {
    return "storefront";
  }

  return "content";
}
