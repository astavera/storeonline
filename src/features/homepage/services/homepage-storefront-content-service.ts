/**
 * Resolves catalog products and editor link options needed by the homepage.
 */

import type { HomepageItemLinkOption } from "@/features/homepage/config/homepage.config";
import { storefrontEditablePages, type StorefrontEditablePage } from "@/config/storefront-pages.config";
import { storefrontProducts, type StorefrontProduct } from "@/features/catalog/product-catalog";
import { filterWebsiteCatalogProducts, listVisibleWebsiteCategoriesWithImages, slugifyWebsiteCategory, websiteCategoryLabel, type WebsiteBrand, type WebsiteCategory } from "@/features/catalog/services/website-merchandising-service";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";

export type HomepageStorefrontContent = {
  categories: WebsiteCategory[];
  itemLinkOptions: HomepageItemLinkOption[];
  products: StorefrontProduct[];
  trendingProducts: StorefrontProduct[];
};

export async function resolveHomepageStorefrontContent(): Promise<HomepageStorefrontContent> {
  let squareCatalog: Awaited<ReturnType<typeof readResolvedSquareWebsiteCatalog>>;
  try {
    squareCatalog = await readResolvedSquareWebsiteCatalog();
  } catch {
    console.warn("[homepage-cms] Catalog destinations are temporarily unavailable.");
    return unavailableHomepageStorefrontContent();
  }
  const catalog = squareCatalog?.catalog ?? null;

  if (!catalog) {
    return unavailableHomepageStorefrontContent();
  }

  const homepageProducts = filterWebsiteCatalogProducts(catalog, {
    surface: "homepage"
  });
  const shopProducts = filterWebsiteCatalogProducts(catalog, { surface: "shop" });
  const products = Array.from(
    new Map(
      [...homepageProducts, ...shopProducts].map((product) => [
        product.squareVariationId,
        product
      ])
    ).values()
  );
  const trendingProducts = filterWebsiteCatalogProducts(catalog, {
    surface: "new-and-trending"
  }).filter((product) => product.websiteSurfaces?.includes("shop"));

  return {
    categories: listVisibleWebsiteCategoriesWithImages(catalog.categories, {
      parentSlug: "toys"
    }),
    itemLinkOptions: createHomepageItemLinkOptions({ brands: catalog.brands, categories: catalog.categories, products: shopProducts }),
    products,
    trendingProducts
  };
}

export function createHomepageItemLinkOptions(input: { brands: WebsiteBrand[]; categories: WebsiteCategory[]; products: StorefrontProduct[]; pages?: StorefrontEditablePage[] }): HomepageItemLinkOption[] {
  const pageOptions: HomepageItemLinkOption[] = (input.pages ?? storefrontEditablePages)
    .filter((page) => page.group !== "Products")
    .map((page) => ({
      type: "page",
      value: page.route,
      label: page.title,
      href: page.route,
      title: page.title,
      body: page.description
    }));
  const brandOptions: HomepageItemLinkOption[] = input.brands.map((brand) => ({
    type: "brand",
    value: brand.slug,
    label: brand.name,
    href: `/shop?brand=${encodeURIComponent(brand.slug)}`,
    title: brand.name,
    body: brand.description,
    image: brand.logoUrl,
    imageAlt: brand.imageAlt || `${brand.name} logo`
  }));
  const categoryOptions: HomepageItemLinkOption[] = input.categories.map((category) => ({
    type: "category",
    value: category.slug,
    label: websiteCategoryLabel(category, input.categories),
    href: `/shop?department=${encodeURIComponent(category.slug)}`,
    title: category.name,
    body: category.description,
    image: category.imageUrl,
    imageAlt: category.imageAlt || `${category.name} category`
  }));
  const productOptions: HomepageItemLinkOption[] = input.products.map((product) => ({
    type: "product",
    value: product.slug,
    label: product.name,
    href: `/products/${product.slug}`,
    title: product.name,
    body: product.shortDescription,
    image: product.imageUrl,
    imageAlt: product.name,
    productSlug: product.slug,
    squareVariationId: product.squareVariationId
  }));

  return [...pageOptions, ...brandOptions, ...categoryOptions, ...productOptions];
}

function fallbackCategories(): WebsiteCategory[] {
  return Array.from(new Set(storefrontProducts.map((product) => product.department))).map((name, index) => ({
    id: `fallback-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    slug: slugifyWebsiteCategory(name),
    description: "",
    parentId: null,
    imageUrl: "",
    imageAlt: "",
    visible: true,
    sortOrder: index
  }));
}

function fallbackHomepageStorefrontContent(): HomepageStorefrontContent {
  return {
    categories: fallbackCategories(),
    itemLinkOptions: createHomepageItemLinkOptions({ brands: [], categories: fallbackCategories(), products: storefrontProducts }),
    products: storefrontProducts,
    trendingProducts: []
  };
}

function unavailableHomepageStorefrontContent(): HomepageStorefrontContent {
  if (process.env.E2E_CATALOG_FIXTURE === "true") {
    return fallbackHomepageStorefrontContent();
  }

  return {
    categories: [],
    itemLinkOptions: createHomepageItemLinkOptions({ brands: [], categories: [], products: [] }),
    products: [],
    trendingProducts: []
  };
}
