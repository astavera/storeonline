/**
 * Verifies that Admin edits stay private until the publication service promotes them.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createVersion: vi.fn(),
  readLatest: vi.fn()
}));

vi.mock("@/server/db/cms-version-repository", () => ({
  createDatabaseCmsVersion: mocks.createVersion,
  readLatestDatabaseCmsVersion: mocks.readLatest
}));

vi.mock("@/server/db/persistence-policy", () => ({
  isDevelopmentLocalPersistenceEnabled: () => false,
  requireDatabaseOrDevelopmentFallback: () => "database",
  PersistenceUnavailableError: class PersistenceUnavailableError extends Error {}
}));

import {
  readAdminWebsiteMerchandisingWorkspace,
  readWebsiteMerchandisingSnapshot,
  saveWebsiteMerchandisingSnapshot
} from "@/server/admin/website-merchandising-store";

afterEach(() => {
  vi.clearAllMocks();
});

describe("website merchandising draft persistence", () => {
  it("creates a DRAFT version when Admin saves catalog changes", async () => {
    mocks.createVersion.mockResolvedValue({ id: "draft-5", versionNumber: 5 });

    await saveWebsiteMerchandisingSnapshot(config("draft-category"));

    expect(mocks.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "WEBSITE_MERCHANDISING",
      entityId: "global",
      status: "DRAFT",
      title: "Website merchandising draft",
      publishedAt: null,
      payload: expect.objectContaining({ categories: [expect.objectContaining({ id: "draft-category" })] })
    }));
  });

  it("loads the newest draft in Admin while retaining published version metadata", async () => {
    mocks.readLatest.mockImplementation(async ({ statuses }: { statuses: string[] }) => statuses.includes("DRAFT")
      ? record("DRAFT", 8, config("draft-category"))
      : record("PUBLISHED", 6, config("live-category")));

    const workspace = await readAdminWebsiteMerchandisingWorkspace();

    expect(workspace).toMatchObject({
      status: "DRAFT",
      versionNumber: 8,
      publishedVersionNumber: 6,
      config: { categories: [expect.objectContaining({ id: "draft-category" })] }
    });
  });

  it("shows the published workspace when it is newer than the last historical draft", async () => {
    mocks.readLatest.mockImplementation(async ({ statuses }: { statuses: string[] }) => statuses.includes("DRAFT")
      ? record("DRAFT", 8, config("old-draft-category"))
      : record("PUBLISHED", 9, config("live-category")));

    const workspace = await readAdminWebsiteMerchandisingWorkspace();

    expect(workspace).toMatchObject({
      status: "PUBLISHED",
      versionNumber: 9,
      publishedVersionNumber: 9,
      config: { categories: [expect.objectContaining({ id: "live-category" })] }
    });
  });

  it("keeps the storefront snapshot pinned to PUBLISHED content", async () => {
    mocks.readLatest.mockResolvedValue(record("PUBLISHED", 6, config("live-category")));

    const storefront = await readWebsiteMerchandisingSnapshot();

    expect(mocks.readLatest).toHaveBeenCalledWith(expect.objectContaining({ statuses: ["PUBLISHED"] }));
    expect(storefront.categories[0]?.id).toBe("live-category");
  });
});

function record(status: string, versionNumber: number, payload: unknown) {
  return {
    status,
    versionNumber,
    payload,
    createdAt: new Date("2026-08-17T18:00:00.000Z"),
    publishedAt: status === "PUBLISHED" ? new Date("2026-08-17T18:00:00.000Z") : null
  };
}

function config(categoryId: string) {
  return {
    version: 3 as const,
    updatedAt: "2026-08-17T18:00:00.000Z",
    categories: [{
      id: categoryId,
      name: categoryId,
      slug: categoryId,
      description: "",
      imageUrl: "",
      imageAlt: "",
      parentId: null,
      visible: true,
      sortOrder: 0,
      kind: "standard" as const,
      recommendationTerms: [],
      swatchColor: ""
    }],
    brands: [],
    holidays: [],
    placements: []
  };
}
