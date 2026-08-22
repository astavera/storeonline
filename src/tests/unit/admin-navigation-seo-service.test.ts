/** Verifies controlled navigation validation, atomic audit persistence, and honest SEO health. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultHeaderNavigation } from "@/config/header-navigation.config";

const mocks = vi.hoisted(() => ({
  getEditor: vi.fn(),
  getPublished: vi.fn(),
  readCatalog: vi.fn(),
  buildOperation: vi.fn(),
  transaction: vi.fn(),
  latest: vi.fn(),
  actor: vi.fn(),
  createVersion: vi.fn(),
  createAudit: vi.fn()
}));

vi.mock("@/features/homepage/server", () => ({
  getHomepageEditorState: mocks.getEditor,
  getPublishedHomepageState: mocks.getPublished
}));

vi.mock("@/server/square/website-catalog-store", () => ({
  readResolvedSquareWebsiteCatalog: mocks.readCatalog
}));

vi.mock("@/server/admin/admin-control-plane-service", () => ({
  buildAdminControlOperation: mocks.buildOperation
}));

vi.mock("@/server/db/prisma", () => ({
  getPrismaClient: () => ({ $transaction: mocks.transaction })
}));

import {
  persistAdminNavigation,
  readAdminNavigationSeoWorkspace,
  validateHeaderNavigation
} from "@/server/admin/admin-navigation-seo-service";

const previousDatabaseUrl = process.env.DATABASE_URL;

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://configured.example/store";
  const editor = homepageState("DRAFT", 4, defaultHeaderNavigation);
  const published = homepageState("PUBLISHED", 3, defaultHeaderNavigation);
  mocks.getEditor.mockResolvedValue(editor);
  mocks.getPublished.mockResolvedValue(published);
  mocks.readCatalog.mockResolvedValue(null);
  mocks.buildOperation.mockReturnValue({ ok: true, errors: [], version: { payload: { visualSections: "preserved", headerNavigation: "updated" } } });
  mocks.latest.mockResolvedValue({ versionNumber: 4 });
  mocks.actor.mockResolvedValue({ id: "owner-1" });
  mocks.createVersion.mockResolvedValue({ id: "version-5", versionNumber: 5, createdAt: new Date("2026-08-19T15:00:00.000Z"), publishedAt: new Date("2026-08-19T15:00:00.000Z") });
  mocks.createAudit.mockResolvedValue({ id: "audit-1" });
  mocks.transaction.mockImplementation(async (operation: (transaction: unknown) => unknown) => operation({
    cmsContentVersion: { findFirst: mocks.latest, create: mocks.createVersion },
    adminUser: { findFirst: mocks.actor },
    auditLog: { create: mocks.createAudit }
  }));
});

afterEach(() => {
  vi.clearAllMocks();
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

describe("admin navigation SEO service", () => {
  it("accepts internal and HTTPS links but rejects code, HTTP, and protected-route changes", () => {
    expect(validateHeaderNavigation({
      ...defaultHeaderNavigation,
      primary: [...defaultHeaderNavigation.primary, { id: "external", label: "Partner", href: "https://partner.example/path", visible: true }]
    }).ok).toBe(true);

    const invalid = validateHeaderNavigation({
      ...defaultHeaderNavigation,
      primary: defaultHeaderNavigation.primary.map((link) => link.id === "shop-all" ? { ...link, label: "<script>", href: "http://unsafe.example" } : link),
      utility: defaultHeaderNavigation.utility.map((link) => link.id === "cart" ? { ...link, href: "/admin" } : link)
    });

    expect(invalid).toMatchObject({ ok: false });
    expect(invalid.ok ? [] : invalid.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("plain-text label"),
      expect.stringContaining("credential-free HTTPS"),
      expect.stringContaining("protected cart utility")
    ]));
  });

  it("persists the CMS version and audit event in the same serializable transaction", async () => {
    const navigation = {
      ...defaultHeaderNavigation,
      primary: defaultHeaderNavigation.primary.map((link) => link.id === "shop-all" ? { ...link, label: "Shop everything" } : link)
    };

    const result = await persistAdminNavigation({
      actorSubject: "owner@example.com",
      changeSummary: "Clarify the main shop label",
      expectedVersion: 4,
      navigation,
      operation: "publish"
    });

    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(mocks.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityType: "ADMIN_MODULE", entityId: "homepage", status: "PUBLISHED", versionNumber: 5 })
    }));
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "STOREFRONT_NAVIGATION_PUBLISHED", entityType: "CmsContentVersion", entityId: "version-5" })
    });
    expect(result).toMatchObject({ versionNumber: 5, status: "PUBLISHED", navigation });
  });

  it("reports actual robots and sitemap state and flags route metadata gaps", async () => {
    process.env.NEXT_PUBLIC_SITE_INDEXABLE = "false";
    mocks.readCatalog.mockRejectedValue(new Error("catalog unavailable"));

    const workspace = await readAdminNavigationSeoWorkspace();

    expect(workspace.seo.robots).toMatchObject({ indexingEnabled: false, policy: "disallow-all" });
    expect(workspace.seo.unavailableSources).toEqual(["Square website catalog"]);
    expect(workspace.seo.pages.find((page) => page.path === "/contact")).toMatchObject({ status: "error", title: "" });
    expect(workspace.seo.pages.find((page) => page.path === "/shipping-policy")).toMatchObject({ inSitemap: false, status: "error" });
  });
});

function homepageState(status: string, versionNumber: number, headerNavigation: typeof defaultHeaderNavigation) {
  return {
    headerNavigation,
    photoPresets: [],
    sections: [{ sectionId: "home.hero", title: "Hero", ctaLabel: "Shop", ctaHref: "/shop" }],
    seo: {
      title: "Modern State - State News NYC",
      description: "Toys, party supplies, balloons, stationery, arts and crafts, greeting cards, and gifts on the Upper East Side.",
      ogTitle: "Modern State",
      ogDescription: "Modern State",
      ogImage: "/hero.jpg",
      canonicalUrl: "/",
      indexable: true
    },
    versions: [{ versionNumber, status, title: "Homepage", createdAt: "2026-08-19T14:00:00.000Z", publishedAt: status === "PUBLISHED" ? "2026-08-19T14:00:00.000Z" : null, summary: "Update" }],
    workspace: { id: "main", name: "Main Homepage", status, updatedAt: "2026-08-19T14:00:00.000Z", publishedAt: status === "PUBLISHED" ? "2026-08-19T14:00:00.000Z" : null },
    workspaces: []
  };
}

