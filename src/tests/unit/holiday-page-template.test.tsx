/** Verifies unfinished configured holiday routes render in place. */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const holidayMocks = vi.hoisted(() => ({
  readPublishedStorefrontCmsDocument: vi.fn(),
  readResolvedSquareWebsiteCatalog: vi.fn()
}));

vi.mock("@/server/storefront/published-cms-document", () => ({
  readPublishedStorefrontCmsDocument: holidayMocks.readPublishedStorefrontCmsDocument
}));

vi.mock("@/server/square/website-catalog-store", () => ({
  readResolvedSquareWebsiteCatalog: holidayMocks.readResolvedSquareWebsiteCatalog
}));

import { HolidayDetailTemplate } from "@/components/templates/holidays-page-template";

describe("holiday storefront fallback", () => {
  beforeEach(() => {
    holidayMocks.readPublishedStorefrontCmsDocument.mockReset();
    holidayMocks.readResolvedSquareWebsiteCatalog.mockReset();
    holidayMocks.readPublishedStorefrontCmsDocument.mockResolvedValue(null);
    holidayMocks.readResolvedSquareWebsiteCatalog.mockResolvedValue(null);
  });

  it("keeps an unfinished configured holiday on its own route", async () => {
    render(await HolidayDetailTemplate({ slug: "christmas" }));

    expect(screen.getByText("Christmas")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "You'll find products here very soon." })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
