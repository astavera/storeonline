"use client";

import { Check, ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { productAgeGroups, type FulfillmentMode, type ProductAgeGroup } from "@/features/catalog/product-catalog";
import { cn } from "@/lib/utils";

export type ShopCategoryFilter = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  productCount: number;
};

export type ShopBrandFilter = {
  id: string;
  name: string;
  slug: string;
  productCount: number;
};

type ShopFilterPanelProps = {
  ageCounts: Partial<Record<ProductAgeGroup, number>>;
  brands: ShopBrandFilter[];
  categories: ShopCategoryFilter[];
  fulfillmentCounts: Partial<Record<FulfillmentMode, number>>;
  selectedAge?: ProductAgeGroup;
  selectedBrand?: string;
  selectedCategory?: string;
  selectedFulfillment?: FulfillmentMode;
  selectedSort: string;
};

const fulfillmentOptions: Array<{ id: FulfillmentMode; label: string }> = [
  { id: "pickup", label: "Pickup" },
  { id: "local-delivery", label: "Local delivery" },
  { id: "shipping", label: "Shipping" }
];

export function ShopFilterPanel(props: ShopFilterPanelProps) {
  const activeCount = [props.selectedCategory, props.selectedBrand, props.selectedAge, props.selectedFulfillment].filter(Boolean).length;

  return (
    <aside className="lg:sticky lg:top-[120px] lg:self-start">
      <details className="border-y border-border bg-surface lg:hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-black [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><SlidersHorizontal aria-hidden="true" className="text-blue" size={18} />Filter:{activeCount ? <span className="rounded-full bg-blue px-2 py-0.5 text-xs text-white">{activeCount}</span> : null}</span>
          <ChevronDown aria-hidden="true" size={18} />
        </summary>
        <div className="border-t border-border px-5 pb-2"><FilterGroups {...props} /></div>
      </details>

      <div className="hidden bg-surface lg:block">
        <div className="flex min-h-12 items-center justify-between border-b border-border pb-3">
          <h2 className="font-black">Filter:</h2>
          {activeCount ? <span className="text-xs font-semibold text-blue">{activeCount} active</span> : null}
        </div>
        <FilterGroups {...props} />
      </div>
    </aside>
  );
}

function FilterGroups({ ageCounts, brands, categories, fulfillmentCounts, selectedAge, selectedBrand, selectedCategory, selectedFulfillment, selectedSort }: ShopFilterPanelProps) {
  const selectedCategoryRecord = categories.find((category) => category.slug === selectedCategory);
  const selectedBrandRecord = brands.find((brand) => brand.slug === selectedBrand);
  const selectedAgeRecord = productAgeGroups.find((age) => age.id === selectedAge);
  const selectedFulfillmentRecord = fulfillmentOptions.find((mode) => mode.id === selectedFulfillment);
  const shared = { age: selectedAge, brand: selectedBrand, category: selectedCategory, fulfillment: selectedFulfillment, sort: selectedSort };

  return (
    <>
      <FilterGroup label="Availability" selection={selectedFulfillmentRecord?.label}>
        <FilterLink active={!selectedFulfillment} href={shopHref({ ...shared, fulfillment: undefined })}>All availability</FilterLink>
        {fulfillmentOptions.map((mode) => <FilterLink active={selectedFulfillment === mode.id} count={fulfillmentCounts[mode.id]} href={shopHref({ ...shared, fulfillment: mode.id })} key={mode.id}>{mode.label}</FilterLink>)}
      </FilterGroup>
      <FilterGroup label="Product Category" selection={selectedCategoryRecord?.name}>
        <CategoryTree categories={categories} selectedCategory={selectedCategory} shared={shared} />
      </FilterGroup>
      <FilterGroup label="Brand" selection={selectedBrandRecord?.name}>
        <BrandList brands={brands} selectedBrand={selectedBrand} shared={shared} />
      </FilterGroup>
      <FilterGroup label="Age" selection={selectedAgeRecord?.shortLabel}>
        <FilterLink active={!selectedAge} href={shopHref({ ...shared, age: undefined })}>All ages</FilterLink>
        {productAgeGroups.map((age) => <FilterLink active={selectedAge === age.id} count={ageCounts[age.id]} href={shopHref({ ...shared, age: age.id })} key={age.id}>{age.shortLabel}</FilterLink>)}
      </FilterGroup>
      <FilterGroup label="Sort by" selection={selectedSort === "price-low" ? "Low to high" : selectedSort === "price-high" ? "High to low" : undefined}>
        <FilterLink active={selectedSort === "featured"} href={shopHref({ ...shared, sort: "featured" })}>Featured</FilterLink>
        <FilterLink active={selectedSort === "price-low"} href={shopHref({ ...shared, sort: "price-low" })}>Low to high</FilterLink>
        <FilterLink active={selectedSort === "price-high"} href={shopHref({ ...shared, sort: "price-high" })}>High to low</FilterLink>
      </FilterGroup>
    </>
  );
}

