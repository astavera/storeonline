/** Manages controlled header navigation and reports SEO health from real storefront sources. */

import "server-only";

import type { HeaderNavigationConfig, HeaderNavigationLink } from "@/config/header-navigation.config";
import { departments } from "@/config/departments.config";
import { holidays } from "@/config/holidays.config";
import { storePolicyDefinitions } from "@/config/store-administration.config";
import { buildAdminControlOperation } from "@/server/admin/admin-control-plane-service";
import { getPrismaClient } from "@/server/db/prisma";
import { toPrismaJson } from "@/server/prisma-json";
import { getHomepageEditorState, getPublishedHomepageState, type HomepageVisualEditorState } from "@/features/homepage/server";
import { absoluteStorefrontUrl, storefrontIsIndexable, storefrontStaticPaths } from "@/lib/seo/storefront-seo";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";
import {
  createStorefrontDepartmentOptions,
  storefrontDepartmentHref,
  type StorefrontDepartmentOption
} from "@/features/catalog/services/storefront-navigation-menu-service";

const maximumPrimaryLinks = 12;
const maximumUtilityLinks = 8;
const protectedUtilityHrefs = {
  search: "/search",
  account: "#account",
  wishlist: "#wishlist",
  cart: "/cart"
} as const;

type ResolvedWebsiteCatalog = NonNullable<Awaited<ReturnType<typeof readResolvedSquareWebsiteCatalog>>>["catalog"];

export type NavigationMutationOperation = "save_draft" | "publish";

export type SeoHealthStatus = "healthy" | "warning" | "error";

export type SeoHealthPage = {
  path: string;
  source: "homepage-cms" | "static-route" | "department-config" | "holiday-route" | "square-catalog" | "policy-route";
  title: string;
  description: string;
  canonical: string;
  indexable: boolean;
  inSitemap: boolean;
  status: SeoHealthStatus;
  issues: string[];
};

export type AdminSeoHealth = {
  generatedAt: string;
  summary: {
    total: number;
    healthy: number;
    warnings: number;
    errors: number;
  };
  pages: SeoHealthPage[];
  robots: {
    indexingEnabled: boolean;
    policy: "allow-public-storefront" | "disallow-all";
    sitemapUrl: string;
    source: "NEXT_PUBLIC_SITE_INDEXABLE";
  };
  sitemap: {
    routeCount: number;
    url: string;
    catalogIncluded: boolean;
    source: "generated-route";
  };
  unavailableSources: string[];
};

export type AdminNavigationSeoWorkspace = {
  departmentOptions: StorefrontDepartmentOption[];
  editableNavigation: HeaderNavigationConfig;
  publishedNavigation: HeaderNavigationConfig;
  publication: {
    status: string;
    currentVersion: number;
    updatedAt: string;
    lastPublishedAt: string | null;
    hasUnpublishedChanges: boolean;
    databaseWritesEnabled: boolean;
  };
  navigationIssues: string[];
  seo: AdminSeoHealth;
};

export type NavigationValidationResult =
  | { ok: true; navigation: HeaderNavigationConfig }
  | { ok: false; errors: string[] };

export class NavigationVersionConflictError extends Error {
  constructor() {
    super("Navigation changed after this screen was loaded. Refresh before saving again.");
    this.name = "NavigationVersionConflictError";
  }
}

export class NavigationPersistenceUnavailableError extends Error {
  constructor(message = "Database-backed navigation publishing is unavailable.") {
    super(message);
    this.name = "NavigationPersistenceUnavailableError";
  }
}

export class NavigationValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.join(" "));
    this.name = "NavigationValidationError";
    this.errors = errors;
  }
}

export async function readAdminNavigationSeoWorkspace(): Promise<AdminNavigationSeoWorkspace> {
  const [published, catalogResult] = await Promise.all([
    getPublishedHomepageState(),
    readCatalogSafely()
  ]);
  const editable = await getHomepageEditorState(published.workspace.id);
  const currentVersion = editable.versions[0]?.versionNumber ?? 0;
  const validated = validateHeaderNavigation(editable.headerNavigation);

  return {
    departmentOptions: buildDepartmentOptions(catalogResult.catalog),
    editableNavigation: editable.headerNavigation,
    publishedNavigation: published.headerNavigation,
    publication: {
      status: editable.workspace.status,
      currentVersion,
      updatedAt: editable.workspace.updatedAt,
      lastPublishedAt: editable.workspace.publishedAt,
      hasUnpublishedChanges: JSON.stringify(editable.headerNavigation) !== JSON.stringify(published.headerNavigation),
      databaseWritesEnabled: Boolean(process.env.DATABASE_URL)
    },
    navigationIssues: validated.ok ? [] : validated.errors,
    seo: buildSeoHealth(published, catalogResult.catalog, catalogResult.unavailable)
  };
}

