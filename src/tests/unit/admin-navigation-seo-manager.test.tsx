// @vitest-environment jsdom

/** Verifies department-aware navbar editing in Website Editor. */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminNavigationSeoManager } from "@/components/admin/admin-navigation-seo-manager";
import { defaultHeaderNavigation } from "@/config/header-navigation.config";
import type { AdminNavigationSeoWorkspace } from "@/server/admin/admin-navigation-seo-service";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AdminNavigationSeoManager", () => {
  it("adds an available department before Holidays and removes it from the choices", () => {
    render(
      <AdminNavigationSeoManager
        canPublish
        canWrite
        embedded
        initialWorkspace={workspace()}
      />
    );

    const departmentSelect = screen.getByRole("combobox", { name: "Department" });
    fireEvent.change(departmentSelect, { target: { value: "stationery" } });
    fireEvent.click(screen.getByRole("button", { name: "Add department" }));

    const preview = screen.getByRole("navigation", { name: "Draft storefront navigation" });
    const labels = within(preview).getAllByText(/.+/).map((element) => element.textContent);
    expect(labels.indexOf("Stationery")).toBeLessThan(labels.indexOf("Holidays"));
    expect(screen.getByText(/Stationery was added to the draft/i)).toBeInTheDocument();
    expect(within(departmentSelect).queryByRole("option", { name: "Stationery" })).not.toBeInTheDocument();
  });
});

function workspace(): AdminNavigationSeoWorkspace {
  return {
    departmentOptions: [
      { id: "toys", label: "Toys", href: "/toys" },
      { id: "party-supplies", label: "Party Supplies", href: "/party-supplies" },
      { id: "balloons", label: "Balloons", href: "/balloons" },
      { id: "stationery", label: "Stationery", href: "/categories/stationery" }
    ],
    editableNavigation: defaultHeaderNavigation,
    publishedNavigation: defaultHeaderNavigation,
    publication: {
      status: "DRAFT",
      currentVersion: 4,
      updatedAt: "2026-08-19T12:00:00.000Z",
      lastPublishedAt: "2026-08-19T11:00:00.000Z",
      hasUnpublishedChanges: false,
      databaseWritesEnabled: true
    },
    navigationIssues: [],
    seo: {
      generatedAt: "2026-08-19T12:00:00.000Z",
      summary: { total: 0, healthy: 0, warnings: 0, errors: 0 },
      pages: [],
      robots: {
        indexingEnabled: false,
        policy: "disallow-all",
        sitemapUrl: "https://example.com/sitemap.xml",
        source: "NEXT_PUBLIC_SITE_INDEXABLE"
      },
      sitemap: {
        routeCount: 0,
        url: "https://example.com/sitemap.xml",
        catalogIncluded: false,
        source: "generated-route"
      },
      unavailableSources: []
    }
  };
}
