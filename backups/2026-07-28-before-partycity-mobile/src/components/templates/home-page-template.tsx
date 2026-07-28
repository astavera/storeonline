/*
STORE AREA: Homepage
SECTION: Homepage Template
SECTION ID: home.*
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Partially
WHAT THIS CONTROLS: Homepage composition from configurable sections and reusable commerce components.
SAFE TO EDIT: Section order, layout variants, and display-only content wiring.
DO NOT EDIT HERE: Square catalog sync, checkout, inventory validation, delivery fees, or payment processing.
RELATED FILES: src/config/homepage.config.ts, src/config/store-section-registry.ts
BUSINESS LOGIC FILES: src/features/departments/services/department-service.ts
*/

import { ProductCard } from "@/components/commerce/product-card";
import { ProductGrid } from "@/components/commerce/product-grid";
import { PageRenderer } from "@/components/cms";
import HalloweenHeroCard from "@/components/HalloweenHeroCard/HalloweenHeroCard";
import { ButtonLink } from "@/components/ui/button";
import { defaultHomepageImage, halloweenHomepageImage, type HomepageSectionConfig, type HomepageSectionElement, type HomepageSectionItem } from "@/config/homepage.config";
import { defaultHomepageSeo } from "@/config/homepage-seo.config";
import { storeLocations } from "@/config/locations.config";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import { homepageSectionsToCmsPageDocument, type CmsSection } from "@/lib/cms";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { SectionFrame } from "../sections/section-frame";

const SHOW_HOMEPAGE_PRODUCT_GRID = false;
const SHOW_HOMEPAGE_STORES = false;

export function HomePageTemplate({
  locations = storeLocations.filter((location) => location.slug !== "warehouse"),
  products = [],
  sections
}: {
  locations?: typeof storeLocations;
  products?: StorefrontProduct[];
  sections: HomepageSectionConfig[];
}) {
  const homepageSectionsById = new Map(sections.map((section) => [section.sectionId, section]));
  const cmsDocument = homepageSectionsToCmsPageDocument({
    sections,
    seo: defaultHomepageSeo,
    status: "PUBLISHED"
  });

  return <PageRenderer document={cmsDocument} renderSection={(section) => renderHomepageSection(section, homepageSectionsById, locations, products)} />;
}

function renderHomepageSection(section: CmsSection, sectionsById: Map<string, HomepageSectionConfig>, locations: typeof storeLocations, products: StorefrontProduct[]) {
  const homepageSection = sectionsById.get(section.id);

  if (!homepageSection) {
    return undefined;
  }

  const sectionType = sectionTypeFromSection(homepageSection);

  if (sectionType === "hero") {
    return (
      <>
        <HeroSection section={homepageSection} />
        <RetailPromoTiles />
      </>
    );
  }

  if (sectionType === "image-banner") {
    return <HeroSection section={homepageSection} />;
  }

  if (sectionType === "departments") {
    return <></>;
  }

  if (sectionType === "product-grid") {
    return SHOW_HOMEPAGE_PRODUCT_GRID && products.length > 0 ? <FeaturedProductsSection products={products} section={homepageSection} /> : <></>;
  }

  if (sectionType === "promo") {
    return <></>;
  }

  if (sectionType === "storefront") {
    return SHOW_HOMEPAGE_STORES ? <LocalStorefrontSection locations={locations} section={homepageSection} /> : <></>;
  }

  return <FlexibleSection products={products} section={homepageSection} />;
}