function buildDepartmentOptions(catalog: ResolvedWebsiteCatalog | null) {
  const options = new Map<string, StorefrontDepartmentOption>();

  for (const department of departments.filter((entry) =>
    entry.is_visible && ["toys", "party-supplies", "balloons"].includes(entry.slug)
  )) {
    options.set(department.slug, {
      id: department.slug,
      label: department.short_title_en || department.title_en,
      href: storefrontDepartmentHref(department)
    });
  }

  for (const option of createStorefrontDepartmentOptions(catalog?.categories ?? [])) {
    options.set(option.id, option);
  }

  return Array.from(options.values());
}

export function validateHeaderNavigation(value: unknown): NavigationValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["Navigation must be an object."] };
  }
  const source = value as Record<string, unknown>;
  rejectUnknownKeys(source, ["primary", "utility", "mobileCta"], "Navigation", errors);
  const primary = readLinkList(source.primary, "Primary", maximumPrimaryLinks, errors);
  const utility = readLinkList(source.utility, "Utility", maximumUtilityLinks, errors);
  const mobileCta = readLink(source.mobileCta, "Mobile call to action", errors);
  const links = [...primary, ...utility, ...(mobileCta ? [mobileCta] : [])];
  const ids = new Set<string>();

  for (const link of links) {
    if (ids.has(link.id)) errors.push(`Navigation ID ${link.id} is duplicated.`);
    ids.add(link.id);
  }

  const about = primary.find((link) => link.id === "about-us");
  if (!about || about.href !== "/about" || !about.visible) {
    errors.push("The required About Us link must remain visible and point to /about.");
  }
  for (const [id, href] of Object.entries(protectedUtilityHrefs)) {
    const link = utility.find((candidate) => candidate.id === id);
    if (!link || link.href !== href) errors.push(`The protected ${id} utility must remain configured at ${href}.`);
  }

  return errors.length || !mobileCta
    ? { ok: false, errors: Array.from(new Set(errors)) }
    : { ok: true, navigation: { primary, utility, mobileCta } };
}

export async function persistAdminNavigation(input: {
  actorSubject: string;
  changeSummary: string;
  expectedVersion: number;
  navigation: unknown;
  operation: NavigationMutationOperation;
}) {
  if (!process.env.DATABASE_URL) throw new NavigationPersistenceUnavailableError();
  const validation = validateHeaderNavigation(input.navigation);
  if (!validation.ok) throw new NavigationValidationError(validation.errors);
  const changeSummary = input.changeSummary.trim().slice(0, 200);
  if (changeSummary.length < 3) throw new NavigationValidationError(["Change summary must contain at least 3 characters."]);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new NavigationValidationError(["Expected navigation version is invalid."]);
  }

  const published = await getPublishedHomepageState();
  const current = await getHomepageEditorState(published.workspace.id);
  if ((current.versions[0]?.versionNumber ?? 0) !== input.expectedVersion) throw new NavigationVersionConflictError();
  const homepageEntityId = current.workspace.id === "main" ? "homepage" : `homepage:${current.workspace.id}`;
  const controlOperation = buildHomepageNavigationOperation(current, homepageEntityId, validation.navigation, input.operation, changeSummary, input.actorSubject);
  if (!controlOperation.ok || !controlOperation.version) throw new NavigationValidationError(controlOperation.errors);

  const status = input.operation === "publish" ? "PUBLISHED" : "DRAFT";
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction) => {
    const latest = await transaction.cmsContentVersion.findFirst({
      where: { entityType: "ADMIN_MODULE", entityId: homepageEntityId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true }
    });
    if ((latest?.versionNumber ?? 0) !== input.expectedVersion) throw new NavigationVersionConflictError();
    const actor = await transaction.adminUser.findFirst({
      where: { OR: [{ id: input.actorSubject }, { email: input.actorSubject.toLowerCase() }] },
      select: { id: true }
    });
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const publishedAt = status === "PUBLISHED" ? new Date() : null;
    const created = await transaction.cmsContentVersion.create({
      data: {
        entityType: "ADMIN_MODULE",
        entityId: homepageEntityId,
        versionNumber,
        status,
        title: current.workspace.name,
        payload: toPrismaJson(controlOperation.version!.payload),
        publishedAt,
        createdById: actor?.id ?? null,
        publishedById: status === "PUBLISHED" ? actor?.id ?? null : null
      },
      select: { id: true, versionNumber: true, createdAt: true, publishedAt: true }
    });
    await transaction.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        action: status === "PUBLISHED" ? "STOREFRONT_NAVIGATION_PUBLISHED" : "STOREFRONT_NAVIGATION_DRAFTED",
        entityType: "CmsContentVersion",
        entityId: created.id,
        before: toPrismaJson(current.headerNavigation),
        after: toPrismaJson({
          actorSubject: input.actorSubject,
          value: { navigation: validation.navigation, changeSummary, status, versionNumber }
        })
      }
    });

    return {
      id: created.id,
      versionNumber: created.versionNumber,
      status,
      createdAt: created.createdAt.toISOString(),
      publishedAt: created.publishedAt?.toISOString() ?? null,
      navigation: validation.navigation
    };
  }, { isolationLevel: "Serializable" });
}

