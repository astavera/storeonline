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
import { getHolidayBySlug } from "@/config/holidays.config";
import { filterWebsiteCatalogProducts } from "@/features/catalog/services/website-merchandising-service";
import { HolidayComingSoon } from "@/features/holidays/components/holiday-coming-soon";
import { readPublishedStorefrontCmsDocument } from "@/server/storefront/published-cms-document";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";

export async function HolidayDetailTemplate({ slug }: { slug: string }) {
  const websiteCatalog = await readCurrentWebsiteCatalog();
  const publishedDocument = await readPublishedStorefrontCmsDocument({ entityType: "holiday", entityId: slug });

  if (websiteCatalog) {
    const holiday = websiteCatalog.holidays.find((current) => current.slug === slug);

    if (holiday) {
      if (!publishedDocument) return <HolidayComingSoon holidayName={holiday.name} />;

      const products = filterWebsiteCatalogProducts(websiteCatalog, { holidayId: holiday.id, surface: "holiday-pages" });
      return <StorefrontCmsPage document={publishedDocument} products={products} />;
    }
  }

  if (publishedDocument) {
    return <StorefrontCmsPage document={publishedDocument} />;
  }

  const holiday = getHolidayBySlug(slug);

  if (!holiday) {
    notFound();
  }

  return <HolidayComingSoon holidayName={holiday.title_en} />;
}

async function readCurrentWebsiteCatalog() {
  const source = await readResolvedSquareWebsiteCatalog();
  if (!source) return null;
  return source.catalog;
}
