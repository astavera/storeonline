/**
 * Renders Party Supplies discovery facets backed by published website categories.
 */

import Image from "next/image";
import Link from "next/link";
import { isApprovedPersistentPartyAsset, partyCategoriesByKind } from "@/features/catalog/services/party-merchandising-service";
import type { WebsiteCategory } from "@/features/catalog/services/website-merchandising-service";

type PartySuppliesDiscoveryProps = {
  basePath: string;
  categories: WebsiteCategory[];
  currentParams?: Record<string, string | string[] | undefined>;
  productCountByCategory: Record<string, number>;
  selectedColors: string[];
  selectedProductTypes: string[];
  selectedThemes: string[];
};

export function PartySuppliesDiscovery({ basePath, categories, currentParams, productCountByCategory, selectedColors, selectedProductTypes, selectedThemes }: PartySuppliesDiscoveryProps) {
  const solidColors = partyCategoriesByKind(categories, "party-solid-color").filter((category) => category.visible && category.swatchColor && (productCountByCategory[category.id] ?? 0) > 0);
  const themes = partyCategoriesByKind(categories, "party-theme").filter((category) => category.visible && isApprovedPersistentPartyAsset(category.imageUrl) && (productCountByCategory[category.id] ?? 0) > 0);
  const productTypes = partyCategoriesByKind(categories, "party-product-type").filter((category) => category.visible && (productCountByCategory[category.id] ?? 0) > 0);

  if (solidColors.length === 0 && themes.length === 0 && productTypes.length === 0) return null;

  return (
    <div className="bg-surface">
      {solidColors.length > 0 ? <section aria-labelledby="party-solid-colors-title" className="border-b border-border py-10 sm:py-14" id="shop-solid-colors">
        <div className="container-shell">
          <h2 className="font-display text-2xl font-black tracking-tight text-primary sm:text-3xl" id="party-solid-colors-title">Shop solid colors</h2>
          <div className="mt-7 grid grid-cols-4 gap-x-3 gap-y-6 sm:grid-cols-6 lg:grid-cols-10">
            {solidColors.map((category) => {
              const selected = selectedColors.includes(category.slug);
              return <Link aria-pressed={selected} className="group text-center" href={toggleFacetHref(basePath, currentParams, "color", selectedColors, category.slug)} key={category.id} role="button">
                <span aria-hidden="true" className={`mx-auto block aspect-square w-full max-w-16 rounded-full border border-black/10 transition group-hover:scale-105 ${selected ? "ring-4 ring-blue ring-offset-4 ring-offset-surface" : ""}`} style={{ backgroundColor: category.swatchColor }} />
                <span className={`mt-3 block text-xs font-bold sm:text-sm ${selected ? "text-blue" : "text-primary"}`}>{category.name}</span>
              </Link>;
            })}
          </div>
        </div>
      </section> : null}

      {themes.length > 0 ? <section aria-labelledby="party-themes-title" className="border-b border-border py-10 sm:py-14" id="shop-by-theme">
        <div className="container-shell">
          <h2 className="font-display text-2xl font-black tracking-tight text-primary sm:text-3xl" id="party-themes-title">Shop by theme</h2>
          <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {themes.map((category) => {
              const selected = selectedThemes.includes(category.slug);
              return <Link aria-pressed={selected} className="group min-w-0" href={toggleFacetHref(basePath, currentParams, "theme", selectedThemes, category.slug)} key={category.id} role="button">
                <span className={`relative block aspect-[4/3] overflow-hidden rounded-md border bg-surface-muted ${selected ? "border-blue ring-2 ring-blue/20" : "border-border"}`}>
                  <Image alt={category.imageAlt || `${category.name} party theme`} className="object-contain transition duration-300 group-hover:scale-[1.03]" fill sizes="(min-width: 1024px) 16vw, (min-width: 640px) 31vw, 48vw" src={category.imageUrl} />
                </span>
                <span className={`mt-3 block text-sm font-bold ${selected ? "text-blue" : "text-primary"}`}>{category.name}</span>
              </Link>;
            })}
          </div>
        </div>
      </section> : null}

      {productTypes.length > 0 ? <section aria-labelledby="party-product-types-title" className="border-b border-border py-8 sm:py-10" id="shop-by-product-type">
        <div className="container-shell">
          <h2 className="font-display text-xl font-black tracking-tight text-primary sm:text-2xl" id="party-product-types-title">Shop by product type</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {productTypes.map((category) => {
              const selected = selectedProductTypes.includes(category.slug);
              return <Link aria-pressed={selected} className={`inline-flex min-h-10 items-center rounded-pill border px-4 text-sm font-bold transition ${selected ? "border-blue bg-blue text-white" : "border-border bg-surface text-primary hover:border-blue hover:text-blue"}`} href={toggleFacetHref(basePath, currentParams, "type", selectedProductTypes, category.slug)} key={category.id} role="button">{category.name}</Link>;
            })}
          </div>
        </div>
      </section> : null}
    </div>
  );
}

function toggleFacetHref(basePath: string, currentParams: PartySuppliesDiscoveryProps["currentParams"], key: "color" | "theme" | "type", selectedValues: string[], value: string) {
  const nextValues = selectedValues.includes(value) ? selectedValues.filter((current) => current !== value) : [...selectedValues, value];
  const params = new URLSearchParams();
  for (const [paramKey, paramValue] of Object.entries(currentParams ?? {})) {
    if (paramKey === key || paramKey === "page" || paramValue === undefined) continue;
    for (const currentValue of Array.isArray(paramValue) ? paramValue : [paramValue]) params.append(paramKey, currentValue);
  }
  for (const nextValue of nextValues) params.append(key, nextValue);
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ""}#catalog`;
}
