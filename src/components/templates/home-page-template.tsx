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

import { DepartmentCardGrid } from "@/components/commerce/department-card-grid";
import { ProductCard } from "@/components/commerce/product-card";
import { ProductGrid } from "@/components/commerce/product-grid";
import { PageRenderer } from "@/components/cms";
import { ButtonLink } from "@/components/ui/button";
import { defaultHomepageImage, type HomepageSectionConfig, type HomepageSectionElement, type HomepageSectionItem } from "@/config/homepage.config";
import { storeLocations } from "@/config/locations.config";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import { homepageSectionsToCmsPageDocument, type CmsSection } from "@/lib/cms";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SectionFrame } from "../sections/section-frame";

const defaultHomepageTemplateSeo: Parameters<typeof homepageSectionsToCmsPageDocument>[0]["seo"] = {
  title: "Modern State - State News NYC",
  description: "Toys, party supplies, balloons, stationery, arts and crafts, greeting cards, and gifts on the Upper East Side.",
  ogTitle: "Modern State - State News NYC",
  ogDescription: "Shop Modern State for toys, balloons, party supplies, stationery, gifts, and neighborhood essentials.",
  ogImage: defaultHomepageImage,
  canonicalUrl: "/",
  indexable: true
};

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
    seo: defaultHomepageTemplateSeo,
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
    return products.length > 0 ? <FeaturedProductsSection products={products} section={homepageSection} /> : <></>;
  }

  if (sectionType === "promo") {
    return <BalloonPromoSection section={homepageSection} />;
  }

  if (sectionType === "storefront") {
    return <LocalStorefrontSection locations={locations} section={homepageSection} />;
  }

  return <FlexibleSection products={products} section={homepageSection} />;
}

function HeroSection({ section }: { section: HomepageSectionConfig }) {
  const isBackToSchoolHero = section.variant === "back-to-school";
  const heroImage = isBackToSchoolHero ? section.backgroundImage : section.backgroundImage || defaultHomepageImage;
  const showPrimaryCta = isSectionElementVisible(section, "primaryCta") && Boolean(section.ctaHref);
  const showSecondaryCta = isSectionElementVisible(section, "secondaryCta");
  const secondaryCtaHref = isBackToSchoolHero ? "/stationery" : "/balloons";
  const secondaryCtaLabel = isBackToSchoolHero ? "Build a School Kit" : "Balloon order";

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
      <div className="container-shell relative z-10 flex min-h-[calc(108svh-106px)] flex-col justify-center gap-8 py-12 lg:min-h-[calc(116svh-106px)] lg:py-16">
        <div className="homepage-hero-copy mx-auto max-w-5xl text-center">
          {isSectionElementVisible(section, "eyebrow") && section.eyebrow ? <p className="inline-flex rounded-pill bg-yellow px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-primary">{section.eyebrow}</p> : null}
          {isSectionElementVisible(section, "title") && section.title ? <h1 className={cn("mx-auto mt-5 max-w-5xl font-display text-5xl font-black uppercase text-white drop-shadow md:text-7xl", isBackToSchoolHero ? "leading-[0.86] xl:text-[6.5rem]" : "leading-[0.94] xl:text-8xl")}>{section.title}</h1> : null}
          {isSectionElementVisible(section, "body") && section.body ? <p className="homepage-hero-body mx-auto mt-5 max-w-3xl text-lg font-bold leading-relaxed text-white md:text-xl">{section.body}</p> : null}
          {showPrimaryCta || showSecondaryCta ? (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {showPrimaryCta ? (
                <ButtonLink className="rounded-pill bg-white px-10 py-4 text-base font-black text-primary hover:bg-yellow" href={section.ctaHref || "/shop"}>
                  {section.ctaLabel}
                </ButtonLink>
              ) : null}
              {showSecondaryCta ? (
                <ButtonLink className="rounded-pill bg-yellow px-10 py-4 text-base font-black text-blue hover:bg-cyan" href={secondaryCtaHref}>
                  {secondaryCtaLabel}
                </ButtonLink>
              ) : null}
            </div>
          ) : null}
        </div>
        {isSectionElementVisible(section, "items") ? (
          <div className="homepage-hero-visual mx-auto w-full max-w-5xl">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-white">
              <p className="text-xs font-black uppercase tracking-[0.18em]">{isBackToSchoolHero ? "Shop by brand or category" : "Shop the essentials"}</p>
              <Link className="rounded-pill bg-white px-4 py-2 text-sm font-black text-primary hover:bg-yellow" href={isBackToSchoolHero ? "/shop" : section.ctaHref || "/shop"}>
                Shop all
              </Link>
            </div>
            <HeroCategoryTiles campaign={isBackToSchoolHero} items={section.items} />
          </div>
        ) : null}
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

function HeroCategoryTiles({ campaign = false, items }: { campaign?: boolean; items?: HomepageSectionItem[] }) {
  const defaultTiles: HomepageSectionItem[] = [
    { id: "toys", title: "Toys", href: "/toys", image: "/images/category-toys.svg" },
    { id: "party", title: "Party", href: "/party-supplies", image: "/images/category-party.svg" },
    { id: "balloons", title: "Balloons", href: "/balloons", image: "/images/category-balloons.svg" },
    { id: "gifts", title: "Gifts", href: "/gifts", image: "/images/category-gifts.svg" }
  ];
  const tiles = items && items.length > 0 ? items : defaultTiles;
  const tones = campaign ? ["bg-yellow text-primary", "bg-cyan text-primary", "bg-green text-primary", "bg-red text-white"] : ["bg-yellow text-primary", "bg-cyan text-primary", "bg-green text-primary", "bg-red text-white"];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {tiles.map((tile, index) => (
        <Link className={cn("group rounded-md p-4 transition hover:-translate-y-1 hover:shadow-card", campaign ? "min-h-[142px] text-left" : "text-center", tile.label === "Brand" && tile.image ? "bg-white text-primary" : tones[index % tones.length])} href={tile.href || "/shop"} key={tile.id}>
          {tile.image ? <Image alt={tile.imageAlt || `${tile.title} logo`} className="mx-auto aspect-[4/3] h-20 w-full rounded bg-white object-contain p-2 transition group-hover:scale-[1.04]" height={80} src={tile.image} unoptimized width={240} /> : null}
          {tile.label ? <span className="block text-[11px] font-black uppercase tracking-[0.14em]">{tile.label}</span> : null}
          <span className={cn("block font-black", campaign ? "mt-3 text-xl leading-none" : "mt-3 text-sm")}>{tile.title}</span>
          {tile.body ? <span className="mt-3 block text-xs font-extrabold leading-snug">{tile.body}</span> : null}
        </Link>
      ))}
    </div>
  );
}

