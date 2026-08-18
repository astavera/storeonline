/*
STORE AREA: Holidays
SECTION: Holidays Template
SECTION ID: holidays.*
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Yes
WHAT THIS CONTROLS: Editable holidays index and detail page rendering.
SAFE TO EDIT: Campaign display, active holiday card layout, and seasonal copy presentation.
DO NOT EDIT HERE: Square category changes, prices, inventory, or checkout logic.
RELATED FILES: src/config/holidays.config.ts, src/config/store-section-registry.ts
BUSINESS LOGIC FILES: src/features/holidays/services/holiday-service.ts
*/

import { notFound } from "next/navigation";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { ProductGrid } from "@/components/commerce/product-grid";
import { getHolidayBySlug } from "@/config/holidays.config";
import { filterWebsiteCatalogProducts, type ResolvedWebsiteCatalog, type WebsiteHoliday } from "@/features/catalog/services/website-merchandising-service";
import { HolidaysLandingPage } from "@/features/holidays/components/holidays-landing-page";
import { readPublishedStorefrontCmsDocument } from "@/server/storefront/published-cms-document";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";
import { SectionFrame } from "../sections/section-frame";

export async function HolidaysIndexTemplate({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> } = {}) {
  const [websiteCatalog, publishedDocument] = await Promise.all([
    readCurrentWebsiteCatalog(),
    readPublishedStorefrontCmsDocument({ entityType: "holiday", entityId: "index" })
  ]);
  const products = websiteCatalog
    ? Array.from(new Map(websiteCatalog.holidays.flatMap((holiday) =>
        filterWebsiteCatalogProducts(websiteCatalog, { holidayId: holiday.id, surface: "holiday-pages" })
      ).map((product) => [product.squareVariationId, product])).values())
    : [];

  if (publishedDocument) {
    return <StorefrontCmsPage document={publishedDocument} products={products} />;
  }

  return <HolidaysLandingPage catalog={websiteCatalog} catalogAvailable={Boolean(websiteCatalog)} searchParams={searchParams} />;
}

export async function HolidayDetailTemplate({ slug }: { slug: string }) {
  const websiteCatalog = await readCurrentWebsiteCatalog();
  const publishedDocument = await readPublishedStorefrontCmsDocument({ entityType: "holiday", entityId: slug });

  if (websiteCatalog) {
    const holiday = websiteCatalog.holidays.find((current) => current.slug === slug);

    if (holiday) {
      const products = filterWebsiteCatalogProducts(websiteCatalog, { holidayId: holiday.id, surface: "holiday-pages" });
      return publishedDocument ? <StorefrontCmsPage document={publishedDocument} products={products} /> : <WebsiteHolidayDetail catalog={websiteCatalog} holiday={holiday} />;
    }
  }

  if (publishedDocument) {
    return <StorefrontCmsPage document={publishedDocument} />;
  }

  const holiday = getHolidayBySlug(slug);

  if (!holiday) {
    notFound();
  }

  return (
    <main>
      <SectionFrame
        area="Holidays"
        backgroundImage={holiday.hero_image_url}
        className="flex min-h-[420px] items-end bg-cover bg-center text-white"
        component="HolidayDetailHeroSection"
        sectionId="holidays.detail-hero"
        variant={holiday.layout_preset}
      >
        <div className="container-shell pb-12 pt-28">
          <span className="mb-4 block h-1 w-12 rounded-pill" style={{ backgroundColor: holiday.custom_accent_color ?? `var(${holiday.accent_color_token})` }} />
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight md:text-5xl">{holiday.hero_title_en}</h1>
          <p className="mt-4 max-w-2xl text-white/88">{holiday.hero_subtitle_en}</p>
        </div>
      </SectionFrame>
      <SectionFrame area="Holidays" className="bg-surface py-16" component="HolidayProductGridSection" sectionId="holidays.detail-product-grid" variant={holiday.product_grid_preset}>
        <div className="container-shell">
          <div className="mb-8 max-w-2xl">
            <h2 className="font-display text-3xl font-semibold">{holiday.title_en} picks</h2>
            <p className="mt-3 text-secondary">{holiday.description_en}</p>
          </div>
          <ProductGrid cardVariant={holiday.product_card_variant} preset={holiday.product_grid_preset} />
        </div>
      </SectionFrame>
    </main>
  );
}

function WebsiteHolidayDetail({ catalog, holiday }: { catalog: ResolvedWebsiteCatalog; holiday: WebsiteHoliday }) {
  const products = filterWebsiteCatalogProducts(catalog, { holidayId: holiday.id, surface: "holiday-pages" });

  return (
    <main>
      <SectionFrame area="Holidays" className="bg-primary py-16 text-white" component="WebsiteHolidayDetailHeroSection" sectionId={`holidays.${holiday.slug}.hero`} variant="holiday-hero">
        <div className="container-shell">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-yellow">Holiday campaign</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight md:text-5xl">{holiday.name}</h1>
          {holiday.description ? <p className="mt-4 max-w-2xl text-white/85">{holiday.description}</p> : null}
        </div>
      </SectionFrame>
      <SectionFrame area="Holidays" className="bg-surface py-16" component="WebsiteHolidayProductGridSection" sectionId={`holidays.${holiday.slug}.products`} variant="holiday-card">
        <div className="container-shell">
          <p className="mb-6 text-sm font-semibold text-secondary">{products.length} {products.length === 1 ? "product" : "products"}</p>
          <ProductGrid preset="holiday-card" products={products} />
        </div>
      </SectionFrame>
    </main>
  );
}

async function readCurrentWebsiteCatalog() {
  const source = await readResolvedSquareWebsiteCatalog();
  if (!source) return null;
  return source.catalog;
}
