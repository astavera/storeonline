/**
 * Verifies the isolated behavior of homepage card links.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { storefrontProducts } from "@/features/catalog/product-catalog";
import { HomePageTemplate, homepageSections } from "@/features/homepage";
import { HomepageBalloonOrderCard } from "@/features/homepage/components/homepage-balloon-order-card";
import { HomepageFeaturedBrandsCarousel } from "@/features/homepage/components/homepage-featured-brands-carousel";
import { HomepageNewTrendingCard } from "@/features/homepage/components/homepage-new-trending-card";
import { HomepagePartySuppliesCard } from "@/features/homepage/components/homepage-party-supplies-card";
import { HomepageSeasonalProductCarousels } from "@/features/homepage/components/homepage-seasonal-product-carousels";
import { HomepageToysAgeInterestCard } from "@/features/homepage/components/homepage-toys-age-interest-card";
import { HomepageToyCategoryCarousel } from "@/features/homepage/components/homepage-toy-category-carousel";

describe("homepage promotional cards", () => {
  it("exposes the balloon callout as an editable homepage section", () => {
    const balloonSection = homepageSections.find(
      (section) => section.sectionId === "home.balloon-promo"
    )!;
    const { container } = render(
      <HomepageBalloonOrderCard section={balloonSection} />
    );

    expect(
      container.querySelector('[data-store-section="home.balloon-promo"]')
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Looking for balloons?" })).toBeTruthy();
    expect(screen.getByText("In-store pickup")).toBeTruthy();
    expect(screen.getByText("Local delivery")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start your order" }).getAttribute("href")).toBe("/balloons");
  });

  it("keeps the four Halloween promo tiles directly below the hero", () => {
    const hero = { ...homepageSections[0], isVisible: true };

    render(<HomePageTemplate sections={[hero]} />);

    expect(screen.getByRole("link", { name: "Costumes" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Plan a Party" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Accessories" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home Decor" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Toys" })).toBeNull();
  });

  it("uses each Halloween slide image instead of a stale legacy hero image", () => {
    const hero = {
      ...homepageSections[0],
      isVisible: true,
      backgroundImage: "/images/homepage/home-hero-back-to-school-ecommerce-wireframe.svg",
      imageAlt: "Legacy hero artwork"
    };

    render(<HomePageTemplate sections={[hero]} />);

    expect(
      screen
        .getByAltText("Spiderwebs, a witch crossing an orange moon, and a haunted house")
        .getAttribute("src")
    ).toContain("halloween-hero-01-bg.png");
    expect(screen.queryByAltText("Legacy hero artwork")).toBeNull();
  });

  it("keeps the active carousel mounted while the first slide title is being typed", () => {
    const hero = {
      ...homepageSections[0],
      isVisible: true,
      title: "Hall",
      backgroundImage: "https://example.com/retired-pumpkin-hero.jpg",
      imageAlt: "Retired pumpkin hero"
    };

    render(<HomePageTemplate sections={[hero]} />);

    expect(screen.getByRole("region", { name: "Halloween featured collections" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Hall" })).toBeTruthy();
    expect(screen.queryByAltText("Retired pumpkin hero")).toBeNull();
  });

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
      isVisible: true,
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

  it("uses the admin-selected category as the new and trending carousel source", () => {
    const newTrending = homepageSections.find(
      (section) => section.sectionId === "home.new-trending"
    )!;
    const selectedProduct = {
      ...storefrontProducts[0],
      websiteCategorySlugs: ["arts-and-crafts"]
    };
    const otherProduct = {
      ...storefrontProducts[1],
      websiteCategorySlugs: ["party"]
    };

    render(
      <HomepageNewTrendingCard
        products={[selectedProduct, otherProduct]}
        section={{ ...newTrending, categorySlug: "arts-and-crafts" }}
        trendingProducts={[]}
      />
    );

    expect(screen.getByRole("heading", { name: selectedProduct.name })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: otherProduct.name })).toBeNull();
    expect(screen.queryByText("Just landed")).toBeNull();
    expect(screen.queryByText("New arrival")).toBeNull();
    expect(screen.getByRole("button", { name: "Add to cart" })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Save ${selectedProduct.name} to wishlist` })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Discover What's New/i }).getAttribute("href")).toBe("/shop?department=arts-and-crafts");
  });

  it("renders the editable party supplies callout and destination", () => {
    const partySuppliesSection = homepageSections.find(
      (section) => section.sectionId === "home.party-supplies-callout"
    )!;

    const { container } = render(
      <HomepagePartySuppliesCard
        section={{
          ...partySuppliesSection,
          title: "Set the table in color.",
          ctaLabel: "Browse the party shop",
          ctaHref: "/party-supplies"
        }}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Set the table in color." })
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Browse the party shop/i }).getAttribute("href")
    ).toBe("/party-supplies");
    expect(
      screen.getByAltText(/Colorful party plates/i).getAttribute("src")
    ).toContain("party-supplies-callout.jpg");
    expect(
      container
        .querySelector("article")
        ?.getAttribute("data-store-section")
    ).toBe("home.party-supplies-callout");
  });

  it("links the toys age-and-interest banner to the toys landing page", () => {
    render(<HomepageToysAgeInterestCard />);

    expect(
      screen
        .getByRole("link", { name: "Shop toys by age and interest" })
        .getAttribute("href")
    ).toBe("/toys");
    expect(
      screen.getByAltText(/Hot Wheels, Barbie, and Fisher-Price/i)
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Shop All Toys" }).getAttribute("href")
    ).toBe("/toys");
    expect(
      screen.getByRole("link", { name: "Shop By Age" }).getAttribute("href")
    ).toBe("/shop?department=toys");
    expect(
      screen.getByRole("link", { name: "Shop Trending" }).getAttribute("href")
    ).toBe("/shop?department=toys&feature=new-and-trending");
  });

  it("renders only real categories that have an admin image", () => {
    render(
      <HomepageToyCategoryCarousel
        categories={[
          {
            id: "vehicles",
            name: "Vehicles & RC",
            slug: "vehicles-and-rc",
            description: "",
            parentId: null,
            imageUrl: "/uploads/admin/vehicles.png",
            imageAlt: "Remote control vehicle",
            visible: true,
            sortOrder: 1
          },
          {
            id: "no-image",
            name: "No image category",
            slug: "no-image",
            description: "",
            parentId: null,
            imageUrl: "",
            imageAlt: "",
            visible: true,
            sortOrder: 2
          }
        ]}
      />
    );

    expect(
      screen.getByRole("link", { name: "Shop Vehicles & RC" }).getAttribute("href")
    ).toBe("/shop?department=vehicles-and-rc");
    expect(screen.getByRole("button", { name: "Previous toy categories" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next toy categories" })).toBeTruthy();
    expect(screen.queryByText("No image category")).toBeNull();
  });

  it("always uses the current Category image instead of a cached homepage image", () => {
    render(
      <HomepageToyCategoryCarousel
        categories={[
          {
            id: "vehicles",
            name: "Vehicles",
            slug: "vehicles",
            description: "",
            parentId: "toys",
            imageUrl: "/uploads/admin/current-vehicles-cutout.png",
            imageAlt: "Current Vehicles cutout",
            visible: true,
            sortOrder: 1
          }
        ]}
        section={{
          ...homepageSections.find((section) => section.sectionId === "home.toy-categories")!,
          items: [
            {
              id: "vehicles",
              title: "Vehicles",
              href: "/shop?department=vehicles",
              image: "/uploads/admin/old-homepage-image.png",
              imageAlt: "Old cached image",
              linkType: "category",
              linkValue: "vehicles"
            }
          ]
        }}
      />
    );

    expect(screen.getByAltText("Current Vehicles cutout").getAttribute("src")).toBe("/uploads/admin/current-vehicles-cutout.png");
    expect(screen.queryByAltText("Old cached image")).toBeNull();
  });

  it("uses the Website Editor title, selection, order, and visibility for toy categories", () => {
    const toyCategorySection = homepageSections.find(
      (section) => section.sectionId === "home.toy-categories"
    )!;
    const categories = [
      {
        id: "dolls",
        name: "Dolls",
        slug: "dolls",
        description: "",
        parentId: "toys",
        imageUrl: "/uploads/admin/dolls.png",
        imageAlt: "Dolls",
        visible: true,
        sortOrder: 1
      },
      {
        id: "vehicles",
        name: "Vehicles & RC",
        slug: "vehicles-and-rc",
        description: "",
        parentId: "toys",
        imageUrl: "/uploads/admin/vehicles.png",
        imageAlt: "Remote control vehicle",
        visible: true,
        sortOrder: 2
      }
    ];
    const section = {
      ...toyCategorySection,
      title: "Explore Toys",
      items: [
        {
          id: "vehicles",
          title: "Vehicles & RC",
          linkType: "category" as const,
          linkValue: "vehicles-and-rc"
        }
      ]
    };
    const { rerender } = render(
      <HomepageToyCategoryCarousel categories={categories} section={section} />
    );

    expect(screen.getByRole("heading", { name: "Explore Toys" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Shop Vehicles & RC" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Shop Dolls" })).toBeNull();

    rerender(
      <HomepageToyCategoryCarousel
        categories={categories}
        section={{ ...section, isVisible: false }}
      />
    );

    expect(screen.queryByRole("heading", { name: "Explore Toys" })).toBeNull();
  });

  it("renders the composed homepage callouts only once", () => {
    render(
      <HomePageTemplate
        products={storefrontProducts}
        sections={homepageSections.map((section) =>
          section.sectionId === "home.hero"
            ? { ...section, isVisible: true }
            : section
        )}
        trendingProducts={storefrontProducts.slice(0, 2)}
      />
    );

    expect(
      screen.getAllByRole("heading", { name: "New & trending" })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("heading", {
        name: "Set the table. Start the party."
      })
    ).toHaveLength(1);
  });

  it("renders only the brands selected in the Website Editor", () => {
    const featuredBrandsSection = homepageSections.find(
      (section) => section.sectionId === "home.featured-brands-carousel"
    )!;

    render(
      <HomepageFeaturedBrandsCarousel
        section={{
          ...featuredBrandsSection,
          items: [
            {
              id: "crayola",
              title: "Crayola",
              href: "/shop?brand=crayola",
              image: "/images/brands/crayola.png",
              linkType: "brand",
              linkValue: "crayola"
            },
            {
              id: "lego",
              title: "LEGO",
              href: "/shop?brand=lego",
              image: "/images/brands/lego.png",
              linkType: "brand",
              linkValue: "lego"
            }
          ]
        }}
      />
    );

    expect(
      screen.getByRole("link", { name: /Crayola/i }).getAttribute("href")
    ).toBe("/shop?brand=crayola");
    expect(
      screen.getByRole("link", { name: /LEGO/i }).getAttribute("href")
    ).toBe("/shop?brand=lego");
  });

  it("previews an empty hidden brand carousel without publishing demo brands", () => {
    const featuredBrandsSection = homepageSections.find(
      (section) => section.sectionId === "home.featured-brands-carousel"
    )!;

    const { container } = render(
      <HomepageFeaturedBrandsCarousel
        editorPreview
        forceVisible
        section={{ ...featuredBrandsSection, isVisible: false, items: [] }}
      />
    );

    expect(
      container.querySelectorAll("[data-brand-placeholder='true']")
    ).toHaveLength(16);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("previews a hidden seasonal row with its real selected category products", () => {
    const seasonalRow = homepageSections.find(
      (section) => section.variant === "seasonal-product-carousel"
    )!;
    const selectedProduct = {
      ...storefrontProducts[0],
      websiteCategorySlugs: ["party-supplies"]
    };

    render(
      <HomepageSeasonalProductCarousels
        editorPreviewSectionId={seasonalRow.sectionId}
        products={[selectedProduct]}
        sections={[
          {
            ...seasonalRow,
            categorySlug: "party-supplies",
            isVisible: false
          }
        ]}
      />
    );

    expect(
      screen.getByRole("heading", { name: selectedProduct.name })
    ).toBeTruthy();
  });

  it("keeps empty seasonal product rows out of the public homepage", () => {
    const seasonalRow = homepageSections.find(
      (section) => section.variant === "seasonal-product-carousel"
    )!;
    const { container } = render(
      <HomepageSeasonalProductCarousels
        products={[]}
        sections={[seasonalRow]}
      />
    );

    expect(container.querySelector("[data-store-section]")).toBeNull();
    expect(screen.queryByRole("heading", { name: seasonalRow.title })).toBeNull();
  });

  it("previews the future product-card layout without publishing fake products", () => {
    const seasonalRow = homepageSections.find(
      (section) => section.variant === "seasonal-product-carousel"
    )!;
    const { container } = render(
      <HomepageSeasonalProductCarousels
        editorPreviewSectionId={seasonalRow.sectionId}
        products={[]}
        sections={[seasonalRow]}
      />
    );

    expect(
      screen.getByRole("heading", { name: seasonalRow.title })
    ).toBeTruthy();
    expect(
      container.querySelectorAll("[data-homepage-product-placeholder='true']")
    ).toHaveLength(4);
    expect(container.querySelectorAll(".storefront-product-card")).toHaveLength(0);
  });

  it("previews the prepared featured-product area before catalog publishing", () => {
    const featuredProductsSection = homepageSections.find(
      (section) => section.sectionId === "home.featured-products"
    )!;
    const { container } = render(
      <HomePageTemplate
        editorPreview
        editorPreviewSectionId={featuredProductsSection.sectionId}
        products={[]}
        sections={[featuredProductsSection]}
      />
    );

    expect(
      screen.getByRole("heading", { name: featuredProductsSection.title })
    ).toBeTruthy();
    expect(
      container.querySelectorAll("[data-homepage-product-placeholder='true']")
    ).toHaveLength(4);
  });

});
