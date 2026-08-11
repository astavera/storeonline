/**
 * Composes the active Holidays index from published catalog data only.
 */

import Link from "next/link";
import { ProductCard } from "@/components/commerce/product-card";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import { filterWebsiteCatalogProducts, type ResolvedWebsiteCatalog } from "@/features/catalog/services/website-merchandising-service";
import { DepartmentProductShelf } from "@/features/departments/components/department-product-shelf";
import { DepartmentPromoActions } from "@/features/departments/components/department-promo-actions";

type HolidaysLandingPageProps = {
  catalog: ResolvedWebsiteCatalog | null;
  catalogAvailable: boolean;
  searchParams?: Record<string, string | string[] | undefined>;
};

const pageSize = 20;

export function HolidaysLandingPage({ catalog, catalogAvailable, searchParams }: HolidaysLandingPageProps) {
  const selectedHolidaySlug = paramValue(searchParams?.holiday);
  const selectedHoliday = selectedHolidaySlug
    ? catalog?.holidays.find((holiday) => holiday.slug === selectedHolidaySlug)
    : undefined;
  const selectedSort = validSort(paramValue(searchParams?.sort));
  const page = clampPage(paramValue(searchParams?.page));
  const holidayProducts = catalog
    ? uniqueProducts((selectedHoliday ? [selectedHoliday] : catalog.holidays).flatMap((holiday) =>
        filterWebsiteCatalogProducts(catalog, { holidayId: holiday.id, surface: "holiday-pages" })
      ))
    : [];
  const sortedProducts = sortProducts(holidayProducts, selectedSort);
  const visibleProducts = sortedProducts.slice(0, page * pageSize);
  const trendingIds = new Set(catalog?.productVariationIdsBySurface["new-and-trending"] ?? []);
  const trendingProducts = holidayProducts.filter((product) => trendingIds.has(product.squareVariationId));

  return (
    <main className="bg-surface">
      <section className="bg-navy py-14 text-white sm:py-20">
        <div className="container-shell">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-yellow">Seasonal collections</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-black leading-tight sm:text-5xl">Celebrate what’s happening now.</h1>
          <p className="mt-4 max-w-2xl text-white/85">Only active, published holiday collections appear here. Expired and hidden campaigns stay private.</p>
        </div>
      </section>

      <DepartmentPromoActions
        actions={[
          { href: "/holidays#catalog", label: "Shop seasonal", tone: "blue" },
          { href: "/holidays#active-holidays", label: "Active holidays", tone: "gold" },
          { href: "/holidays#new-seasonal", label: "New seasonal", tone: "red" }
        ]}
        label="Holiday shortcuts"
      />

      <section aria-labelledby="active-holidays-title" className="bg-surface py-10 sm:py-14" id="active-holidays">
        <div className="container-shell">
          <div className="mb-7 max-w-2xl">
            <h2 className="font-display text-3xl font-black tracking-tight text-primary" id="active-holidays-title">Active Holidays</h2>
            <p className="mt-2 text-sm text-secondary">Collections are controlled by their Admin visibility and publication dates.</p>
          </div>
          {catalog?.holidays.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {catalog.holidays.map((holiday) => (
                <Link className="group rounded-md border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-blue hover:shadow-soft motion-reduce:transform-none" href={`/holidays?holiday=${encodeURIComponent(holiday.slug)}#catalog`} key={holiday.id}>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-red">Active campaign</p>
                  <h3 className="mt-2 font-display text-xl font-black text-primary transition group-hover:text-blue">{holiday.name}</h3>
                  {holiday.description ? <p className="mt-2 text-sm text-secondary">{holiday.description}</p> : null}
                  <p className="mt-4 text-xs font-bold text-secondary">{formatDateRange(holiday.startDate, holiday.endDate)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <HolidayEmptyState catalogAvailable={catalogAvailable} />
          )}
        </div>
      </section>

      <div id="new-seasonal">
        <DepartmentProductShelf products={trendingProducts} title="New Seasonal" />
      </div>

      <section aria-labelledby="seasonal-products-title" className="bg-surface-muted py-10 sm:py-14" id="catalog">
        <div className="mx-auto w-[calc(100%_-_2rem)] max-w-[1720px]">
          <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-blue">Holidays</p>
              <h2 className="mt-2 font-display text-3xl font-black tracking-tight text-primary sm:text-4xl" id="seasonal-products-title">{selectedHoliday?.name ?? "Seasonal Products"}</h2>
              <p className="mt-2 text-sm text-secondary">{sortedProducts.length} {sortedProducts.length === 1 ? "published product" : "published products"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedHoliday ? <Link className="inline-flex min-h-11 items-center rounded-pill border border-blue bg-surface px-4 py-2 text-sm font-black text-blue" href="/holidays#catalog">All active holidays ×</Link> : null}
              <Link aria-current={selectedSort === "price-low" ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-pill border border-border bg-surface px-4 py-2 text-sm font-bold text-primary" href={holidayHref(searchParams, { page: undefined, sort: "price-low" }) + "#catalog"}>Price: low</Link>
              <Link aria-current={selectedSort === "price-high" ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-pill border border-border bg-surface px-4 py-2 text-sm font-bold text-primary" href={holidayHref(searchParams, { page: undefined, sort: "price-high" }) + "#catalog"}>Price: high</Link>
            </div>
          </div>

          {visibleProducts.length ? (
            <>
              <div className="department-product-grid storefront-product-grid grid gap-4">
                {visibleProducts.map((product) => <ProductCard key={product.squareVariationId} product={product} variant="premium" />)}
              </div>
              {visibleProducts.length < sortedProducts.length ? (
                <div className="mt-10 flex justify-center">
                  <Link className="inline-flex min-h-11 items-center rounded-pill border border-navy px-6 py-3 text-sm font-black text-navy hover:bg-navy hover:text-white" href={holidayHref(searchParams, { page: String(page + 1) }) + "#catalog"}>Load more products</Link>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-surface px-6 py-12 text-center">
              <h3 className="font-display text-2xl font-black text-primary">No seasonal products are published right now.</h3>
              <p className="mx-auto mt-3 max-w-xl text-sm text-secondary">Products will appear only after an active holiday assignment is published through Admin.</p>
              <Link className="mt-6 inline-flex min-h-11 items-center rounded-pill bg-navy px-6 py-3 text-sm font-black text-white" href="/shop">Shop all products</Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function HolidayEmptyState({ catalogAvailable }: { catalogAvailable: boolean }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface-muted px-6 py-10 text-center">
      <h3 className="font-display text-2xl font-black text-primary">{catalogAvailable ? "No holiday collection is active." : "Holiday collections are temporarily unavailable."}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm text-secondary">{catalogAvailable ? "Admin can schedule the next collection without exposing expired or hidden campaigns." : "Please try again shortly."}</p>
    </div>
  );
}

function uniqueProducts(products: StorefrontProduct[]) {
  return Array.from(new Map(products.map((product) => [product.squareVariationId, product])).values());
}

function sortProducts(products: StorefrontProduct[], sort: string) {
  if (sort === "price-low") return [...products].sort((first, second) => first.priceCents - second.priceCents);
  if (sort === "price-high") return [...products].sort((first, second) => second.priceCents - first.priceCents);
  return products;
}

function holidayHref(current: Record<string, string | string[] | undefined> | undefined, patch: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current ?? {})) {
    const normalized = paramValue(value);
    if (normalized) params.set(key, normalized);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `/holidays?${query}` : "/holidays";
}

function validSort(value?: string) {
  return value === "price-low" || value === "price-high" ? value : "featured";
}

function clampPage(value?: string) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) ? Math.min(50, Math.max(1, page)) : 1;
}

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateRange(startDate: string, endDate: string) {
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${format.format(new Date(`${startDate}T12:00:00Z`))} – ${format.format(new Date(`${endDate}T12:00:00Z`))}`;
}
