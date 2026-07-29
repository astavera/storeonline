import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomePageTemplate } from "@/components/templates/home-page-template";
import { homepageSections } from "@/config/homepage.config";

describe("homepage promotional cards", () => {
  it("keeps seasonal category shortcuts out of the hero", () => {
    const hero = {
      ...homepageSections[0],
      items: [
        { id: "manual", label: "01 Category", title: "Stationery", href: "/stationery", linkType: "manual" as const, tone: "yellow" as const },
        { id: "brand", label: "02 Brand", title: "Crayola", href: "/shop?brand=crayola", linkType: "brand" as const, linkValue: "crayola", tone: "cyan" as const },
        { id: "category", label: "03 Category", title: "Arts & Crafts", href: "/shop?department=arts-and-crafts", linkType: "category" as const, linkValue: "arts-and-crafts", tone: "green" as const },
        { id: "product", label: "04 Product", title: "Building Set", href: "/products/premium-building-set", linkType: "product" as const, linkValue: "premium-building-set", tone: "red" as const }
      ]
    };

    render(<HomePageTemplate sections={[hero]} />);

    expect(screen.queryByRole("link", { name: /Stationery/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Crayola/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Arts & Crafts/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Building Set/i })).toBeNull();
  });

  it("renders editable primary and secondary hero button destinations", () => {
    const hero = {
      ...homepageSections[0],
      variant: "default",
      ctaLabel: "Shop Crayola",
      ctaHref: "/shop?brand=crayola",
      secondaryCtaLabel: "Browse arts",
      secondaryCtaHref: "/shop?department=arts-and-crafts",
      hiddenElements: [],
      heroSize: "compact" as const
    };

    render(<HomePageTemplate sections={[hero]} />);

    expect(screen.getByRole("link", { name: "Shop Crayola" }).getAttribute("href")).toBe("/shop?brand=crayola");
    expect(screen.getByRole("link", { name: "Browse arts" }).getAttribute("href")).toBe("/shop?department=arts-and-crafts");
  });

});