function buildHomepageNavigationOperation(
  current: HomepageVisualEditorState,
  entityId: string,
  navigation: HeaderNavigationConfig,
  operation: NavigationMutationOperation,
  changeSummary: string,
  actorSubject: string
) {
  const hero = current.sections.find((section) => section.sectionId === "home.hero") ?? current.sections[0];
  return buildAdminControlOperation({
    actorId: actorSubject,
    moduleId: "homepage",
    entityId,
    operation,
    values: {
      homepageId: current.workspace.id,
      homepageName: current.workspace.name,
      title: current.seo.title || hero?.title || "Homepage",
      summary: changeSummary,
      ctaLabel: hero?.ctaLabel || "",
      ctaHref: hero?.ctaHref || "/",
      status: operation === "publish" ? "Visible" : "Draft",
      sectionOrder: current.sections.map((section) => section.sectionId),
      visualSections: JSON.stringify(current.sections),
      headerNavigation: JSON.stringify(navigation),
      photoPresets: JSON.stringify(current.photoPresets),
      seoMetadata: JSON.stringify(current.seo),
      changeSummary
    }
  });
}

function readLinkList(value: unknown, label: string, maximum: number, errors: string[]) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label} navigation must contain at least one link.`);
    return [];
  }
  if (value.length > maximum) errors.push(`${label} navigation supports at most ${maximum} links.`);
  return value.slice(0, maximum).map((link, index) => readLink(link, `${label} link ${index + 1}`, errors)).filter((link): link is HeaderNavigationLink => Boolean(link));
}

function readLink(value: unknown, label: string, errors: string[]): HeaderNavigationLink | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} is invalid.`);
    return null;
  }
  const source = value as Record<string, unknown>;
  rejectUnknownKeys(source, ["id", "label", "href", "visible"], label, errors);
  const id = typeof source.id === "string" ? source.id.trim() : "";
  const text = typeof source.label === "string" ? source.label.trim() : "";
  const href = typeof source.href === "string" ? source.href.trim() : "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) errors.push(`${label} has an invalid ID.`);
  if (!text || text.length > 40 || /[<>{}]/.test(text)) errors.push(`${label} must have a plain-text label of 1 to 40 characters.`);
  const hrefIssue = navigationHrefIssue(href);
  if (hrefIssue) errors.push(`${label}: ${hrefIssue}`);
  if (typeof source.visible !== "boolean") errors.push(`${label} visibility must be true or false.`);
  return { id, label: text, href, visible: source.visible === true };
}

