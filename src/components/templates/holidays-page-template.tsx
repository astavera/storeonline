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

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { ProductGrid } from "@/components/commerce/product-grid";
import { getHolidayBySlug, holidays } from "@/config/holidays.config";
import { filterWebsiteCatalogProducts, resolveWebsiteCatalog, type ResolvedWebsiteCatalog, type WebsiteHoliday } from "@/features/catalog/services/website-merchandising-service";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";
import { readWebsiteMerchandisingSnapshot } from "@/server/admin/website-merchandising-store";
import { readSquareStorefrontProductsByVariationIds } from "@/server/square/catalog-test-cache-store";
import { SectionFrame } from "../sections/section-frame";

export async function HolidaysIndexTemplate() {
  const websiteCatalog = await readCurrentWebsiteCatalog();

  if (websiteCatalog) {
    return <WebsiteHolidaysIndex catalog={websiteCatalog} />;
  }

  const publishedDocument = await readLatestCmsDocument({ entityType: "holiday", entityId: "index", statuses: ["PUBLISHED"] });

  if (publishedDocument) {
    return <StorefrontCmsPage document={publishedDocument} />;
  }

  return (
    <main>
      <SectionFrame area="Holidays" className="bg-surface-muted py-16" component="HolidaysIndexHeroSection" sectionId="holidays.index-hero" variant="parent">
        <div className="container-shell">
          <span className="mb-4 block h-1 w-12 rounded-pill bg-red" />
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight md:text-5xl">Seasonal favorites for every celebration.</h1>
          <p className="mt-4 max-w-2xl text-secondary">Find timely gifts, party supplies, cards, decorations, and neighborhood favorites throughout the year.</p>
        </div>
      </SectionFrame>
      <SectionFrame area="Holidays" className="py-16" component="ActiveHolidaysGridSection" sectionId="holidays.active-holidays-grid" variant="holiday-card-grid">
        <div className="container-shell">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {holidays
              .filter((holiday) => holiday.is_visible)
              .map((holiday) => (
                <Link className="surface-card overflow-hidden" href={`/holidays/${holiday.slug}`} key={holiday.slug}>
                  <div className="aspect-[4/3] bg-surface-muted">
                    <Image alt="" className="h-full w-full object-cover" height={480} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" src={holiday.hero_image_url} unoptimized width={640} />
                  </div>
                  <div className="p-4">
                    <h2 className="font-display text-lg font-semibold">{holiday.title_en}</h2>
                    <p className="mt-2 text-sm text-secondary">{holiday.description_en}</p>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-secondary">{holiday.is_active ? "Active" : "Scheduled"}</p>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      </SectionFrame>
    </main>
  );
}

export async function HolidayDetailTemplate({ slug }: { slug: string }) {
  const websiteCatalog = await readCurrentWebsiteCatalog(slug);
  const publishedDocument = await readLatestCmsDocument({ entityType: "holiday", entityId: slug, statuses: ["PUBLISHED"] });

  if (websiteCatalog) {
    const holiday = websiteCatalog.holidays.find((current) => current.slug === slug);

    if (!holiday) {
      notFound();
    }

    const products = filterWebsiteCatalogProducts(websiteCatalog, { holidayId: holiday.id, surface: "holiday-pages" });
    return publishedDocument ? <StorefrontCmsPage document={publishedDocument} products={products} /> : <WebsiteHolidayDetail catalog={websiteCatalog} holiday={holiday} />;
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

function WebsiteHolidaysIndex({ catalog }: { catalog: ResolvedWebsiteCatalog }) {
  return (
    <main>
      <SectionFrame area="Holidays" className="bg-surface-muted py-16" component="WebsiteHolidaysIndexHeroSection" sectionId="holidays.website-index-hero" variant="parent">
        <div className="container-shell">
          <span className="mb-4 block h-1 w-12 rounded-pill bg-red" />
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight md:text-5xl">Holiday collections</h1>
          <p className="mt-4 max-w-2xl text-secondary">Only campaigns enabled in Admin and inside their active date window appear here.</p>
        </div>
      </SectionFrame>
      <SectionFrame area="Holidays" className="py-16" component="WebsiteHolidaysGridSection" sectionId="holidays.website-grid" variant="holiday-card-grid">
        <div className="container-shell">
          {catalog.holidays.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {catalog.holidays.map((holiday) => (
                <Link className="surface-card p-5" href={`/holidays/${holiday.slug}`} key={holiday.id}>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-red">Active campaign</p>
                  <h2 className="mt-2 font-display text-xl font-semibold">{holiday.name}</h2>
                  {holiday.description ? <p className="mt-2 text-sm text-secondary">{holiday.description}</p> : null}
                  <p className="mt-4 text-xs font-semibold text-secondary">{holiday.startDate} - {holiday.endDate}</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-surface-muted p-8 text-center text-secondary">No holiday collection is currently published.</div>
          )}
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

async function readCurrentWebsiteCatalog(holidaySlug?: string) {
  const config = await readWebsiteMerchandisingSnapshot();
  const holidayId = holidaySlug ? config.holidays.find((holiday) => holiday.slug === holidaySlug)?.id : null;
  const variationIds = holidayId
    ? config.placements
        .filter((placement) => placement.holidayAssignments.some((assignment) => assignment.holidayId === holidayId))
        .map((placement) => placement.squareVariationId)
    : [];
  const products = readSquareStorefrontProductsByVariationIds(variationIds);
  return resolveWebsiteCatalog(products, config);
}
