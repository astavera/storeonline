/**
 * Verifies the protected draft and publication boundary for Catalog Publishing.
 */

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditPublication: vi.fn(),
  authorize: vi.fn(),
  consume: vi.fn(),
  publish: vi.fn(),
  readCatalog: vi.fn(),
  readWorkspace: vi.fn(),
  saveDraft: vi.fn()
}));

vi.mock("@/server/admin/admin-rate-limit", () => ({
  getAdminRateLimiter: () => ({ consume: mocks.consume })
}));

vi.mock("@/server/admin/admin-security", () => ({
  adminAuthorizationResponse: vi.fn(),
  adminCapabilities: {
    read: "admin:read",
    merchandisingWrite: "admin:merchandising:write",
    merchandisingPublish: "admin:merchandising:publish"
  },
  authorizeAdminRequest: mocks.authorize
}));

vi.mock("@/server/admin/website-merchandising-publication", () => ({
  auditWebsiteMerchandisingPublication: mocks.auditPublication,
  publishWebsiteMerchandising: mocks.publish,
  WebsiteMerchandisingPublicationError: class WebsiteMerchandisingPublicationError extends Error {}
}));

vi.mock("@/server/admin/website-merchandising-store", () => ({
  readAdminWebsiteMerchandisingWorkspace: mocks.readWorkspace,
  saveWebsiteMerchandisingSnapshot: mocks.saveDraft
}));

vi.mock("@/server/square/postgres-admin-catalog-store", () => ({
  readPostgresAdminCatalogSummary: mocks.readCatalog
}));

import { GET, POST, PUT } from "@/app/api/admin/merchandising/route";

afterEach(() => {
  vi.clearAllMocks();
});

describe("admin merchandising route", () => {
  it("returns the private workspace instead of exposing only the published version", async () => {
    authorize();
    mocks.readCatalog.mockResolvedValue({ variationCount: 28, updatedAt: "2026-08-17T18:00:00.000Z" });
    mocks.readWorkspace.mockResolvedValue(workspace("DRAFT", 7, 4));

    const response = await GET(new NextRequest("http://localhost:3000/api/admin/merchandising"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      productCount: 28,
      workspace: { status: "DRAFT", versionNumber: 7, publishedVersionNumber: 4 }
    });
  });

  it("saves configuration as a draft and never invokes publication", async () => {
    authorize();
    mocks.saveDraft.mockResolvedValue(validConfig());
    mocks.readWorkspace.mockResolvedValue(workspace("DRAFT", 8, 4));

    const response = await PUT(request("PUT", { config: validConfig() }));

    expect(response.status).toBe(200);
    expect(mocks.saveDraft).toHaveBeenCalledWith(validConfig());
    expect(mocks.publish).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ workspace: { status: "DRAFT", versionNumber: 8 } });
  });

  it("audits the exact draft before showing a publication confirmation", async () => {
    authorize();
    mocks.auditPublication.mockResolvedValue({ sourceVersion: 8, confirmation: "digest-bound-confirmation", canPublish: true });

    const response = await POST(request("POST", { action: "plan_publication" }));

    expect(response.status).toBe(200);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ plan: { sourceVersion: 8, confirmation: "digest-bound-confirmation" } });
  });

  it("rate limits final publication and binds it to the supplied confirmation", async () => {
    authorize("editor@example.com");
    mocks.consume.mockResolvedValue({ allowed: true, remaining: 2, retryAfterSeconds: 0 });
    mocks.publish.mockResolvedValue({ applied: true, publishedVersion: 9 });
    mocks.readWorkspace.mockResolvedValue(workspace("PUBLISHED", 9, 9));

    const response = await POST(request("POST", { action: "publish", confirmation: "digest-bound-confirmation" }));

    expect(response.status).toBe(200);
    expect(mocks.consume).toHaveBeenCalledWith({
      key: "editor@example.com:website-merchandising",
      scope: "admin-merchandising-publish",
      limit: 3,
      windowMs: 60_000
    });
    expect(mocks.publish).toHaveBeenCalledWith("digest-bound-confirmation");
    await expect(response.json()).resolves.toMatchObject({ workspace: { status: "PUBLISHED", publishedVersionNumber: 9 } });
  });
});

function authorize(subject = "editor-1") {
  mocks.authorize.mockResolvedValue({ ok: true, session: { subject } });
}

function request(method: string, body: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/merchandising", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function workspace(status: "DRAFT" | "PUBLISHED", versionNumber: number, publishedVersionNumber: number) {
  return {
    config: validConfig(),
    status,
    versionNumber,
    publishedVersionNumber,
    publishedUpdatedAt: "2026-08-17T18:00:00.000Z"
  };
}

function validConfig() {
  return {
    version: 3 as const,
    updatedAt: "2026-08-17T18:00:00.000Z",
    categories: [],
    brands: [],
    holidays: [],
    placements: []
  };
}
