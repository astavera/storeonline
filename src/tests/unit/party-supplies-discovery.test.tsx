// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PartySuppliesDiscovery } from "@/features/departments/components/party-supplies-discovery";
import { createPartyMerchandisingStructure } from "@/features/catalog/services/party-merchandising-service";

afterEach(cleanup);

describe("Party Supplies discovery", () => {
  it("orders solid colors before themes and hides themes without an approved persistent image", () => {
    const structure = createPartyMerchandisingStructure([]);
    const categories = structure.categories.map((category) => {
      if (category.slug === "spider-man") return { ...category, imageUrl: "/uploads/admin/spider-man.webp", visible: true };
      if (category.slug === "batman") return { ...category, imageUrl: "https://images.google.com/batman.webp", visible: true };
      return category;
    });
    const ids = Object.fromEntries(categories.map((category) => [category.slug, category.id]));

    render(
      <PartySuppliesDiscovery
        basePath="/party-supplies"
        categories={categories}
        currentParams={{ brand: "unique" }}
        productCountByCategory={{
          [ids["solid-red"]]: 4,
          [ids["spider-man"]]: 8,
          [ids.batman]: 3,
          [ids.plates]: 12
        }}
        selectedColors={[]}
        selectedProductTypes={[]}
        selectedThemes={[]}
      />
    );

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Shop solid colors",
      "Shop by theme",
      "Shop by product type"
    ]);
    expect(screen.getByText("Spider-Man")).toBeTruthy();
    expect(screen.queryByText("Batman")).toBeNull();
    expect(screen.getByText("Red").closest("a")?.getAttribute("href")).toBe("/party-supplies?brand=unique&color=solid-red#catalog");
    expect(screen.getByText("Plates")).toBeTruthy();
  });
});