function navigationHrefIssue(href: string) {
  if (!href || href.length > 300 || /[\u0000-\u001F\u007F\\]/.test(href)) return "link is invalid.";
  if (href === "#account" || href === "#wishlist") return "";
  if (href.startsWith("#")) return "only the protected account and wishlist anchors are supported.";
  if (href.startsWith("/")) {
    if (href.startsWith("//")) return "protocol-relative links are not allowed.";
    const parsed = new URL(href, "https://storefront.invalid");
    if (["/admin", "/api", "/_next"].some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`))) {
      return "internal Admin, API, and framework routes are not allowed.";
    }
    return "";
  }
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
      return "external links must be credential-free HTTPS URLs.";
    }
    return "";
  } catch {
    return "link must be an internal path or HTTPS URL.";
  }
}

function rejectUnknownKeys(source: Record<string, unknown>, allowed: string[], label: string, errors: string[]) {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(source)) {
    if (!allowedKeys.has(key)) errors.push(`${label} contains unsupported field ${key}.`);
  }
}

async function readCatalogSafely() {
  try {
    return { catalog: (await readResolvedSquareWebsiteCatalog())?.catalog ?? null, unavailable: false };
  } catch {
    return { catalog: null, unavailable: true };
  }
}

function buildSeoHealth(
  homepage: HomepageVisualEditorState,
  catalog: ResolvedWebsiteCatalog | null,
  catalogUnavailable: boolean
): AdminSeoHealth {
  const sitemapPaths = new Set<string>(storefrontStaticPaths);
  const candidates: Omit<SeoHealthPage, "inSitemap" | "issues" | "status">[] = [];
  candidates.push({
    path: "/",
    source: "homepage-cms",
    title: homepage.seo.title,
    description: homepage.seo.description,
    canonical: homepage.seo.canonicalUrl,
    indexable: homepage.seo.indexable
  });

  for (const page of knownStaticSeoPages) candidates.push({ ...page, indexable: true, source: "static-route" });
  for (const policy of storePolicyDefinitions) {
    candidates.push({ path: policy.route, source: "policy-route", title: "", description: "", canonical: "", indexable: true });
  }
  for (const department of departments.filter((entry) => entry.is_visible && ["toys", "party-supplies"].includes(entry.slug))) {
    const path = `/${department.slug}`;
    sitemapPaths.add(path);
    candidates.push({ path, source: "department-config", title: department.seo_title_en, description: department.seo_description_en, canonical: path, indexable: true });
  }
  for (const holiday of holidays.filter((entry) => entry.is_visible)) {
    const path = `/holidays/${holiday.slug}`;
    sitemapPaths.add(path);
    candidates.push({ path, source: "holiday-route", title: "", description: "", canonical: "", indexable: true });
  }
  for (const category of catalog?.categories ?? []) {
    const path = `/categories/${category.slug}`;
    sitemapPaths.add(path);
    candidates.push({ path, source: "square-catalog", title: `${category.name} | Modern State - State News NYC`, description: category.description || `Shop ${category.name} at Modern State on the Upper East Side.`, canonical: path, indexable: true });
  }
  for (const product of catalog?.products ?? []) {
    const path = `/products/${product.slug}`;
    sitemapPaths.add(path);
    candidates.push({ path, source: "square-catalog", title: `${product.name} | Modern State - State News NYC`, description: product.shortDescription, canonical: path, indexable: true });
  }

  const uniqueCandidates = Array.from(new Map(candidates.map((page) => [page.path, page])).values());
  const pages = uniqueCandidates.map((page) => evaluateSeoPage(page, sitemapPaths));
  const priorityPages = [...pages.filter((page) => page.status !== "healthy"), ...pages.filter((page) => page.status === "healthy")].slice(0, 120);
  const indexingEnabled = storefrontIsIndexable();

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: pages.length,
      healthy: pages.filter((page) => page.status === "healthy").length,
      warnings: pages.filter((page) => page.status === "warning").length,
      errors: pages.filter((page) => page.status === "error").length
    },
    pages: priorityPages,
    robots: {
      indexingEnabled,
      policy: indexingEnabled ? "allow-public-storefront" : "disallow-all",
      sitemapUrl: absoluteStorefrontUrl("/sitemap.xml"),
      source: "NEXT_PUBLIC_SITE_INDEXABLE"
    },
    sitemap: {
      routeCount: sitemapPaths.size,
      url: absoluteStorefrontUrl("/sitemap.xml"),
      catalogIncluded: Boolean(catalog),
      source: "generated-route"
    },
    unavailableSources: catalogUnavailable ? ["Square website catalog"] : []
  };
}

function evaluateSeoPage(
  page: Omit<SeoHealthPage, "inSitemap" | "issues" | "status">,
  sitemapPaths: Set<string>
): SeoHealthPage {
  const issues: string[] = [];
  if (!page.title.trim()) issues.push("Missing route-specific title.");
  else if (page.title.length > 60) issues.push("Title is longer than 60 characters.");
  if (!page.description.trim()) issues.push("Missing route-specific description.");
  else if (page.description.length > 160) issues.push("Description is longer than 160 characters.");
  if (!page.canonical.trim()) issues.push("Missing canonical URL.");
  else if (navigationHrefIssue(page.canonical) || page.canonical.startsWith("#")) issues.push("Canonical URL is invalid.");
  const inSitemap = sitemapPaths.has(page.path);
  if (page.indexable && !inSitemap) issues.push("Indexable route is missing from the generated sitemap.");
  const hasError = issues.some((issue) => issue.startsWith("Missing") || issue.includes("invalid"));
  return { ...page, inSitemap, issues, status: hasError ? "error" : issues.length ? "warning" : "healthy" };
}

const knownStaticSeoPages = [
  { path: "/shop", title: "Shop", description: "Shop Modern State toys, balloons, party supplies, stationery, gifts, and creative essentials.", canonical: "" },
  { path: "/search", title: "Search", description: "Search Modern State toys, balloons, party supplies, stationery, gifts, and creative essentials.", canonical: "" },
  { path: "/balloons", title: "Balloons", description: "Order balloons for store pickup or local delivery through a guided Modern State balloon flow.", canonical: "" },
  { path: "/locations", title: "Locations", description: "Modern State store locations on NYC's Upper East Side.", canonical: "" },
  { path: "/about", title: "About Us", description: "Modern State is the evolution of State News, serving the Upper East Side since 1979.", canonical: "" },
  { path: "/contact", title: "", description: "", canonical: "" }
] as const;
