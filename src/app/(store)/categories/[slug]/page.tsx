import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/commerce/product-grid";
import { SectionFrame } from "@/components/sections/section-frame";
import { filterWebsiteCatalogProducts } from "@/features/catalog/services/website-merchandising-service";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await readWebsiteCatalog();
  const category = catalog?.categories.find((current) => current.slug === slug);

  return category
    ? { title: category.name, description: category.description || `Shop ${category.name} at Modern State.` }
    : { title: "Category not found" };
}

export default async function WebsiteCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalog = await readWebsiteCatalog();
  const category = catalog?.categories.find((current) => current.slug === slug);

  if (!catalog || !category) {
    notFound();
  }

  const products = filterWebsiteCatalogProducts(catalog, { categoryId: category.id, surface: "category-pages" });

  return (
    <main>
      <SectionFrame area="Categories" className="bg-surface-muted py-14" component="WebsiteCategoryHeroSection" sectionId={`categories.${category.slug}.hero`} variant="category-hero">
        <div className="container-shell">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-blue">Website category</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-black leading-tight md:text-5xl">{category.name}</h1>
          {category.description ? <p className="mt-4 max-w-2xl text-lg text-secondary">{category.description}</p> : null}
        </div>
      </SectionFrame>
      <SectionFrame area="Categories" className="bg-surface py-14" component="WebsiteCategoryProductGridSection" sectionId={`categories.${category.slug}.products`} variant="product-grid">
        <div className="container-shell">
          <p className="mb-6 text-sm font-semibold text-secondary">{products.length} {products.length === 1 ? "product" : "products"}</p>
          <ProductGrid products={products} />
        </div>
      </SectionFrame>
    </main>
  );
}

async function readWebsiteCatalog() {
  return (await readResolvedSquareWebsiteCatalog())?.catalog ?? null;
}