function CategoryTree({ categories, selectedCategory, shared }: { categories: ShopCategoryFilter[]; selectedCategory?: string; shared: ShopHrefInput }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const roots = useMemo(() => categories.filter((category) => !category.parentId).filter((root) => !normalizedQuery || root.name.toLowerCase().includes(normalizedQuery) || categories.some((category) => category.parentId === root.id && category.name.toLowerCase().includes(normalizedQuery))), [categories, normalizedQuery]);

  return (
    <div className="grid gap-2">
      <label className="flex min-h-10 items-center gap-2 border-b border-border focus-within:border-primary"><Search aria-hidden="true" className="text-secondary" size={15} /><span className="sr-only">Search categories</span><input className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Search categories" type="search" value={query} /></label>
      <FilterLink active={!selectedCategory} href={shopHref({ ...shared, category: undefined })}>All products</FilterLink>
      <div className="grid">
        {roots.map((root) => {
          const children = categories.filter((category) => category.parentId === root.id).filter((category) => !normalizedQuery || category.name.toLowerCase().includes(normalizedQuery));
          const rootActive = selectedCategory === root.slug;
          if (!children.length) return <FilterLink active={rootActive} count={root.productCount} href={shopHref({ ...shared, category: root.slug })} key={root.id}>{root.name}</FilterLink>;
          const selectedInBranch = rootActive || children.some((category) => category.slug === selectedCategory);
          return (
            <details className="group/category" key={root.id} open={normalizedQuery || selectedInBranch ? true : undefined}>
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden"><span className={selectedInBranch ? "text-blue" : "text-primary"}>{root.name}</span><span className="flex items-center gap-2 text-xs text-secondary">({root.productCount.toLocaleString()})<ChevronDown className="transition-transform group-open/category:rotate-180" size={14} /></span></summary>
              <div className="grid border-l border-border pb-2 pl-3">
                <FilterLink active={rootActive} count={root.productCount} href={shopHref({ ...shared, category: root.slug })}>All {root.name}</FilterLink>
                {children.map((category) => <FilterLink active={selectedCategory === category.slug} count={category.productCount} href={shopHref({ ...shared, category: category.slug })} key={category.id}>{category.name}</FilterLink>)}
              </div>
            </details>
          );
        })}
        {roots.length === 0 ? <p className="rounded-md border border-dashed border-border p-3 text-sm text-secondary">No categories found.</p> : null}
      </div>
    </div>
  );
}

function BrandList({ brands, selectedBrand, shared }: { brands: ShopBrandFilter[]; selectedBrand?: string; shared: ShopHrefInput }) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = brands.filter((brand) => brand.productCount > 0 && (!normalizedQuery || brand.name.toLowerCase().includes(normalizedQuery)));
  const visibleBrands = normalizedQuery || showAll ? matches : matches.slice(0, 12);

  return (
    <div className="grid gap-2">
      <label className="flex min-h-10 items-center gap-2 border-b border-border focus-within:border-primary"><Search aria-hidden="true" className="text-secondary" size={15} /><span className="sr-only">Search brands</span><input className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Search brands" type="search" value={query} /></label>
      <FilterLink active={!selectedBrand} href={shopHref({ ...shared, brand: undefined })}>All brands</FilterLink>
      {visibleBrands.map((brand) => <FilterLink active={selectedBrand === brand.slug} count={brand.productCount} href={shopHref({ ...shared, brand: brand.slug })} key={brand.id}>{brand.name}</FilterLink>)}
      {!normalizedQuery && matches.length > 12 ? <button className="py-2 text-left text-sm font-semibold text-blue hover:underline" onClick={() => setShowAll((current) => !current)} type="button">{showAll ? "Show fewer" : `Show all ${matches.length}`}</button> : null}
      {matches.length === 0 ? <p className="py-3 text-sm text-secondary">No brands found.</p> : null}
    </div>
  );
}

function FilterGroup({ children, label, selection }: { children: ReactNode; label: string; selection?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details className="group/filter border-b border-border last:border-b-0" onToggle={(event) => setIsOpen(event.currentTarget.open)} open={isOpen}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-inset [&::-webkit-details-marker]:hidden"><span className={selection ? "underline decoration-blue underline-offset-4" : ""}>{label}</span><span className="flex min-w-0 items-center gap-2"><span className="max-w-24 truncate text-xs font-semibold text-blue">{selection}</span><ChevronDown aria-hidden="true" className="transition-transform group-open/filter:rotate-180" size={15} /></span></summary>
      <div className="grid pb-5 pt-1">{children}</div>
    </details>
  );
}

function FilterLink({ active, children, count, href }: { active: boolean; children: ReactNode; count?: number; href: string }) {
  return <Link aria-current={active ? "true" : undefined} className={cn("flex min-h-9 items-center justify-between gap-3 py-2 text-sm", active ? "font-semibold text-primary" : "text-primary hover:text-blue")} href={href}><span className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className={cn("grid h-4 w-4 shrink-0 place-items-center border", active ? "border-blue bg-blue text-white" : "border-secondary/60 bg-surface")}>{active ? <Check size={12} strokeWidth={3} /> : null}</span><span className="truncate">{children}</span></span>{count !== undefined ? <span className="shrink-0 text-xs text-secondary">({count.toLocaleString()})</span> : null}</Link>;
}

type ShopHrefInput = {
  age?: ProductAgeGroup;
  brand?: string;
  category?: string;
  fulfillment?: FulfillmentMode;
  sort?: string;
};

function shopHref(input: ShopHrefInput) {
  const params = new URLSearchParams();
  if (input.category) params.set("department", input.category);
  if (input.brand) params.set("brand", input.brand);
  if (input.age) params.set("age", input.age);
  if (input.fulfillment) params.set("fulfillment", input.fulfillment);
  if (input.sort && input.sort !== "featured") params.set("sort", input.sort);
  const query = params.toString();
  return query ? `/shop?${query}` : "/shop";
}
