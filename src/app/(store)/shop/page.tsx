/**
 * Renders the shop page and prepares its route-level data.
 */

import { ChevronDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BalloonOrderExperience } from "@/components/balloons/latex-order-experience";
import { ProductCard } from "@/components/commerce/product-card";
import { ShopFilterPanel } from "@/components/commerce/shop-filter-panel";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { SectionFrame } from "@/components/sections/section-frame";
import { getBalloonCatalogCollection, latexBalloonAddOnVariationIds, latexBalloonOrderVariationIds, type BalloonCatalogCollection } from "@/config/balloons.config";
import { productAgeGroupIds, storefrontProducts, type FulfillmentMode, type ProductAgeGroup, type StorefrontProduct } from "@/features/catalog/product-catalog";
import { filterWebsiteCatalogProducts, slugifyWebsiteCategory } from "@/features/catalog/services/website-merchandising-service";
import { readPublishedStorefrontCmsDocument } from "@/server/storefront/published-cms-document";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";

export const metadata = {
  title: "Shop",
  description: "Shop Modern State toys, balloons, party supplies, stationery, gifts, and creative essentials."
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ShopPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const useE2eFixture = process.env.E2E_CATALOG_FIXTURE === "true";
  const squareCatalogSource = useE2eFixture ? null : await readResolvedSquareWebsiteCatalog();
  const resolvedCatalog = squareCatalogSource?.catalog ?? null;
  const publishedDocument = await readPublishedStorefrontCmsDocument({ entityType: "landing", entityId: "shop" });

  const params = await searchParams;
  const catalogProducts = resolvedCatalog?.products ?? (useE2eFixture ? storefrontProducts : []);
  const selectedDepartment = paramValue(params?.department);
  const selectedCollection = getBalloonCatalogCollection(paramValue(params?.collection));
  const selectedBrandSlug = paramValue(params?.brand);
  const selectedAge = validAgeGroup(paramValue(params?.age));
  const requestedFulfillment = validFulfillmentMode(paramValue(params?.fulfillment));
  const selectedFulfillment = selectedCollection
    ? requestedFulfillment === "pickup" ? "pickup" : "local-delivery"
    : requestedFulfillment;
  const selectedLocation = paramValue(params?.location);
  const selectedFeature = paramValue(params?.feature) === "new-and-trending"
    ? "new-and-trending"
    : undefined;
  const selectedPostalCode = paramValue(params?.postalCode)?.replace(/\D/g, "").slice(0, 5);
  const selectedPickupDate = paramValue(params?.pickupDate);
  const selectedPickupSlotLabel = paramValue(params?.pickupSlotLabel)?.slice(0, 80);
  const selectedSort = paramValue(params?.sort) || "featured";
  const categories = resolvedCatalog
    ? resolvedCatalog.categories.map((category) => ({ id: category.id, name: category.name, slug: category.slug, description: category.description, parentId: category.parentId, productCount: resolvedCatalog.productVariationIdsByCategory[category.id]?.length ?? 0 }))
    : Array.from(new Set(catalogProducts.map((product) => product.department))).sort().map((name) => ({ id: name, name, slug: slugifyWebsiteCategory(name), description: "", parentId: null, productCount: catalogProducts.filter((product) => product.department === name).length }));
  const selectedCategory = selectedDepartment ? categories.find((category) => category.slug.toLowerCase() === selectedDepartment.toLowerCase()) : undefined;
  const brands = resolvedCatalog ? resolvedCatalog.brands.map((brand) => ({ id: brand.id, name: brand.name, slug: brand.slug, description: brand.description, logoUrl: brand.logoUrl, imageAlt: brand.imageAlt, productCount: resolvedCatalog.productVariationIdsByBrand[brand.id]?.length ?? 0 })) : [];
  const selectedBrand = selectedBrandSlug ? brands.find((brand) => brand.slug.toLowerCase() === selectedBrandSlug.toLowerCase()) : undefined;
  const categoryFilteredProducts = resolvedCatalog
    ? filterWebsiteCatalogProducts(resolvedCatalog, { categoryId: selectedCategory?.id, brandId: selectedBrand?.id, ageGroup: selectedAge, fulfillmentMode: selectedFulfillment, surface: "shop" })
    : catalogProducts.filter((product) => {
        const matchesCategory = !selectedCategory || slugifyWebsiteCategory(product.department) === selectedCategory.slug;
        const matchesAge = !selectedAge || product.ageGroups?.includes(selectedAge);
        const matchesFulfillment = !selectedFulfillment || product.fulfillmentModes.includes(selectedFulfillment);
        return matchesCategory && matchesAge && matchesFulfillment;
      });
  const featureFilteredProducts = selectedFeature
    ? resolvedCatalog
      ? categoryFilteredProducts.filter((product) =>
          resolvedCatalog.productVariationIdsBySurface["new-and-trending"].includes(
            product.squareVariationId
          )
        )
      : useE2eFixture
        ? categoryFilteredProducts
        : []
    : categoryFilteredProducts;
  const filteredProducts = selectedCollection
    ? featureFilteredProducts.filter((product) => matchesBalloonCatalogCollection(product, selectedCollection))
    : featureFilteredProducts;
  const products = sortProducts(filteredProducts, selectedSort);
  const shopProductsForCounts = resolvedCatalog ? filterWebsiteCatalogProducts(resolvedCatalog, { surface: "shop" }) : catalogProducts;
  const hasCatalogProducts = shopProductsForCounts.length > 0;
  const ageCounts = Object.fromEntries(productAgeGroupIds.map((age) => [age, shopProductsForCounts.filter((product) => product.ageGroups?.includes(age)).length]));
  const fulfillmentCounts = Object.fromEntries((["pickup", "local-delivery", "shipping"] as const).map((mode) => [mode, shopProductsForCounts.filter((product) => product.fulfillmentModes.includes(mode)).length]));

  if (selectedCollection) {
    const isLatexCollection = selectedCollection.slug === "latex";
    const catalogProductByVariationId = new Map(
      catalogProducts.map((product) => [product.squareVariationId, product])
    );
    const collectionProducts = isLatexCollection && squareCatalogSource?.source === "postgres"
      ? latexBalloonOrderVariationIds
          .map((variationId) => catalogProductByVariationId.get(variationId))
          .filter((product): product is StorefrontProduct => Boolean(product))
          .filter((product) => !selectedFulfillment || product.fulfillmentModes.includes(selectedFulfillment))
      : products;
    const hiFloatCandidate = isLatexCollection ? catalogProductByVariationId.get(latexBalloonAddOnVariationIds.hiFloat) : undefined;
    const hiFloat = hiFloatCandidate && (!selectedFulfillment || hiFloatCandidate.fulfillmentModes.includes(selectedFulfillment))
      ? hiFloatCandidate
      : undefined;
    const weights = (isLatexCollection ? latexBalloonAddOnVariationIds.weights : [])
      .map((variationId) => catalogProductByVariationId.get(variationId))
      .filter((product): product is StorefrontProduct => Boolean(product))
      .filter((product) => !selectedFulfillment || product.fulfillmentModes.includes(selectedFulfillment));

    return (
      <main className="bg-surface">
        <SectionFrame area="Balloons" className="py-6 md:py-8" component="BalloonOrderExperience" sectionId={`balloons.${selectedCollection.slug}-order`} variant="product-grid">
          <BalloonOrderExperience
            addOns={isLatexCollection ? { ...(hiFloat ? { hiFloat } : {}), weights } : undefined}
            collection={selectedCollection}
            fulfillment={selectedFulfillment === "pickup" ? "pickup" : "local-delivery"}
            location={selectedLocation}
            postalCode={selectedPostalCode}
            products={collectionProducts}
            requestedDate={selectedPickupDate}
            slotLabel={selectedPickupSlotLabel}
          />
        </SectionFrame>
      </main>
    );
  }

  if (publishedDocument) {
    return <StorefrontCmsPage document={publishedDocument} products={products} />;
  }

  return (
    <main className="bg-surface">
      <SectionFrame area="Shop" className="py-6 md:py-10" component="ShopPageSection" sectionId="shop.index" variant="product-grid">
        <div className="mx-auto w-[calc(100%_-_2rem)] max-w-[1720px]">
          <header className="mb-8 border-b border-border pb-6 md:mb-10 md:pb-8">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-blue">Modern State</p>
            <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.03em] text-primary md:text-5xl">Shop</h1>
          </header>

          {hasCatalogProducts ? (
            <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
              <ShopFilterPanel ageCounts={ageCounts} brands={brands} categories={categories} fulfillmentCounts={fulfillmentCounts} selectedAge={selectedAge} selectedBrand={selectedBrandSlug} selectedCategory={selectedDepartment} selectedFulfillment={selectedFulfillment} selectedSort={selectedSort} />

              <section aria-label="Products">
                {selectedFeature ? (
                  <h2 className="mb-6 font-display text-2xl font-black text-primary">New &amp; Trending</h2>
                ) : selectedCategory ? (
                  <h2 className="mb-6 font-display text-2xl font-black text-primary">{selectedCategory.name}</h2>
                ) : null}
                {selectedBrand ? <div className="mb-6 flex items-center gap-4 rounded-md border border-border bg-surface-muted p-5">{selectedBrand.logoUrl ? <Image alt={selectedBrand.imageAlt || `${selectedBrand.name} logo`} className="h-16 w-24 rounded-md bg-white object-contain p-2" height={64} src={selectedBrand.logoUrl} unoptimized width={96} /> : null}<div><p className="text-xs font-black uppercase tracking-[0.12em] text-blue">Website brand</p><h2 className="mt-1 font-display text-2xl font-black">{selectedBrand.name}</h2>{selectedBrand.description ? <p className="mt-2 text-sm text-secondary">{selectedBrand.description}</p> : null}</div></div> : null}
                <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <p className="text-lg font-black">{products.length} {products.length === 1 ? "product" : "products"}</p>
                  {products.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <SortMenu selectedAge={selectedAge} selectedBrand={selectedBrandSlug} selectedDepartment={selectedDepartment} selectedFeature={selectedFeature} selectedFulfillment={selectedFulfillment} selectedSort={selectedSort} />
                    </div>
                  ) : null}
                </div>
                {products.length ? (
                  <div className="storefront-product-grid grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {products.map((product) => (
                      <ProductCard key={product.squareVariationId} product={product} variant="premium" />
                    ))}
                  </div>
                ) : (
                  <div className="border-y border-border py-10 md:flex md:items-center md:justify-between md:gap-10 md:py-12">
                    <div className="max-w-xl">
                      <h2 className="font-display text-2xl font-black tracking-[-0.02em] text-primary">No products match these filters</h2>
                      <p className="mt-3 text-sm leading-6 text-secondary">Remove the current filters to see the full online selection.</p>
                    </div>
                    <Link className="mt-6 inline-flex min-h-11 items-center justify-center rounded-pill bg-primary px-6 py-3 text-sm font-black text-white transition hover:opacity-90 md:mt-0" href="/shop">
                      Clear filters
                    </Link>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <section aria-label="Products" className="border-y border-border py-10 md:flex md:items-center md:justify-between md:gap-12 md:py-14">
              <div className="max-w-2xl">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-secondary">Online catalog</p>
                <h2 className="mt-3 font-display text-3xl font-black tracking-[-0.03em] text-primary md:text-4xl">Online shopping is being updated</h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-secondary">We’re refreshing the online selection. You can still explore balloons or visit either Modern State location.</p>
              </div>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row md:mt-0 md:flex-col md:items-stretch">
                <Link className="inline-flex min-h-11 items-center justify-center rounded-pill bg-primary px-6 py-3 text-sm font-black text-white transition hover:opacity-90" href="/balloons">
                  Explore balloons
                </Link>
                <Link className="inline-flex min-h-11 items-center justify-center rounded-pill border border-border bg-surface px-6 py-3 text-sm font-black text-primary transition hover:border-primary" href="/locations">
                  Find a store
                </Link>
              </div>
            </section>
          )}
        </div>
      </SectionFrame>
    </main>
  );
}