function RetailPromoTiles() {
  const tiles = [
    {
      title: "New & trending",
      body: "Fresh toys, art kits, party pieces, and giftable finds.",
      cta: "Shop new",
      href: "/shop",
      image: "https://images.unsplash.com/photo-1560961911-ba7ef651a56c?auto=format&fit=crop&w=1200&q=80"
    },
    {
      title: "Birthday ready",
      body: "Balloons, tableware, wrap, cards, and last-minute surprises.",
      cta: "Plan a party",
      href: "/party-supplies",
      image: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1200&q=80"
    }
  ];

  return (
    <SectionFrame area="Homepage" className="bg-surface py-10" component="RetailPromoTiles" sectionId="home.retail-promos" variant="promo-tiles">
      <div className="container-shell grid gap-5 lg:grid-cols-2">
        {tiles.map((tile) => (
          <article className="relative min-h-[260px] overflow-hidden rounded-md bg-blue text-white" key={tile.title}>
            <img alt="" className="absolute inset-0 h-full w-full object-cover" decoding="async" loading="lazy" src={tile.image} />
            <div className="absolute inset-0 bg-gradient-to-r from-blue/90 via-blue/50 to-transparent" />
            <div className="relative flex min-h-[260px] max-w-sm flex-col justify-center p-8">
              <h2 className="font-display text-4xl font-black uppercase leading-none">{tile.title}</h2>
              <p className="mt-3 text-sm font-semibold text-white/90">{tile.body}</p>
              <ButtonLink className="mt-6 w-fit rounded-pill bg-white px-8 py-3 font-black text-primary hover:bg-yellow" href={tile.href}>
                {tile.cta}
              </ButtonLink>
            </div>
          </article>
        ))}
      </div>
    </SectionFrame>
  );
}

