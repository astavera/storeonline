// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductPlacementManager } from "@/components/admin/product-placement-manager";
import type { WebsiteMerchandisingConfig } from "@/features/catalog/services/website-merchandising-service";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("Catalog Publishing workflow", () => {
  it("shows draft status, previews privately, and confirms the exact version before publishing", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        plan: {
          sourceStatus: "DRAFT",
          sourceVersion: 7,
          digest: "abc123",
          confirmation: "digest-bound-confirmation",
          visiblePlacements: 1,
          readyPlacements: 1,
          canPublish: true,
          alreadyPublished: false
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        workspace: {
          status: "PUBLISHED",
          versionNumber: 8,
          publishedVersionNumber: 8,
          publishedUpdatedAt: "2026-08-17T18:00:00.000Z"
        }
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProductPlacementManager
        fetchedAt="2026-08-17T18:00:00.000Z"
        hasMoreItems={false}
        initialBrandProductCounts={{}}
        initialCategoryProductCounts={{ "category-party": 1 }}
        initialConfig={config()}
        initialWorkspace={{
          status: "DRAFT",
          versionNumber: 7,
          publishedVersionNumber: 4,
          publishedUpdatedAt: "2026-08-16T18:00:00.000Z"
        }}
        products={[]}
        squareInboxCount={1}
        squareVendors={[]}
      />
    );

    expect(screen.getByText("draft v7")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Preview draft/i }).getAttribute("href")).toBe("/admin/product-placement/preview");
    expect(screen.getByRole("link", { name: "View live site" }).getAttribute("href")).toBe("/shop");

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByRole("dialog", { name: "Publish this catalog version?" })).toBeTruthy();
    expect(screen.getByText(/replace the live catalog with draft v7/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publish 1 products" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      action: "publish",
      confirmation: "digest-bound-confirmation"
    });
    expect(await screen.findByText("Published successfully. The approved catalog is now live.")).toBeTruthy();
    expect(screen.getByText("Live v8")).toBeTruthy();
  });
});

function config(): WebsiteMerchandisingConfig {
  return {
    version: 3,
    updatedAt: "2026-08-17T18:00:00.000Z",
    categories: [{
      id: "category-party",
      name: "Party",
      slug: "party",
      description: "Party supplies",
      imageUrl: "",
      imageAlt: "",
      parentId: null,
      visible: true,
      sortOrder: 0,
      kind: "standard",
      recommendationTerms: [],
      swatchColor: ""
    }],
    brands: [],
    holidays: [],
    placements: [{
      squareVariationId: "variation-party",
      categoryIds: ["category-party"],
      brandIds: [],
      holidayAssignments: [],
      ageGroups: [],
      fulfillmentModes: ["pickup"],
      surfaceIds: ["shop"],
      visible: true,
      sortOrder: 0
    }]
  };
}

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  }));
}
