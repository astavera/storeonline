import { DepartmentCardGrid } from "@/components/commerce/department-card-grid";
import { AddToCartButton } from "@/components/commerce/add-to-cart-button";
import { ProductGrid } from "@/components/commerce/product-grid";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { StorefrontBreadcrumb } from "@/components/layout/storefront-breadcrumb";
import { storeLocations } from "@/config/locations.config";
import { fulfillmentModeLabel, getProductBySlug, getProductsByDepartment, getProductsBySlugs, getVisibleProducts, type StorefrontProduct } from "@/features/catalog/product-catalog";
import type { ProductGridPresetId } from "@/design/presets/product-grid-presets";
import type { CmsPageDocument, CmsSection, SectionContentItem } from "@/lib/cms";
import { cn, formatMoney } from "@/lib/utils";
import { PageRenderer, type CmsSectionRenderContext } from "./page-renderer";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

const productSectionTypes = new Set([
  "productGrid",
  "productCarousel",
  "featuredProducts",
  "featuredCollection",
  "bestSellers",
  "newArrivals",
  "seasonalCollection",
  "relatedProducts",
  "productBundle",
  "product-grid"
]);

const categorySectionTypes = new Set(["featuredCategories", "departmentShowcase", "departments"]);
const heroSectionTypes = new Set(["hero", "holidayHero", "locationHero", "image-banner"]);
const productDetailSectionTypes = new Set([
  "productImageGallery",
  "productTitle",
  "productPrice",
  "productBadges",
  "variantSelector",
  "quantitySelector",
  "addToCartButton",
  "buyNowButton",
  "productDescription",
  "productSpecs",
  "shippingInfo",
  "returnsInfo",
  "productReviews",
  "stockIndicator",
  "sizeGuide"
]);
const promoSectionTypes = new Set([
  "promoBanner",
  "countdownPromo",
  "limitedAvailabilityBanner",
  "sameDayDeliveryBanner",
  "preorderCta",
  "returnPolicyHighlight",
  "shippingDeliveryPromise"
]);
const trustSectionTypes = new Set(["benefitsIcons", "trustBar", "trustBadges", "secureCheckoutBadges", "squarePaymentTrust", "pickupDeliveryInfo"]);
const editorialSectionTypes = new Set(["brandStory", "editorialStory", "imageWithText", "splitMedia", "localSeoContentBlock", "content", "collectionShowcase"]);
const testimonialSectionTypes = new Set(["testimonials", "reviews", "pressMentions"]);
const newsletterSectionTypes = new Set(["newsletter", "newsletterCta"]);
const giftGuideSectionTypes = new Set(["giftGuideGrid", "occasionCards", "holidayCollection"]);
const globalSectionTypes = new Set(["header", "footer", "announcementBar"]);

export type StorefrontCmsSectionRenderOptions = {
  includeGlobalFrame?: boolean;
  products?: StorefrontProduct[];
  product?: StorefrontProduct;
  primaryHeadingSectionId?: string;
};

export function StorefrontCmsPage({ document, product, products }: { document: CmsPageDocument; product?: StorefrontProduct; products?: StorefrontProduct[] }) {
  const primaryHeadingSectionId = primaryHeadingSectionIdForDocument(document);
  return (
    <>
      {shouldShowDocumentBreadcrumb(document) ? (
        <div className="bg-surface pt-8">
          <div className="container-shell">
            <StorefrontBreadcrumb currentLabel={breadcrumbLabelForDocument(document)} />
          </div>
        </div>
      ) : null}
      <PageRenderer document={document} renderSection={(section, context) => renderStorefrontCmsSection(section, context, { primaryHeadingSectionId, product, products })} />
    </>
  );
}

function shouldShowDocumentBreadcrumb(document: CmsPageDocument) {
  return document.slug !== "/" && !(document.entityType === "landing" && document.entityId === "shop");
}

function breadcrumbLabelForDocument(document: CmsPageDocument) {
  return document.title.replace(/^(Landing|Department|Holiday|Product|Location|Policy):\s*/i, "");
}

function primaryHeadingSectionIdForDocument(document: CmsPageDocument) {
  const visibleSections = document.sections.filter((section) => !section.hidden);
  const preferred = document.entityType === "product"
    ? visibleSections.find((section) => section.id === "products.detail" || section.type === "productTitle")
    : document.entityType === "landing" && document.entityId === "shop"
      ? visibleSections.find((section) => section.id === "shop.index")
      : undefined;
  return (preferred ?? visibleSections.find((section) => heroSectionTypes.has(String(section.type))) ?? visibleSections[0])?.id;
}

