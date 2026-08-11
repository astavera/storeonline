// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PartySolidCategoryShowcase } from "@/features/departments/components/party-solid-category-showcase";

afterEach(cleanup);

describe("Party solid category showcase", () => {
  it("links each compact category card to the solid collection and product type", () => {
    render(<PartySolidCategoryShowcase />);

    expect(screen.getByRole("heading", { name: "Shop solid colors" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Plates" }).getAttribute("href")).toBe("/party-supplies?collection=solids&type=plates#catalog");
    expect(screen.getByRole("link", { name: "Napkins" }).getAttribute("href")).toBe("/party-supplies?collection=solids&type=napkins#catalog");
    expect(screen.getByRole("link", { name: "Cups" }).getAttribute("href")).toBe("/party-supplies?collection=solids&type=cups#catalog");
    expect(screen.getByRole("link", { name: "Cutlery" }).getAttribute("href")).toBe("/party-supplies?collection=solids&type=cutlery#catalog");
    expect(screen.getByRole("link", { name: "Table Covers" }).getAttribute("href")).toBe("/party-supplies?collection=solids&type=table-covers#catalog");
  });
});
