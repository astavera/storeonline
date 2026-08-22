/**
 * Generates the public storefront sitemap for search engines.
 */

import type { MetadataRoute } from "next";
import { departments } from "@/config/departments.config";
import { holidays } from "@/config/holidays.config";
import { absoluteStorefrontUrl, storefrontStaticPaths } from "@/lib/seo/storefront-seo";
import { readResolvedSquareWebsiteCatalog } from "@/server/square/website-catalog-store";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = new Map<string, MetadataRoute.Sitemap[number]>();
  const add = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] = "weekly") => {
    paths.set(path, { url: absoluteStorefrontUrl(path), changeFrequency, priority });
  };

  for (const path of storefrontStaticPaths) add(path, path === "/" ? 1 : path === "/shop" ? 0.9 : 0.7);
  for (const department of departments.filter((department) => department.is_visible && ["toys", "party-supplies", "balloons"].includes(department.slug))) add(`/${department.slug}`, 0.8);
  for (const holiday of holidays.filter((holiday) => holiday.is_visible)) add(`/holidays/${holiday.slug}`, 0.7, "monthly");

  try {
    const resolvedCatalog = await readResolvedSquareWebsiteCatalog();
    for (const category of resolvedCatalog?.catalog.categories ?? []) add(`/categories/${category.slug}`, 0.7);
    for (const product of resolvedCatalog?.catalog.products ?? []) add(`/products/${product.slug}`, 0.6);
  } catch {
    // Static storefront routes remain discoverable while production data is unavailable.
  }

  return Array.from(paths.values());
}
