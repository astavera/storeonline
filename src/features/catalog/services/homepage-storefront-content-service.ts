import type { HomepageSectionConfig, HomepageSectionItem } from "@/config/homepage.config";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import { filterWebsiteCatalogProducts } from "@/features/catalog/services/website-merchandising-service";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";

export type HomepageStorefrontContent = {
  featuredBrandItems: HomepageSectionItem[];
  products: StorefrontProduct[];
};

export async function resolveHomepageStorefrontContent(): Promise<HomepageStorefrontContent> {
  const squareCatalog = await readResolvedSquareWebsiteCatalog();
  const catalog = squareCatalog?.catalog ?? null;

  if (!catalog) {
    return { featuredBrandItems: [], products: [] };
  }

  const products = filterWebsiteCatalogProducts(catalog, { surface: "homepage" });
  const shopProductIds = new Set(catalog.productVariationIdsBySurface.shop ?? []);
  const featuredBrandItems = catalog.brands
    .filter((brand) => brand.featuredOnHomepage && brand.logoUrl)
    .slice(0, 4)
    .map((brand) => ({
      id: brand.id,
      label: "Brand",
      title: brand.name,
      body: `${(catalog.productVariationIdsByBrand[brand.id] ?? []).filter((variationId) => shopProductIds.has(variationId)).length} products`,
      href: `/shop?brand=${encodeURIComponent(brand.slug)}`,
      image: brand.logoUrl,
      imageAlt: brand.imageAlt || `${brand.name} logo`
    }));

  return { featuredBrandItems, products };
}

export function applyHomepageStorefrontBrands(sections: HomepageSectionConfig[], featuredBrandItems: HomepageSectionItem[]) {
  if (featuredBrandItems.length === 0) {
    return sections;
  }

  return sections.map((section) => (section.sectionId === "home.hero" ? { ...section, items: featuredBrandItems } : section));
}