function DepartmentsSection({ products, section }: { products: StorefrontProduct[]; section: HomepageSectionConfig }) {
  return (
    <SectionFrame area="Homepage" className={cn(publicToneClass(section), publicPaddingClass(section))} component="DepartmentCardGrid" sectionId={section.sectionId} variant={section.variant}>
      <div className="container-shell">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className={cn("max-w-2xl", textPositionClass(section))}>
            {isSectionElementVisible(section, "title") && section.title ? <h2 className="font-display text-4xl font-black">{section.title}</h2> : null}
            {isSectionElementVisible(section, "body") && section.body ? <p className="mt-3 text-secondary">{section.body}</p> : null}
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
        {section.items?.length ? <RetailCategoryRail items={section.items} products={products} /> : <DepartmentCardGrid />}
      </div>
    </SectionFrame>
  );
}

function RetailCategoryRail({ items, products }: { items: HomepageSectionItem[]; products: StorefrontProduct[] }) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((item) => {
        const linkedProduct = item.productSlug ? products.find((product) => product.slug === item.productSlug) : null;
        const href = item.href || (linkedProduct ? `/products/${linkedProduct.slug}` : "/shop");
        const image = item.image || linkedProduct?.imageUrl || "/images/product-fallback.svg";

        return (
          <Link className="group text-center" href={href} key={item.id}>
            <span className="block aspect-square overflow-hidden rounded-md bg-surface-muted p-3 transition group-hover:-translate-y-1 group-hover:shadow-card">
              <img alt={item.imageAlt || item.title} className="h-full w-full rounded-sm object-cover" decoding="async" loading="lazy" src={image} />
            </span>
            <span className="mt-4 block text-lg font-black leading-tight">{item.title}</span>
            {item.body ? <span className="mt-1 block text-sm font-semibold text-secondary">{item.body}</span> : null}
          </Link>
        );
      })}
    </div>
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

function BalloonPromoSection({ section }: { section: HomepageSectionConfig }) {
  const items =
    section.items && section.items.length > 0
      ? section.items
      : [
          { id: "latex", title: "Latex", body: "Classic colors for birthdays, parties, and everyday celebrations." },
          { id: "mylar", title: "Mylar", body: "Characters, messages, and shapes for every special moment." },
          { id: "numbers", title: "Numbers", body: "Milestone numbers in celebration-ready colors." },
          { id: "bouquets", title: "Bouquets", body: "Ready-made combinations for an easy, festive surprise." }
        ];

  return (
    <SectionFrame area="Homepage" className={cn(publicToneClass(section), publicPaddingClass(section))} component="BalloonPromoSection" sectionId={section.sectionId} variant={section.variant}>
      <div className="container-shell grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
        <div className={textPositionClass(section)}>
          <span className="mb-4 block h-1 w-12 rounded-pill bg-yellow" />
          {isSectionElementVisible(section, "title") && section.title ? <h2 className="font-display text-3xl font-semibold">{section.title}</h2> : null}
          {isSectionElementVisible(section, "body") && section.body ? <p className="mt-3 max-w-2xl text-secondary">{section.body}</p> : null}
          {isSectionElementVisible(section, "primaryCta") && section.ctaHref ? (
            <ButtonLink className="mt-7" href={section.ctaHref}>
              {section.ctaLabel}
            </ButtonLink>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <div className="surface-card p-5" key={item.id}>
              <p className="font-semibold">{item.title}</p>
              <p className="mt-2 text-sm text-secondary">{item.body}</p>
            </div>
          ))}
        </div>
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
    <img
      alt={section.imageAlt || section.title}
      className="aspect-[4/3] h-full w-full rounded-md object-cover"
      decoding="async"
      loading="lazy"
      src={section.backgroundImage || defaultHomepageImage}
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
      {item.image ? <img alt={item.imageAlt || item.title} className="mb-4 aspect-[4/3] w-full rounded-md object-cover" decoding="async" loading="lazy" src={item.image} /> : null}
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

function imagePositionClass(section: HomepageSectionConfig) {
  if (section.mediaPlacement === "left") {
    return "bg-left";
  }

  if (section.mediaPlacement === "right") {
    return "bg-right";
  }

  return "bg-center";
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
