import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomePageTemplate } from "@/components/templates/home-page-template";
import { homepageSections } from "@/config/homepage.config";

describe("homepage promotional cards", () => {
  it("renders the four CMS destinations without replacing them", () => {
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

    expect(screen.getByRole("link", { name: /Stationery/i }).getAttribute("href")).toBe("/stationery");
    expect(screen.getByRole("link", { name: /Crayola/i }).getAttribute("href")).toBe("/shop?brand=crayola");
    expect(screen.getByRole("link", { name: /Arts & Crafts/i }).getAttribute("href")).toBe("/shop?department=arts-and-crafts");
    expect(screen.getByRole("link", { name: /Building Set/i }).getAttribute("href")).toBe("/products/premium-building-set");
  });

  it("renders editable primary and secondary hero button destinations", () => {
    const hero = {
      ...homepageSections[0],
      ctaLabel: "Shop Crayola",
      ctaHref: "/shop?brand=crayola",
      secondaryCtaLabel: "Browse arts",
      secondaryCtaHref: "/shop?department=arts-and-crafts",
      heroSize: "compact" as const
    };

    render(<HomePageTemplate sections={[hero]} />);

    expect(screen.getByRole("link", { name: "Shop Crayola" }).getAttribute("href")).toBe("/shop?brand=crayola");
    expect(screen.getByRole("link", { name: "Browse arts" }).getAttribute("href")).toBe("/shop?department=arts-and-crafts");
  });

  it("renders a cutout as only a clickable image with an accessible label", () => {
    const hero = {
      ...homepageSections[0],
      items: [
        {
          id: "cutout",
          title: "Shop the cutout",
          href: "/products/premium-building-set",
          image: "/images/category-toys.svg",
          imageAlt: "Colorful toy cutout",
          presentation: "cutout" as const
        },
        ...homepageSections[0].items!.slice(1)
      ]
    };

    render(<HomePageTemplate sections={[hero]} />);

    const cutoutLink = screen.getByRole("link", { name: "Shop the cutout" });
    expect(cutoutLink.getAttribute("href")).toBe("/products/premium-building-set");
    expect(cutoutLink.getAttribute("data-card-presentation")).toBe("cutout");
    expect(cutoutLink.querySelector("img")).not.toBeNull();
  });
});