export function renderStorefrontCmsSection(section: CmsSection, _context?: CmsSectionRenderContext, options: StorefrontCmsSectionRenderOptions = {}) {
  const isPrimaryHeading = options.primaryHeadingSectionId ? options.primaryHeadingSectionId === section.id : true;
  if (globalSectionTypes.has(String(section.type))) {
    return options.includeGlobalFrame ? <EditableGlobalFrameSection section={section} /> : <></>;
  }

  if (heroSectionTypes.has(String(section.type))) {
    return <EditableHeroSection isPrimaryHeading={isPrimaryHeading} section={section} />;
  }

  if (section.id === "products.detail") {
    return <EditableProductDetailSection isPrimaryHeading={isPrimaryHeading} product={options.product} section={section} />;
  }

  if (productDetailSectionTypes.has(String(section.type))) {
    return <EditableProductModuleSection isPrimaryHeading={isPrimaryHeading} product={options.product} section={section} />;
  }

  if (productSectionTypes.has(String(section.type))) {
    return <EditableProductsSection isPrimaryHeading={isPrimaryHeading} products={options.products} section={section} />;
  }

  if (categorySectionTypes.has(String(section.type))) {
    return <EditableCategoriesSection section={section} />;
  }

  if (promoSectionTypes.has(String(section.type))) {
    return <EditablePromoSection section={section} />;
  }

  if (trustSectionTypes.has(String(section.type))) {
    return <EditableTrustSection section={section} />;
  }

  if (editorialSectionTypes.has(String(section.type))) {
    return <EditableEditorialSection section={section} />;
  }

  if (testimonialSectionTypes.has(String(section.type))) {
    return <EditableTestimonialsSection section={section} />;
  }

  if (newsletterSectionTypes.has(String(section.type))) {
    return <EditableNewsletterSection section={section} />;
  }

  if (giftGuideSectionTypes.has(String(section.type))) {
    return <EditableGiftGuideSection section={section} />;
  }

  if (String(section.type) === "storeLocationCard" || String(section.type) === "storefront") {
    return <EditableLocationsSection section={section} />;
  }

  if (String(section.type) === "faq" || String(section.type) === "faqPreview") {
    return <EditableFaqSection section={section} />;
  }

  return undefined;
}