function SortMenu({ selectedAge, selectedBrand, selectedCollection, selectedDepartment, selectedFeature, selectedFulfillment, selectedSort }: { selectedAge?: ProductAgeGroup; selectedBrand?: string; selectedCollection?: string; selectedDepartment?: string; selectedFeature?: string; selectedFulfillment?: FulfillmentMode; selectedSort: string }) {
  const label = sortLabel(selectedSort);

  return (
    <details className="relative min-w-[230px] rounded-pill border border-border bg-surface px-5 py-3 text-sm font-black shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-5">
        <span>Sort by:</span>
        <span className="font-semibold text-secondary">{label}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </summary>
      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 grid min-w-full gap-1 rounded-md border border-border bg-surface p-2 shadow-card">
        {[
          ["featured", "Featured"],
          ["price-low", "Price: low to high"],
          ["price-high", "Price: high to low"]
        ].map(([value, optionLabel]) => (
          <Link className="rounded-md px-3 py-2 text-sm font-bold hover:bg-surface-muted" href={hrefWithParams({ age: selectedAge, brand: selectedBrand, collection: selectedCollection, department: selectedDepartment, feature: selectedFeature, fulfillment: selectedFulfillment, sort: value })} key={value}>
            {optionLabel}
          </Link>
        ))}
      </div>
    </details>
  );
}

