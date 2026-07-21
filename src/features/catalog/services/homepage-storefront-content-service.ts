import type { HomepageItemLinkOption } from "@/config/homepage.config";
import { storefrontEditablePages, type StorefrontEditablePage } from "@/config/storefront-pages.config";
import { storefrontProducts, type StorefrontProduct } from "@/features/catalog/product-catalog";
import { filterWebsiteCatalogProducts, slugifyWebsiteCategory, websiteCategoryLabel, type WebsiteBrand, type WebsiteCategory } from "@/features/catalog/services/website-merchandising-service";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";

export type HomepageStorefrontContent = {
  itemLinkOptions: HomepageItemLinkOption[];
  products: StorefrontProduct[];
};

export async function resolveHomepageStorefrontContent(): Promise<HomepageStorefrontContent> {
  let squareCatalog: Awaited<ReturnType<typeof readResolvedSquareWebsiteCatalog>>;
  try {
    squareCatalog = await readResolvedSquareWebsiteCatalog();
  } catch {
    console.warn("[homepage-cms] Catalog destinations are temporarily unavailable; using safe local options.");
    return fallbackHomepageStorefrontContent();
  }
  const catalog = squareCatalog?.catalog ?? null;

  if (!catalog) {
    return fallbackHomepageStorefrontContent();
  }

  const products = filterWebsiteCatalogProducts(catalog, { surface: "homepage" });
  const shopProducts = filterWebsiteCatalogProducts(catalog, { surface: "shop" });

  return {
    itemLinkOptions: createHomepageItemLinkOptions({ brands: catalog.brands, categories: catalog.categories, products: shopProducts }),
    products
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
    body: category.description
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
    visible: true,
    sortOrder: index
  }));
}

function fallbackHomepageStorefrontContent(): HomepageStorefrontContent {
  return {
    itemLinkOptions: createHomepageItemLinkOptions({ brands: [], categories: fallbackCategories(), products: storefrontProducts }),
    products: storefrontProducts
  };
}