function EditableGlobalFrameSection({ section }: { section: CmsSection }) {
  if (String(section.type) === "header") {
    return (
      <div data-cms-component="EditableGlobalHeaderSection">
        <SiteHeader />
      </div>
    );
  }

  if (String(section.type) === "footer") {
    return (
      <div data-cms-component="EditableGlobalFooterSection">
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="bg-cyan px-4 py-2 text-center text-sm font-black text-primary" data-cms-component="EditableAnnouncementBarSection">
      {String(section.content.title || section.content.body || "Visit Modern State on the Upper East Side")}
    </div>
  );
}

function EditableHeroSection({ isPrimaryHeading, section }: { isPrimaryHeading: boolean; section: CmsSection }) {
  const image = section.media.image;
  const imageIsBackground = Boolean(image) && section.layout.imagePosition === "background";
  const showSplitMedia = !imageIsBackground && section.layout.imagePosition !== "none";
  const isDark = section.design.backgroundTone === "dark" || section.design.backgroundTone === "brand" || imageIsBackground;
  const Heading = isPrimaryHeading ? "h1" : "h2";

  return (
    <section
      className={cn("flex min-h-[460px] items-center bg-cover bg-center py-16 md:py-20", isDark ? "text-white" : "bg-surface text-primary")}
      data-cms-component="EditableHeroSection"
      style={
        imageIsBackground
          ? {
              backgroundImage: `linear-gradient(90deg, rgba(17, 24, 39, 0.78), rgba(17, 24, 39, 0.22)), url(${image})`
            }
          : undefined
      }
    >
      <div className={cn("container-shell grid gap-8", showSplitMedia && "lg:grid-cols-[0.92fr_1.08fr] lg:items-center")}>
        <div className={cn(section.layout.alignment === "center" && !showSplitMedia ? "mx-auto max-w-4xl text-center" : "max-w-3xl")}>
          {section.content.eyebrow ? <p className={cn("text-sm font-black uppercase tracking-[0.14em]", isDark ? "text-yellow" : "text-green")} data-cms-edit-field="eyebrow">{String(section.content.eyebrow)}</p> : null}
          <Heading className="mt-3 font-display text-5xl font-black leading-tight md:text-6xl" data-cms-edit-field="title">{String(section.content.title || section.label)}</Heading>
          {section.content.body ? <p className={cn("mt-4 text-lg font-semibold", isDark ? "text-white/90" : "text-secondary")} data-cms-edit-field="body">{String(section.content.body)}</p> : null}
          <a className={cn("mt-7 inline-flex min-h-11 items-center justify-center rounded-pill px-7 py-3 text-sm font-black", isDark ? "bg-white text-primary" : "bg-blue text-white")} data-cms-edit-field="primaryCta" href={String(section.content.primaryCtaHref || "/shop")}>
            {String(section.content.primaryCtaLabel || "Shop now")}
          </a>
        </div>
        {showSplitMedia ? (
          image ? (
            <img alt={section.media.imageAlt || section.label} className="aspect-[16/10] w-full rounded-md object-cover shadow-soft" data-cms-edit-field="image" src={image} />
          ) : (
            <HeroFallbackPanel />
          )
        ) : null}
      </div>
    </section>
  );
}

function EditableProductDetailSection({ isPrimaryHeading, product: providedProduct, section }: { isPrimaryHeading: boolean; product?: StorefrontProduct; section: CmsSection }) {
  const product = providedProduct ?? (section.dataSource.id ? getProductBySlug(section.dataSource.id) : null);
  const title = String(section.content.title || product?.name || section.label);
  const body = String(section.content.body || product?.description || "");
  const image = section.media.image || product?.imageUrl || "";
  const price = product ? (product.priceAvailable === false ? "Price unavailable" : formatMoney(product.priceCents)) : "$0.00";
  const fulfillmentModes = product?.fulfillmentModes ?? [];
  const inventoryStatus = product?.inventoryStatus ?? "in-stock";
  const Heading = isPrimaryHeading ? "h1" : "h2";

  return (
    <section className="bg-surface py-16" data-cms-component="EditableProductDetailSection">
      <div className="container-shell grid gap-10 lg:grid-cols-[0.9fr_1fr] lg:items-start">
        <div className="overflow-hidden rounded-md border border-border bg-surface-muted" data-cms-edit-field="image">
          {image ? <Image alt={section.media.imageAlt || title} className="aspect-[4/3] h-full w-full object-cover" height={900} src={image} unoptimized width={1200} /> : <HeroFallbackPanel />}
        </div>
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary" data-cms-edit-field="eyebrow">
            {String(section.content.eyebrow || product?.department || "Product")}
          </p>
          <Heading className="mt-3 font-display text-4xl font-semibold leading-tight" data-cms-edit-field="title">{title}</Heading>
          {body ? <p className="mt-4 max-w-2xl text-lg text-secondary" data-cms-edit-field="body">{body}</p> : null}
          <p className="mt-6 text-2xl font-semibold" data-cms-edit-field="productPrice">{price}</p>
          <div className="mt-5 flex flex-wrap gap-2" data-cms-edit-field="items">
            {fulfillmentModes.length > 0 ? (
              fulfillmentModes.map((mode) => (
                <span className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm font-semibold text-secondary" key={mode}>
                  {fulfillmentModeLabel(mode)}
                </span>
              ))
            ) : (
              <span className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm font-semibold text-secondary">Pickup</span>
            )}
          </div>
          <div className="mt-8 max-w-sm" data-cms-edit-field="primaryCta">
            {product && !product.previewOnly ? (
              <AddToCartButton disabled={product.inventoryStatus === "out-of-stock" || product.priceAvailable === false} disabledReason={product.priceAvailable === false ? "Price unavailable" : "Out of stock"} label={String(section.content.primaryCtaLabel || "Add to cart")} squareVariationId={product.squareVariationId} />
            ) : product?.previewOnly ? (
              <div className="rounded-pill border border-blue/30 bg-cyan px-5 py-3 text-center font-black text-primary">Read-only Square preview</div>
            ) : (
              <Link className="inline-flex min-h-11 w-full items-center justify-center rounded-pill bg-blue px-6 py-3 text-sm font-black text-white" href="/contact">
                Contact the store
              </Link>
            )}
          </div>
          <div className="mt-8 grid gap-3 rounded-md border border-border bg-surface-muted p-4 text-sm text-secondary" data-cms-edit-field="linkedProducts">
            <p>
              <span className="font-semibold text-primary">Availability:</span> {inventoryLabel(inventoryStatus)}
            </p>
            <p>
              <span className="font-semibold text-primary">Good to know:</span> Final availability and your order total are confirmed before purchase.
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}

function EditableProductModuleSection({ isPrimaryHeading, product: providedProduct, section }: { isPrimaryHeading: boolean; product?: StorefrontProduct; section: CmsSection }) {
  const product = providedProduct ?? (section.dataSource.id ? getProductBySlug(section.dataSource.id) : null);
  const title = String(section.content.title || product?.name || section.label);
  const type = String(section.type);
  const Heading = isPrimaryHeading ? "h1" : "h2";

  if (type === "productImageGallery") {
    const image = section.media.image || product?.imageUrl;
    return <section className="container-shell py-8" data-cms-component="ProductImageGallery">{image ? <Image alt={section.media.imageAlt || title} className="aspect-[4/3] w-full rounded-md object-cover" height={900} src={image} unoptimized width={1200} /> : <HeroFallbackPanel />}</section>;
  }
  if (type === "productTitle") {
    return <section className="container-shell py-6" data-cms-component="ProductTitle"><Heading className="font-display text-4xl font-semibold leading-tight">{title}</Heading></section>;
  }
  if (type === "productPrice") {
    return <section className="container-shell py-4" data-cms-component="ProductPrice"><p className="text-2xl font-semibold">{product ? (product.priceAvailable === false ? "Price unavailable" : formatMoney(product.priceCents)) : "Price unavailable"}</p></section>;
  }
  if (type === "addToCartButton" || type === "buyNowButton") {
    return <section className="container-shell py-4" data-cms-component="ProductPurchaseAction">{product && !product.previewOnly ? <div className="max-w-sm"><AddToCartButton disabled={product.inventoryStatus === "out-of-stock" || product.priceAvailable === false} disabledReason={product.priceAvailable === false ? "Price unavailable" : "Out of stock"} label={String(section.content.primaryCtaLabel || "Add to cart")} squareVariationId={product.squareVariationId} /></div> : <p className="text-secondary">Purchasing is unavailable for this preview.</p>}</section>;
  }
  if (type === "productDescription") {
    return <section className="container-shell py-6" data-cms-component="ProductDescription"><h2 className="font-display text-2xl font-semibold">{title}</h2><p className="mt-3 max-w-3xl text-secondary">{String(section.content.body || product?.description || "Product details are being prepared.")}</p></section>;
  }
  if (type === "stockIndicator") {
    return <section className="container-shell py-4" data-cms-component="ProductStockIndicator"><p><span className="font-semibold">Availability:</span> {inventoryLabel(product?.inventoryStatus ?? "special-order")}</p></section>;
  }

  return <EditableEditorialSection section={section} />;
}

function EditableProductsSection({ isPrimaryHeading, products: providedProducts, section }: { isPrimaryHeading: boolean; products?: StorefrontProduct[]; section: CmsSection }) {
  const limit = typeof section.dataSource.limit === "number" ? section.dataSource.limit : 4;
  const items = manualItems(section);
  const products = providedProducts ? providedProducts.slice(0, limit) : productsForSection(section, limit);
  const preset = productGridPresetForSection(section);

  if (section.id === "shop.index" || section.variant === "catalog") {
    return <EditableShopCatalogSection isPrimaryHeading={isPrimaryHeading} products={products} section={section} />;
  }

  return (
    <section className="bg-surface py-16" data-cms-component="EditableProductsSection">
      <div className="container-shell">
        <SectionIntro section={section} />
        <div className="mt-8">
          {items.length > 0 ? <EditableCardGrid items={items} /> : <EditableProductGrid products={products} preset={preset} />}
        </div>
      </div>
    </section>
  );
}

function EditableShopCatalogSection({ isPrimaryHeading, products, section }: { isPrimaryHeading: boolean; products: StorefrontProduct[]; section: CmsSection }) {
  const departments = Array.from(new Set(getVisibleProducts().map((product) => product.department))).sort();
  const title = String(section.content.title || "Shop");
  const Heading = isPrimaryHeading ? "h1" : "h2";

  return (
    <section className="bg-surface" data-cms-component="EditableShopCatalogSection">
      <section className="py-8 md:py-12">
        <div className="container-shell">
          <nav aria-label="Breadcrumb" className="mb-5 text-sm font-black text-primary [&_*]:text-primary" data-cms-edit-field="breadcrumbs">
            <Link className="text-primary hover:underline" href="/">
              Home
            </Link>
            <span className="mx-2 text-secondary">›</span>
            <span className="text-primary">{title}</span>
          </nav>
          <div className="mb-8 max-w-3xl">
            <Heading className="font-display text-4xl font-black leading-tight md:text-5xl" data-cms-edit-field="title">{title}</Heading>
            <p className="mt-3 text-lg text-secondary">Browse toys, balloons, party supplies, stationery, gifts, and neighborhood favorites.</p>
          </div>

          <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-[170px] lg:self-start" data-cms-edit-field="filters">
              <details className="rounded-md border border-border bg-surface lg:hidden">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-black [&::-webkit-details-marker]:hidden">
                  <span>Filters</span>
                  <span aria-hidden="true">⌄</span>
                </summary>
                <div className="border-t border-border px-5 pb-2">
                  <EditableShopFilterOptions departments={departments} />
                </div>
              </details>
              <div className="hidden rounded-md border border-border bg-surface p-5 lg:block">
                <div className="mb-4 flex items-center justify-between border-b border-border pb-4">
                  <h2 className="font-black">Filter</h2>
                </div>
                <EditableShopFilterOptions departments={departments} />
              </div>
            </aside>

            <section aria-label="Products" data-cms-edit-field="linkedProducts">
              <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <p className="text-lg font-black" data-cms-edit-field="productCount">{products.length} products</p>
                <div className="relative min-w-[230px] rounded-pill border border-border bg-surface px-5 py-3 text-sm font-black shadow-sm" data-cms-edit-field="sort">
                  <span>Sort by:</span>
                  <span className="ml-3 font-semibold text-secondary">Featured</span>
                </div>
              </div>
              <ProductGrid cardVariant="premium" preset="editorial" products={products} />
            </section>
          </div>
        </div>
      </section>
    </section>
  );
}

function EditableShopFilterOptions({ departments }: { departments: string[] }) {
  return (
    <>
      <ShopFilterGroup label="Category">
        <Link className="rounded-pill bg-blue px-3 py-1 text-sm font-black text-white" href="/shop">
          All products
        </Link>
        {departments.map((department) => (
          <Link className="rounded-pill bg-surface-muted px-3 py-1 text-sm font-black text-secondary hover:bg-cyan hover:text-primary" href={`/shop?department=${encodeURIComponent(department)}`} key={department}>
            {department}
          </Link>
        ))}
      </ShopFilterGroup>
      <ShopFilterGroup label="Age">
        {["0-2", "3-4", "5-7", "8-10", "11-12", "13+"].map((age) => (
          <span className="rounded-pill bg-surface-muted px-3 py-1 text-sm font-bold text-secondary" key={age}>
            {age}
          </span>
        ))}
      </ShopFilterGroup>
      <ShopFilterGroup label="Fulfillment">
        {["Pickup", "Local delivery", "Shipping"].map((mode) => (
          <span className="rounded-pill bg-surface-muted px-3 py-1 text-sm font-bold text-secondary" key={mode}>
            {mode}
          </span>
        ))}
      </ShopFilterGroup>
      <ShopFilterGroup label="Price">
        <Link className="text-sm font-bold text-blue hover:underline" href="/shop?sort=price-low">
          Low to high
        </Link>
        <Link className="text-sm font-bold text-blue hover:underline" href="/shop?sort=price-high">
          High to low
        </Link>
      </ShopFilterGroup>
    </>
  );
}

function ShopFilterGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <details className="border-b border-border py-4 last:border-b-0" open>
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black">
        {label}
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </details>
  );
}