function HeroSection({ section }: { section: HomepageSectionConfig }) {
  const isBackToSchoolHero = section.variant === "back-to-school";
  const isSeasonalCardHero = section.variant === "seasonal-card";
  const heroImage = section.backgroundImage || defaultHomepageImage;
  const isHalloweenHeroCard =
    isSeasonalCardHero &&
    (heroImage === halloweenHomepageImage || section.title.toLowerCase().includes("halloween"));
  const showPrimaryCta = isSectionElementVisible(section, "primaryCta") && Boolean(section.ctaHref);
  const secondaryCtaHref = section.secondaryCtaHref || (isBackToSchoolHero ? "/stationery" : isSeasonalCardHero ? "/party-supplies" : "/balloons");
  const secondaryCtaLabel = section.secondaryCtaLabel || (isBackToSchoolHero ? "Build a School Kit" : isSeasonalCardHero ? "Browse party supplies" : "Balloon order");
  const showSecondaryCta = isSectionElementVisible(section, "secondaryCta") && Boolean(secondaryCtaHref && secondaryCtaLabel);
  const heroSizeClasses = {
    compact: "min-h-[520px] py-8 sm:min-h-[680px] sm:py-10 lg:min-h-[calc(100svh-96px)] lg:py-12",
    standard: "min-h-[calc(100svh-96px)] py-10 sm:min-h-[calc(100svh-106px)] sm:py-12 lg:min-h-[calc(100svh-96px)] lg:py-16",
    large: "min-h-[calc(100svh-96px)] py-10 sm:min-h-[calc(108svh-106px)] sm:py-12 lg:min-h-[calc(100svh-96px)] lg:py-16",
    fullscreen: "min-h-[100svh] py-10 sm:py-12 lg:min-h-[calc(100svh-96px)] lg:py-16"
  } as const;

  return (
    <SectionFrame
      area="Homepage"
      className={cn("homepage-full-hero relative isolate overflow-hidden bg-primary text-white", heroImage && "homepage-full-hero--has-image")}
      component="HomepageHeroSection"
      sectionId={section.sectionId}
      variant={section.variant}
    >
      {heroImage ? <div aria-hidden="true" className="homepage-hero-bg" style={{ backgroundImage: `url(${heroImage})` }} /> : null}
      {isBackToSchoolHero && !heroImage ? <BackToSchoolHeroBackdrop /> : null}
      <div className={cn("container-shell relative z-10 flex flex-col justify-center gap-8", heroSizeClasses[section.heroSize ?? "large"])}>
        <div className={cn("homepage-hero-copy", isSeasonalCardHero ? "homepage-seasonal-hero-card max-w-2xl" : "mx-auto max-w-5xl text-center", isSeasonalCardHero && heroCardPositionClass(section), isHalloweenHeroCard && "homepage-seasonal-hero-card--interactive")}>
          {isHalloweenHeroCard ? (
            <HalloweenHeroCard href={section.ctaHref || "/shop"} />
          ) : (
            <>
              {isSectionElementVisible(section, "eyebrow") && section.eyebrow ? <p className={cn("inline-flex rounded-pill px-4 py-2 text-xs font-black uppercase tracking-[0.14em]", isSeasonalCardHero ? "bg-primary text-white" : "bg-yellow text-primary")}>{section.eyebrow}</p> : null}
              {isSectionElementVisible(section, "title") && section.title ? <h1 className={cn("mt-5 font-display text-4xl font-black sm:text-5xl md:text-7xl", isSeasonalCardHero ? "max-w-xl text-center leading-[0.92] text-primary" : "mx-auto max-w-5xl uppercase leading-[0.94] text-white drop-shadow xl:text-8xl", isBackToSchoolHero && "leading-[0.86] xl:text-[6.5rem]")}>{section.title}</h1> : null}
              {isSectionElementVisible(section, "body") && section.body ? <p className={cn("homepage-hero-body mt-5 max-w-3xl text-lg font-bold leading-relaxed md:text-xl", isSeasonalCardHero ? "text-primary" : "mx-auto text-white")}>{section.body}</p> : null}
              {showPrimaryCta || showSecondaryCta ? (
                <div className={cn("mt-8 flex flex-wrap justify-center gap-3", isSeasonalCardHero && "homepage-seasonal-hero-actions")}>
                  {showPrimaryCta ? (
                    <ButtonLink className={cn("w-full justify-center px-8 py-3.5 text-base font-black sm:w-auto sm:px-10 sm:py-4", isSeasonalCardHero ? "rounded-sm bg-primary text-white hover:bg-blue" : "rounded-pill bg-white text-primary hover:bg-yellow")} href={section.ctaHref || "/shop"}>
                      {section.ctaLabel}
                    </ButtonLink>
                  ) : null}
                  {showSecondaryCta ? (
                    <ButtonLink className={cn("w-full justify-center px-8 py-3.5 text-base font-black sm:w-auto sm:px-10 sm:py-4", isSeasonalCardHero ? "rounded-sm border-2 border-primary bg-transparent text-primary hover:bg-white/35" : "rounded-pill bg-yellow text-blue hover:bg-cyan")} href={secondaryCtaHref}>
                      {secondaryCtaLabel}
                    </ButtonLink>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </SectionFrame>
  );
}

function BackToSchoolHeroBackdrop() {
  return (
    <div aria-hidden="true" className="homepage-back-to-school-shapes">
      <span className="homepage-school-paper" />
      <span className="homepage-school-pencil" />
      <span className="homepage-school-ruler" />
      <span className="homepage-school-eraser" />
    </div>
  );
}

type RetailPromoTile = {
  title: string;
  body?: string;
  cta: string;
  href: string;
  image?: string;
  backgroundColor?: string;
};


/*
Here are the cards under the Hero, the three cards, if you want to change the cards, you can change them here.
*/ 

function RetailPromoTiles() {
  const featuredTile: RetailPromoTile = {
    title: "Make your Halloween party extra spooky with our Halloween balloons.",
    cta: "Order now",
    href: "/balloons",
    backgroundColor: "bg-black",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRDkpW0SeFoCCxsB4U7CNUD3X2WY0OohTAiXiZ9RImg9A&s=10"
  };
  const tiles: RetailPromoTile[] = [
    {
      title: "",
      body: "",
      cta: "Costumes",
      href: "/shop",
      backgroundColor: "bg-blue",
      image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRARUJ5P6KooB1Y2umV3lgboOLbFqw7BsBt79Q229OmVw&s=10"
    },
    {
      title: "",
      body: "",
      cta: "Plan a party",
      href: "/party-supplies",
      image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRLmSX_HEuEf_okGpH03P12Rc4Ioi8QLLzB1QP3OLcA0A&s=10",
      backgroundColor: "bg-primary"
    },
    {
      title: "",
      body: "",
      cta: "Shop decorations",
      href: "/decorations",
      backgroundColor: "bg-red",
      image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSpbeIHaRTNVPyQxFt1K885FuFZi4l-emUA6Vzer0IzUQ&s=10"
    },
      
  ];
  const featuredUsesDarkText = featuredTile.backgroundColor === "bg-white" || featuredTile.backgroundColor === "bg-yellow";

  return (
    <SectionFrame area="Homepage" className="bg-surface py-4 sm:py-5" component="RetailPromoTiles" sectionId="home.retail-promos" variant="promo-tiles">
      <div className="container-shell grid gap-3 sm:gap-5">
        <article className={cn("grid overflow-hidden rounded-[18px] sm:rounded-md md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]", featuredTile.backgroundColor ?? "bg-primary", featuredUsesDarkText ? "text-primary" : "text-white")}>
          <div className="relative flex min-h-0 min-w-0 max-w-2xl flex-col items-center justify-center p-5 pb-4 text-center md:min-h-[480px] md:p-10 lg:p-12">
            <h2 className="homepage-featured-title mx-auto w-full max-w-[24ch] text-balance font-display text-[1.35rem] font-black capitalize leading-[1.08] tracking-[0.005em] sm:text-3xl md:text-[2rem]">{featuredTile.title}</h2>
            {featuredTile.body ? <p className={cn("mt-4 max-w-xl text-base font-semibold md:text-lg", featuredUsesDarkText ? "text-primary/80" : "text-white/90")}>{featuredTile.body}</p> : null}
            <ButtonLink className={cn("mt-5 min-h-11 w-full self-center justify-center rounded-pill px-7 py-3 font-black sm:mt-8 sm:w-fit sm:px-9", featuredUsesDarkText ? "bg-primary text-white hover:bg-blue" : "bg-white text-primary hover:bg-yellow")} href={featuredTile.href}>
              {featuredTile.cta}
            </ButtonLink>
          </div>
          {featuredTile.image ? (
            <div className="flex min-h-0 min-w-0 items-center justify-center p-4 pt-0 md:min-h-full md:p-8 lg:p-10">
              <div className="relative aspect-[16/9] w-full max-w-full overflow-hidden rounded-xl border border-white/20 bg-transparent md:aspect-[4/3] md:rounded-md md:border-2">
                <Image alt={featuredTile.title} className="object-contain p-2 sm:p-4" fill priority sizes="(max-width: 768px) calc(100vw - 3rem), 480px" src={featuredTile.image} unoptimized />
              </div>
            </div>
          ) : null}
        </article>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {tiles.map((tile) => {
            const tileBackground = tile.backgroundColor ?? "bg-blue";
            const usesDarkText = tileBackground === "bg-white" || tileBackground === "bg-yellow";

            return (
              <article className={cn("relative min-h-[250px] overflow-hidden rounded-[18px] sm:min-h-[360px] sm:rounded-md", tileBackground, usesDarkText ? "text-primary" : "text-white")} key={tile.href}>
                {tile.image ? <Image alt={tile.title} className="object-cover" fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" src={tile.image} unoptimized /> : null}
                {tile.image ? <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/5 sm:bg-gradient-to-r sm:from-blue/90 sm:via-blue/50 sm:to-transparent" /> : null}
                <div className="relative flex min-h-[250px] max-w-sm flex-col justify-center p-5 sm:min-h-[360px] sm:p-8">
                  <h2 className="font-display text-3xl font-black uppercase leading-none sm:text-4xl">{tile.title}</h2>
                  {tile.body ? <p className={cn("mt-3 text-sm font-semibold", usesDarkText ? "text-primary/80" : "text-white/90")}>{tile.body}</p> : null}
                  <ButtonLink className={cn("absolute bottom-4 left-1/2 min-h-11 max-w-[calc(100%_-_2rem)] -translate-x-1/2 justify-center whitespace-nowrap rounded-pill px-6 py-3 text-sm font-black shadow-lg sm:bottom-6 sm:px-8", usesDarkText ? "bg-primary text-white hover:bg-blue" : "bg-white text-primary hover:bg-yellow")} href={tile.href}>
                    {tile.cta}
                  </ButtonLink>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </SectionFrame>
  );
}

function FeaturedProductsSection({ products, section }: { products: StorefrontProduct[]; section: HomepageSectionConfig }) {
  return (
    <SectionFrame area="Homepage" className={cn(publicToneClass(section), publicPaddingClass(section))} component="FeaturedProductsSection" sectionId={section.sectionId} variant={section.variant}>
      <div className="container-shell">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className={cn("max-w-2xl", textPositionClass(section))}>
            <h2 className="font-display text-4xl font-black">{section.title}</h2>
            <p className="mt-3 text-secondary">{section.body}</p>
          </div>
          <div className="hidden items-center gap-2 md:flex" aria-hidden="true">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-blue/45 text-white">
              <ChevronLeft size={20} />
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-blue text-white">
              <ChevronRight size={20} />
            </span>
          </div>
        </div>
        <ProductGrid cardVariant="premium" limit={4} preset="balloons" products={products.slice(0, 4)} />
        {isSectionElementVisible(section, "primaryCta") && section.ctaHref ? (
          <div className="mt-10 flex justify-center">
            <ButtonLink className="rounded-pill px-8 py-3 font-black" href={section.ctaHref}>
              {section.ctaLabel || "Shop all"}
            </ButtonLink>
          </div>
        ) : null}
      </div>
    </SectionFrame>
  );
}

function LocalStorefrontSection({
  section,
  locations
}: {
  section: HomepageSectionConfig;
  locations: typeof storeLocations;
}) {
  return (
    <SectionFrame area="Homepage" className={cn(publicToneClass(section), publicPaddingClass(section))} component="LocalStorefrontSection" sectionId={section.sectionId} variant={section.variant}>
      <div className="container-shell">
        <div className={cn("mb-8 max-w-2xl", textPositionClass(section))}>
          {isSectionElementVisible(section, "title") && section.title ? <h2 className="font-display text-3xl font-semibold">{section.title}</h2> : null}
          {isSectionElementVisible(section, "body") && section.body ? <p className="mt-3 text-secondary">{section.body}</p> : null}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {locations.map((location) => (
            <article className="surface-card p-6" key={location.id}>
              <h3 className="font-display text-xl font-semibold">{location.name}</h3>
              <p className="mt-2 text-sm text-secondary">{location.address}</p>
              <p className="text-sm text-secondary">{location.locality}</p>
              <p className="mt-4 text-sm font-semibold">{location.phone}</p>
              <p className="text-sm text-secondary">{location.hours}</p>
            </article>
          ))}
        </div>
      </div>
    </SectionFrame>
  );
}

function FlexibleSection({ products, section }: { products: StorefrontProduct[]; section: HomepageSectionConfig }) {
  const sectionType = sectionTypeFromSection(section);
  const hasImage = Boolean(section.backgroundImage) && section.mediaPlacement !== "none";
  const image = hasImage ? (
    <Image
      alt={section.imageAlt || section.title}
      className="aspect-[4/3] h-full w-full rounded-md object-cover"
      height={600}
      loading="lazy"
      src={section.backgroundImage || defaultHomepageImage}
      unoptimized
      width={800}
    />
  ) : null;

  if (sectionType === "trust-bar") {
    return (
      <SectionFrame area="Homepage" className={cn(publicToneClass(section), publicPaddingClass(section))} component="TrustBarSection" sectionId={section.sectionId} variant={section.variant}>
        <div className="container-shell">
          <InlineItemGrid items={section.items ?? []} tone={section.backgroundTone === "dark" || section.backgroundTone === "brand" ? "dark" : "light"} />
        </div>
      </SectionFrame>
    );
  }

  if (sectionType === "faq") {
    return (
      <SectionFrame area="Homepage" className={cn(publicToneClass(section), publicPaddingClass(section))} component="FaqSection" sectionId={section.sectionId} variant={section.variant}>
        <div className={cn("container-shell", publicContentWidthClass(section))}>
          <SectionIntro section={section} />
          <div className="mt-8 grid gap-3">
            {(section.items ?? []).map((item) => (
              <details className="rounded-md border border-border bg-surface p-5" key={item.id}>
                <summary className="cursor-pointer font-semibold">{item.title}</summary>
                {item.body ? <p className="mt-3 text-sm text-secondary">{item.body}</p> : null}
              </details>
            ))}
          </div>
        </div>
      </SectionFrame>
    );
  }

  if (sectionType === "split-media") {
    return (
      <SectionFrame area="Homepage" className={cn(publicToneClass(section), publicPaddingClass(section))} component="SplitMediaSection" sectionId={section.sectionId} variant={section.variant}>
        <div className="container-shell grid gap-8 lg:grid-cols-2 lg:items-center">
          {section.mediaPlacement === "left" ? image : null}
          <div>
            <SectionIntro section={section} />
            {section.items?.length ? <SectionItemCards className="mt-7" items={section.items} products={products} section={section} /> : null}
          </div>
          {section.mediaPlacement !== "left" ? image : null}
        </div>
      </SectionFrame>
    );
  }

  return (
    <SectionFrame
      area="Homepage"
      backgroundImage={section.mediaPlacement === "background" ? section.backgroundImage : undefined}
      className={cn(publicToneClass(section), publicPaddingClass(section), section.mediaPlacement === "background" && "bg-cover text-white")}
      component="FlexibleHomepageSection"
      sectionId={section.sectionId}
      variant={section.variant}
    >
      <div className={cn("container-shell", publicContentWidthClass(section))}>
        <SectionIntro section={section} />
        {isSectionElementVisible(section, "primaryCta") && section.ctaHref ? (
          <ButtonLink className="mt-7" href={section.ctaHref} variant={section.mediaPlacement === "background" ? "primary" : "secondary"}>
            {section.ctaLabel || "Learn more"}
          </ButtonLink>
        ) : null}
        {isSectionElementVisible(section, "items") && section.items?.length ? <SectionItemCards className="mt-8" items={section.items} products={products} section={section} /> : null}
      </div>
    </SectionFrame>
  );
}

function SectionIntro({ section }: { section: HomepageSectionConfig }) {
  const isDark = section.backgroundTone === "dark" || section.backgroundTone === "brand" || section.mediaPlacement === "background";

  return (
    <div className={cn("max-w-3xl", textPositionClass(section), textWidthClass(section))}>
      {isSectionElementVisible(section, "eyebrow") && section.eyebrow ? <p className={cn("text-sm font-semibold uppercase tracking-[0.16em]", isDark ? "text-white/75" : "text-secondary")}>{section.eyebrow}</p> : null}
      {isSectionElementVisible(section, "title") && section.title ? <h2 className="mt-3 font-display text-3xl font-semibold md:text-4xl">{section.title}</h2> : null}
      {isSectionElementVisible(section, "body") && section.body ? <p className={cn("mt-4", isDark ? "text-white/82" : "text-secondary")}>{section.body}</p> : null}
    </div>
  );
}

function SectionItemCards({ className, items, products, section }: { className?: string; items: HomepageSectionItem[]; products: StorefrontProduct[]; section: HomepageSectionConfig }) {
  return (
    <div className={cn("grid gap-4", publicColumnsClass(section), className)}>
      {items.map((item) => (
        <HomepageItemCard item={item} key={item.id} products={products} />
      ))}
    </div>
  );
}

function HomepageItemCard({ item, products }: { item: HomepageSectionItem; products: StorefrontProduct[] }) {
  const linkedProduct = item.productSlug ? products.find((product) => product.slug === item.productSlug) : null;

  if (linkedProduct) {
    return <ProductCard product={linkedProduct} variant="premium" />;
  }

  return (
    <article className="surface-card p-5">
      {item.image ? <Image alt={item.imageAlt || item.title} className="mb-4 aspect-[4/3] w-full rounded-md object-cover" height={600} loading="lazy" src={item.image} unoptimized width={800} /> : null}
      {item.badge ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-secondary">{item.badge}</p> : null}
      <h3 className="font-display text-xl font-semibold">{item.title}</h3>
      {item.body ? <p className="mt-2 text-sm text-secondary">{item.body}</p> : null}
      {item.href ? (
        <ButtonLink className="mt-4 min-h-9 px-3 py-2" href={item.href} variant="secondary">
          {item.label || "View"}
        </ButtonLink>
      ) : null}
    </article>
  );
}

function InlineItemGrid({ className, items, tone }: { className?: string; items: HomepageSectionItem[]; tone: "dark" | "light" }) {
  const displayItems = items.length > 0 ? items : [{ id: "trust", title: "Secure checkout" }, { id: "pickup", title: "Store pickup" }, { id: "delivery", title: "Local delivery" }];

  return (
    <div className={cn("grid gap-3 md:grid-cols-3 lg:grid-cols-4", className)}>
      {displayItems.map((item) => (
        <div className={cn("rounded-md border px-4 py-3 text-sm font-semibold", tone === "dark" ? "border-white/20 bg-white/10 text-white" : "border-border bg-surface text-primary")} key={item.id}>
          {item.title}
          {item.body ? <p className={cn("mt-1 text-xs font-normal", tone === "dark" ? "text-white/75" : "text-secondary")}>{item.body}</p> : null}
        </div>
      ))}
    </div>
  );
}

function heroCardPositionClass(section: HomepageSectionConfig) {
  if (section.textPosition === "center") {
    return "mx-auto text-center";
  }

  if (section.textPosition === "right") {
    return "ml-auto text-right";
  }

  return "mr-auto text-left";
}

function textPositionClass(section: HomepageSectionConfig) {
  if (section.textPosition === "center") {
    return "mx-auto text-center";
  }

  if (section.textPosition === "right") {
    return "ml-auto text-right";
  }

  return "text-left";
}

function textWidthClass(section: HomepageSectionConfig) {
  return section.textPosition === "center" ? "mx-auto" : section.textPosition === "right" ? "ml-auto" : "";
}

function sectionTypeFromSection(section: HomepageSectionConfig): NonNullable<HomepageSectionConfig["sectionType"]> {
  if (section.sectionType) {
    return section.sectionType;
  }

  if (section.sectionId === "home.hero") {
    return "hero";
  }

  if (section.sectionId === "home.departments") {
    return "departments";
  }

  if (section.sectionId === "home.featured-products") {
    return "product-grid";
  }

  if (section.sectionId === "home.balloon-promo") {
    return "promo";
  }

  if (section.sectionId === "home.local-storefront") {
    return "storefront";
  }

  return "content";
}

function isSectionElementVisible(section: HomepageSectionConfig, element: HomepageSectionElement) {
  return !section.hiddenElements?.includes(element);
}

function publicPaddingClass(section: HomepageSectionConfig) {
  if (section.verticalPadding === "compact") {
    return "py-8";
  }

  if (section.verticalPadding === "spacious") {
    return "py-20";
  }

  return "py-14";
}

function publicToneClass(section: HomepageSectionConfig) {
  if (section.backgroundTone === "muted") {
    return "bg-surface-muted";
  }

  if (section.backgroundTone === "brand") {
    return "bg-primary text-white";
  }

  if (section.backgroundTone === "dark") {
    return "bg-primary text-white";
  }

  if (section.backgroundTone === "accent") {
    return "bg-[rgba(255,221,87,0.18)]";
  }

  return "bg-surface";
}

function publicContentWidthClass(section: HomepageSectionConfig) {
  if (section.contentWidth === "narrow") {
    return "max-w-3xl";
  }

  if (section.contentWidth === "normal") {
    return "max-w-5xl";
  }

  return "";
}

function publicColumnsClass(section: HomepageSectionConfig) {
  if (section.columns === 2) {
    return "md:grid-cols-2";
  }

  if (section.columns === 4) {
    return "md:grid-cols-2 lg:grid-cols-4";
  }

  return "md:grid-cols-3";
}
