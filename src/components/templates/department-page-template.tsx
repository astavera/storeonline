/*
STORE AREA: Departments
SECTION: Department Template
SECTION ID: {department}.hero, {department}.product-grid
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Partially
WHAT THIS CONTROLS: Department hero, specialty section, and product grid rendering.
SAFE TO EDIT: Presentational layout, section variants, and display composition.
DO NOT EDIT HERE: Square reporting categories, prices, inventory, or fulfillment eligibility.
RELATED FILES: src/config/departments.config.ts, src/config/store-section-registry.ts
BUSINESS LOGIC FILES: src/features/departments/services/department-service.ts, src/features/catalog/services/product-display-service.ts
*/

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { ProductGrid } from "@/components/commerce/product-grid";
import { ButtonLink } from "@/components/ui/button";
import { getDepartmentBySlug } from "@/config/departments.config";
import { DepartmentLandingPage, type DepartmentLandingSearchParams } from "@/features/departments/components/department-landing-page";
import { filterWebsiteCatalogProducts } from "@/features/catalog/services/website-merchandising-service";
import type { CmsPageDocument } from "@/lib/cms";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";
import { readDepartmentBestSellers } from "@/server/commerce/best-seller-store";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";
import { buildStorefrontMetadata } from "@/lib/seo/storefront-seo";
import { SectionFrame } from "../sections/section-frame";

const sectionPrefixBySlug: Record<string, string> = {
  "arts-and-crafts": "arts-crafts"
};

function sectionPrefix(slug: string) {
  return sectionPrefixBySlug[slug] ?? slug;
}

export async function DepartmentPageTemplate({ slug, searchParams }: { slug: string; searchParams?: DepartmentLandingSearchParams }) {
  const squareCatalog = await readResolvedSquareWebsiteCatalog();
  const resolvedCatalog = squareCatalog?.catalog ?? null;
  const websiteCategory = resolvedCatalog?.categories.find((category) => category.slug === slug);
  const products = resolvedCatalog && websiteCategory ? filterWebsiteCatalogProducts(resolvedCatalog, { categoryId: websiteCategory.id, surface: "shop" }) : [];
  const publishedDocument = await readLatestCmsDocument({ entityType: "department", entityId: slug, statuses: ["PUBLISHED"] });

  if (publishedDocument) {
    return <StorefrontCmsPage document={storefrontDepartmentDocument(publishedDocument, slug)} products={products} />;
  }

  const department = getDepartmentBySlug(slug);

  if (!department) {
    notFound();
  }

  if (slug === "toys" || slug === "party-supplies") {
    const bestSellers = await readDepartmentBestSellers(slug);
    const productByVariationId = new Map((resolvedCatalog?.products ?? []).map((product) => [product.squareVariationId, product]));
    const bestSellerProducts = bestSellers.variationIds
      .map((variationId) => productByVariationId.get(variationId))
      .filter((product): product is NonNullable<typeof product> => Boolean(product));

    return (
      <DepartmentLandingPage
        bestSellerProducts={bestSellerProducts}
        bestSellerSource={bestSellers.source}
        catalog={resolvedCatalog}
        catalogAvailable={Boolean(squareCatalog)}
        department={department}
        searchParams={searchParams}
      />
    );
  }

  const prefix = sectionPrefix(department.slug);
  const gridId = department.slug === "greeting-cards" ? "greeting-cards.occasion-grid" : `${prefix}.product-grid`;

  return (
    <main>
      <SectionFrame
        area={department.title_en}
        backgroundImage={department.hero_image_url}
        className="flex min-h-[420px] items-end bg-cover bg-center text-white"
        component="DepartmentHeroSection"
        sectionId={`${prefix}.hero`}
        variant={department.layout_preset}
      >
        <div className="container-shell pb-12 pt-28">
          <span className="mb-4 block h-1 w-12 rounded-pill" style={{ backgroundColor: `var(${department.accent_color_token})` }} />
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight md:text-5xl">{department.hero_title_en}</h1>
          <p className="mt-4 max-w-2xl text-white/88">{department.hero_subtitle_en}</p>
          <ButtonLink className="mt-7" href="/shop">
            Browse products
          </ButtonLink>
        </div>
      </SectionFrame>

      {department.slug === "party-supplies" ? (
        <SectionFrame area="Party Supplies" className="py-14" component="PartyEventTypesSection" sectionId="party-supplies.event-types" variant="category-grid">
          <div className="container-shell">
            <h2 className="font-display text-3xl font-semibold">Plan by occasion</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              {["Birthdays", "Graduations", "Showers", "Weddings"].map((event) => (
                <div className="surface-card p-5" key={event}>
                  <p className="font-semibold">{event}</p>
                  <p className="mt-2 text-sm text-secondary">Theme, table, decor, wrap, and balloon-friendly picks.</p>
                </div>
              ))}
            </div>
          </div>
        </SectionFrame>
      ) : null}

      <SectionFrame area={department.title_en} className="bg-surface py-16" component="DepartmentProductGridSection" sectionId={gridId} variant={department.product_grid_preset}>
        <div className="container-shell">
          <div className="mb-8 max-w-2xl">
            <h2 className="font-display text-3xl font-semibold">{department.title_en}</h2>
            <p className="mt-3 text-secondary">{department.description_en}</p>
          </div>
          <ProductGrid cardVariant={department.product_card_variant} preset={department.product_grid_preset} products={products} />
        </div>
      </SectionFrame>
    </main>
  );
}

function storefrontDepartmentDocument(document: CmsPageDocument, slug: string): CmsPageDocument {
  if (slug !== "toys" && slug !== "party-supplies") return document;

  if (slug === "toys") {
    return {
      ...document,
      sections: document.sections.filter((section) => String(section.type) !== "hero" && String(section.type) !== "featuredCategories")
    };
  }

  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== `${slug}.hero` && String(section.type) !== "hero") return section;
      return { ...section, variant: "image-only" };
    })
  };
}

export async function getDepartmentPageMetadata(slug: string): Promise<Metadata> {
  const department = getDepartmentBySlug(slug);

  if (!department) {
    return buildStorefrontMetadata({
      canonicalPath: `/${slug}`,
      description: "The requested Modern State department could not be found.",
      indexable: false,
      title: "Department not found | Modern State - State News NYC"
    });
  }

  const publishedDocument = await readLatestCmsDocument({ entityType: "department", entityId: slug, statuses: ["PUBLISHED"] });
  const seo = publishedDocument?.seo;

  return buildStorefrontMetadata({
    canonicalPath: seo?.canonicalUrl || `/${slug}`,
    description: seo?.description || department.seo_description_en,
    image: seo?.ogImage || department.hero_image_url,
    indexable: seo?.indexable ?? true,
    title: seo?.title || department.seo_title_en
  });
}