function matchesBalloonCatalogCollection(product: StorefrontProduct, collection: BalloonCatalogCollection) {
  const searchableText = [product.name, product.shortDescription, product.description, product.department]
    .join(" ")
    .toLowerCase();

  return collection.keywords.some((keyword) => searchableText.includes(keyword));
}

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hrefWithParams(input: { age?: ProductAgeGroup; brand?: string; collection?: string; department?: string; feature?: string; fulfillment?: FulfillmentMode; sort?: string }) {
  const params = new URLSearchParams();

  if (input.department) {
    params.set("department", input.department);
  }

  if (input.collection) {
    params.set("collection", input.collection);
  }

  if (input.brand) {
    params.set("brand", input.brand);
  }

  if (input.age) {
    params.set("age", input.age);
  }

  if (input.feature) {
    params.set("feature", input.feature);
  }

  if (input.fulfillment) {
    params.set("fulfillment", input.fulfillment);
  }

  if (input.sort && input.sort !== "featured") {
    params.set("sort", input.sort);
  }

  const query = params.toString();
  return query ? `/shop?${query}` : "/shop";
}

function sortProducts(products: StorefrontProduct[], sort: string) {
  const sortedProducts = [...products];

  if (sort === "price-low") {
    return sortedProducts.sort((a, b) => a.priceCents - b.priceCents);
  }

  if (sort === "price-high") {
    return sortedProducts.sort((a, b) => b.priceCents - a.priceCents);
  }

  return sortedProducts;
}

function sortLabel(sort: string) {
  if (sort === "price-low") {
    return "Price low";
  }

  if (sort === "price-high") {
    return "Price high";
  }

  return "Featured";
}

function validAgeGroup(value: string | undefined): ProductAgeGroup | undefined {
  return productAgeGroupIds.find((ageGroup) => ageGroup === value);
}

function validFulfillmentMode(value: string | undefined): FulfillmentMode | undefined {
  if (value === "delivery") {
    return "local-delivery";
  }

  return (["pickup", "local-delivery", "shipping"] as const).find((mode) => mode === value);
}
