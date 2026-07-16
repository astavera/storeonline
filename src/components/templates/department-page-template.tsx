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

import { notFound } from "next/navigation";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { ProductGrid } from "@/components/commerce/product-grid";
import { ButtonLink } from "@/components/ui/button";
import { getDepartmentBySlug } from "@/config/departments.config";
import { filterWebsiteCatalogProducts } from "@/features/catalog/services/website-merchandising-service";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";
import { SectionFrame } from "../sections/section-frame";

const sectionPrefixBySlug: Record<string, string> = {
  "arts-and-crafts": "arts-crafts"
};

function sectionPrefix(slug: string) {
  return sectionPrefixBySlug[slug] ?? slug;
}

export async function DepartmentPageTemplate({ slug }: { slug: string }) {
  const squareCatalog = await readResolvedSquareWebsiteCatalog();
  const resolvedCatalog = squareCatalog?.catalog ?? null;
  const websiteCategory = resolvedCatalog?.categories.find((category) => category.slug === slug);
  const products = resolvedCatalog && websiteCategory ? filterWebsiteCatalogProducts(resolvedCatalog, { categoryId: websiteCategory.id, surface: "category-pages" }) : squareCatalog ? [] : undefined;
  const publishedDocument = squareCatalog ? null : await readLatestCmsDocument({ entityType: "department", entityId: slug, statuses: ["PUBLISHED"] });

  if (publishedDocument) {
    return <StorefrontCmsPage document={publishedDocument} />;
  }

  const department = getDepartmentBySlug(slug);

  if (!department) {
    notFound();
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