function EditablePromoSection({ section }: { section: CmsSection }) {
  const image = section.media.image;
  const items = manualItems(section);

  return (
    <section className="bg-surface py-12" data-cms-component="EditablePromoSection">
      <div className="container-shell">
        <div className="grid overflow-hidden rounded-md bg-blue text-white shadow-soft lg:grid-cols-[1fr_0.82fr]">
          <div className="p-8 md:p-10">
            {section.content.eyebrow ? <p className="text-sm font-black uppercase tracking-[0.14em] text-yellow">{String(section.content.eyebrow)}</p> : null}
            <h2 className="mt-2 font-display text-3xl font-black md:text-5xl">{String(section.content.title || "Fresh finds for every celebration")}</h2>
            <p className="mt-4 max-w-2xl text-sm font-semibold text-white/85 md:text-base">{String(section.content.body || "Feature a sale, seasonal moment, delivery promise, coupon, or campaign right here.")}</p>
            <a className="mt-6 inline-flex min-h-11 items-center rounded-pill bg-yellow px-6 py-3 text-sm font-black text-blue" data-cms-edit-field="primaryCta" href={String(section.content.primaryCtaHref || "/shop")}>
              {String(section.content.primaryCtaLabel || "Shop now")}
            </a>
          </div>
          <div className="min-h-[260px] bg-cyan">
            {image ? <img alt={section.media.imageAlt || section.label} className="h-full w-full object-cover" data-cms-edit-field="image" src={image} /> : <PromoFallbackArt />}
          </div>
        </div>
        {items.length > 0 ? (
          <div className="mt-6">
            <EditableCardGrid items={items} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function EditableTrustSection({ section }: { section: CmsSection }) {
  const items = normalizedItems(section, [
    { id: "pickup", title: "Store pickup", body: "Fast pickup from Modern State locations." },
    { id: "delivery", title: "Local delivery", body: "Delivery options for eligible NYC orders." },
    { id: "support", title: "Real store help", body: "Call or visit for balloon and party guidance." }
  ]);

  return (
    <section className="bg-surface-muted py-12" data-cms-component="EditableTrustSection">
      <div className="container-shell">
        <SectionIntro section={section} />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {items.slice(0, 4).map((item, index) => (
            <article className="rounded-md border border-border bg-surface p-5 shadow-sm" key={item.id}>
              <span className={cn("grid h-11 w-11 place-items-center rounded-md text-sm font-black", index % 2 === 0 ? "bg-yellow text-blue" : "bg-cyan text-primary")}>{index + 1}</span>
              <h3 className="mt-4 font-display text-xl font-black">{String(item.title || item.label || "Store benefit")}</h3>
              {item.body ? <p className="mt-2 text-sm text-secondary">{String(item.body)}</p> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function EditableEditorialSection({ section }: { section: CmsSection }) {
  const image = section.media.image;
  const imageLeft = section.layout.imagePosition === "left";

  return (
    <section className="bg-surface py-16" data-cms-component="EditableEditorialSection">
      <div className={cn("container-shell grid gap-8 lg:grid-cols-2 lg:items-center", imageLeft && "lg:[&>*:first-child]:order-2")}>
        <div>
          <SectionIntro section={section} />
          <a className="mt-6 inline-flex min-h-10 items-center rounded-pill bg-blue px-5 py-2 text-sm font-black text-white" href={String(section.content.primaryCtaHref || "/about")}>
            {String(section.content.primaryCtaLabel || "Learn more")}
          </a>
        </div>
        {image ? <img alt={section.media.imageAlt || section.label} className="aspect-[4/3] w-full rounded-md object-cover shadow-soft" data-cms-edit-field="image" src={image} /> : <EditorialFallbackPanel />}
      </div>
    </section>
  );
}

function EditableTestimonialsSection({ section }: { section: CmsSection }) {
  const items = manualItems(section);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="bg-surface py-16" data-cms-component="EditableTestimonialsSection">
      <div className="container-shell">
        <SectionIntro section={section} />
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {items.slice(0, 3).map((item) => (
            <article className="rounded-md border border-border bg-surface p-6 shadow-sm" key={item.id}>
              <p aria-hidden="true" className="text-4xl font-black text-yellow">
                &ldquo;
              </p>
              <h3 className="font-display text-lg font-black">{String(item.title || item.label || "Customer note")}</h3>
              {item.body ? <p className="mt-3 text-sm text-secondary">{String(item.body)}</p> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function EditableNewsletterSection({ section }: { section: CmsSection }) {
  return (
    <section className="bg-surface py-14" data-cms-component="EditableNewsletterSection">
      <div className="container-shell">
        <div className="grid gap-6 rounded-md bg-cyan p-8 text-primary md:grid-cols-[1fr_auto] md:items-center">
          <div>
            {section.content.eyebrow ? <p className="text-sm font-black uppercase tracking-[0.14em] text-blue">{String(section.content.eyebrow)}</p> : null}
            <h2 className="mt-2 font-display text-3xl font-black">{String(section.content.title || "Get store updates")}</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-primary/75">{String(section.content.body || "Use this block for email signup, contact CTAs, coupons, or local store announcements.")}</p>
          </div>
          <form className="grid min-w-[280px] gap-2 sm:grid-cols-[1fr_auto]">
            <input className="min-h-11 rounded-pill border border-border bg-white px-4 text-sm" placeholder="Email address" type="email" />
            <button className="min-h-11 rounded-pill bg-blue px-5 text-sm font-black text-white" type="button">
              {String(section.content.primaryCtaLabel || "Sign up")}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function EditableGiftGuideSection({ section }: { section: CmsSection }) {
  const items = manualItems(section);
  const products = productsForSection(section, 4);

  return (
    <section className="bg-surface py-16" data-cms-component="EditableGiftGuideSection">
      <div className="container-shell">
        <SectionIntro section={section} />
        <div className="mt-8">
          {items.length > 0 ? <EditableCardGrid items={items} /> : <EditableProductGrid products={products} preset="editorial" />}
        </div>
      </div>
    </section>
  );
}

function EditableCategoriesSection({ section }: { section: CmsSection }) {
  const items = manualItems(section);

  return (
    <section className="bg-surface py-16" data-cms-component="EditableCategoriesSection">
      <div className="container-shell">
        <SectionIntro section={section} />
        <div className="mt-8">
          {items.length > 0 ? <EditableCardGrid items={items} /> : <DepartmentCardGrid />}
        </div>
      </div>
    </section>
  );
}

function EditableLocationsSection({ section }: { section: CmsSection }) {
  const items = manualItems(section);
  const locations = storeLocations.filter((location) => location.slug !== "warehouse");

  return (
    <section className="bg-surface-muted py-16" data-cms-component="EditableLocationsSection">
      <div className="container-shell">
        <SectionIntro section={section} />
        {items.length > 0 ? (
          <div className="mt-8">
            <EditableCardGrid items={items} />
          </div>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {locations.map((location) => (
              <article className="rounded-md border border-border bg-surface p-6" key={location.id}>
                <h3 className="font-display text-xl font-semibold">{location.name}</h3>
                <p className="mt-2 text-sm text-secondary">{location.address}</p>
                <p className="text-sm text-secondary">{location.locality}</p>
                <p className="mt-4 text-sm font-semibold">{location.phone}</p>
                <p className="text-sm text-secondary">{location.hours}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EditableFaqSection({ section }: { section: CmsSection }) {
  const items = Array.isArray(section.content.items) ? section.content.items : [];

  return (
    <section className="bg-surface py-16" data-cms-component="EditableFaqSection">
      <div className="container-shell max-w-4xl">
        <SectionIntro section={section} />
        <div className="mt-8 grid gap-3">
          {items.length > 0 ? (
            items.map((item) => (
              <details className="rounded-md border border-border bg-surface p-5" key={item.id}>
                <summary className="cursor-pointer font-semibold">{String(item.title || item.label || "Question")}</summary>
                {item.body ? <p className="mt-3 text-sm text-secondary">{String(item.body)}</p> : null}
              </details>
            ))
          ) : (
            <p className="text-secondary">Questions? Call or visit either store and our team will be happy to help.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function SectionIntro({ section }: { section: CmsSection }) {
  return (
    <div className="max-w-3xl">
      {section.content.eyebrow ? <p className="text-sm font-black uppercase tracking-[0.14em] text-green" data-cms-edit-field="eyebrow">{String(section.content.eyebrow)}</p> : null}
      <h2 className="mt-2 font-display text-3xl font-black md:text-4xl" data-cms-edit-field="title">{String(section.content.title || section.label)}</h2>
      {section.content.body ? <p className="mt-3 text-secondary" data-cms-edit-field="body">{String(section.content.body)}</p> : null}
    </div>
  );
}

function normalizedItems(section: CmsSection, fallback: SectionContentItem[]): SectionContentItem[] {
  return Array.isArray(section.content.items) && section.content.items.length > 0 ? section.content.items : fallback;
}

function manualItems(section: CmsSection) {
  return Array.isArray(section.content.items) ? section.content.items.filter((item) => item.title || item.label || item.body || item.image) : [];
}

function EditableCardGrid({ items }: { items: SectionContentItem[] }) {
  return (
    <div className="grid gap-5 md:grid-cols-3" data-cms-edit-field="items">
      {items.map((item) => {
        const card = (
          <article className="h-full rounded-md border border-border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-card" data-cms-edit-field="item" data-cms-item-id={item.id}>
            {item.image ? <img alt={String(item.imageAlt || item.title || item.label || "")} className="mb-4 aspect-[4/3] w-full rounded-md object-cover" data-cms-edit-field="itemImage" src={String(item.image)} /> : null}
            {item.badge ? <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-green" data-cms-edit-field="itemBadge">{String(item.badge)}</p> : null}
            <h3 className="font-display text-xl font-black text-primary">{String(item.title || item.label || "Card")}</h3>
            {item.body ? <p className="mt-2 text-sm text-secondary">{String(item.body)}</p> : null}
            {item.label && item.href ? <span className="mt-4 inline-flex min-h-9 items-center rounded-pill bg-blue px-4 py-2 text-xs font-black text-white">{String(item.label)}</span> : null}
          </article>
        );

        return item.href ? (
          <a className="block h-full" href={String(item.href)} key={item.id}>
            {card}
          </a>
        ) : (
          <div key={item.id}>{card}</div>
        );
      })}
    </div>
  );
}

function EditableProductGrid({ preset, products }: { preset: ProductGridPresetId; products: StorefrontProduct[] }) {
  return (
    <div data-cms-edit-field="linkedProducts">
      <ProductGrid cardVariant="premium" preset={preset} products={products} />
    </div>
  );
}

function productsForSection(section: CmsSection, fallbackLimit: number) {
  const manualIds = Array.isArray(section.dataSource.manualIds) ? section.dataSource.manualIds : [];

  if (manualIds.length > 0) {
    return getProductsBySlugs(manualIds);
  }

  if (section.dataSource.type === "department" && section.dataSource.id) {
    return getProductsByDepartment(section.dataSource.id, fallbackLimit);
  }

  return getVisibleProducts(fallbackLimit);
}

function productGridPresetForSection(section: CmsSection): ProductGridPresetId {
  if (section.variant === "compact" || section.variant === "editorial" || section.variant === "balloons") {
    return section.variant;
  }

  return "editorial";
}

function inventoryLabel(status: StorefrontProduct["inventoryStatus"]) {
  if (status === "out-of-stock") {
    return "Out of stock";
  }

  if (status === "limited") {
    return "Limited quantities available";
  }

  if (status === "special-order") {
    return "Special order";
  }

  return "In stock";
}

function HeroFallbackPanel() {
  const cards = [
    { title: "Toys", image: "/images/category-toys.svg", tone: "bg-yellow" },
    { title: "Party", image: "/images/category-party.svg", tone: "bg-cyan" },
    { title: "Balloons", image: "/images/category-balloons.svg", tone: "bg-green" },
    { title: "Gifts", image: "/images/category-gifts.svg", tone: "bg-red" }
  ];

  return (
    <div className="grid gap-3 rounded-md bg-surface-muted p-3 shadow-soft sm:grid-cols-2">
      {cards.map((card) => (
        <div className={cn("rounded-md p-4", card.tone)} key={card.title}>
          <img alt="" className="aspect-square w-full object-contain" src={card.image} />
          <p className="mt-2 text-center text-sm font-black text-primary">{card.title}</p>
        </div>
      ))}
    </div>
  );
}

function PromoFallbackArt() {
  return (
    <div className="grid h-full min-h-[260px] place-items-center p-6">
      <div className="grid w-full max-w-sm gap-3">
        <div className="rounded-md bg-white p-4 shadow-sm">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-blue">Balloon orders</p>
          <p className="mt-2 font-display text-3xl font-black text-primary">Pickup + local delivery</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {["bg-yellow", "bg-red", "bg-green"].map((tone) => (
            <span className={cn("aspect-square rounded-full shadow-sm", tone)} key={tone} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EditorialFallbackPanel() {
  return (
    <div className="grid aspect-[4/3] place-items-center rounded-md bg-surface-muted p-6 shadow-soft">
      <div className="grid w-full max-w-md grid-cols-2 gap-4">
        <img alt="" className="rounded-md bg-yellow p-5" src="/images/category-stationery.svg" />
        <img alt="" className="rounded-md bg-cyan p-5" src="/images/category-arts.svg" />
        <div className="col-span-2 rounded-md bg-white p-5">
          <p className="font-display text-2xl font-black text-primary">Your neighborhood Modern State</p>
          <p className="mt-2 text-sm text-secondary">Toys, celebrations, gifts, and friendly local service in one place.</p>
        </div>
      </div>
    </div>
  );
}
