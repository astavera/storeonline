/**
 * Renders the shop filter panel interface and its user interactions.
 */

"use client";

import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

export type ShopPriceFilter = {
  id: string;
  label: string;
  productCount: number;
};

type ShopFilterPanelProps = {
  ageCounts: Partial<Record<ProductAgeGroup, number>>;
  basePath?: string;
  brands: ShopBrandFilter[];
  categories: ShopCategoryFilter[];
  categoryParam?: "category" | "department";
  fulfillmentCounts: Partial<Record<FulfillmentMode, number>>;
  priceFilters?: ShopPriceFilter[];
  selectedAge?: ProductAgeGroup;
  selectedBrand?: string;
  selectedCategory?: string;
  selectedCollection?: string;
  selectedFulfillment?: FulfillmentMode;
  selectedPrice?: string;
  selectedSort: string;
};

const fulfillmentOptions: Array<{ id: FulfillmentMode; label: string }> = [
  { id: "pickup", label: "Pickup" },
  { id: "local-delivery", label: "Local delivery" },
  { id: "shipping", label: "Shipping" }
];

export function ShopFilterPanel(props: ShopFilterPanelProps) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const activeCount = [props.selectedCollection, props.selectedCategory, props.selectedBrand, props.selectedAge, props.selectedFulfillment, props.selectedPrice].filter(Boolean).length;
  const clearFiltersHref = shopHref({ basePath: props.basePath, categoryParam: props.categoryParam, sort: props.selectedSort });

  useEffect(() => {
    if (!mobileFiltersOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileCloseButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileFiltersOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileFiltersOpen]);

  return (
    <aside className="lg:sticky lg:top-[120px] lg:self-start">
      <div className="lg:hidden">
        <button aria-controls="mobile-shop-filters" aria-expanded={mobileFiltersOpen} className="flex min-h-14 w-full items-center justify-between gap-3 border-y border-border bg-surface px-5 py-4 font-black" onClick={() => setMobileFiltersOpen(true)} type="button">
          <span className="flex items-center gap-2"><SlidersHorizontal aria-hidden="true" className="text-blue" size={18} />Filter:{activeCount ? <span className="rounded-full bg-blue px-2 py-0.5 text-xs text-white">{activeCount}</span> : null}</span>
          <ChevronDown aria-hidden="true" size={18} />
        </button>

        <button aria-label="Close filters" className={cn("fixed inset-0 z-[100] bg-primary/35 transition-opacity duration-300", mobileFiltersOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")} onClick={() => setMobileFiltersOpen(false)} tabIndex={mobileFiltersOpen ? 0 : -1} type="button" />

        <div
          aria-hidden={!mobileFiltersOpen}
          aria-label="Product filters"
          aria-modal="true"
          className={cn("fixed inset-y-0 left-0 z-[110] flex w-[min(88vw,360px)] flex-col bg-surface shadow-[12px_0_30px_rgba(15,23,42,0.2)] transition-transform duration-300 ease-out", mobileFiltersOpen ? "translate-x-0" : "pointer-events-none -translate-x-full")}
          id="mobile-shop-filters"
          inert={!mobileFiltersOpen}
          role="dialog"
        >
          <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-border px-5">
            <div className="flex items-center gap-3">
              <h2 className="font-black">Filters</h2>
              {activeCount ? <span className="text-xs font-semibold text-blue">{activeCount} active</span> : null}
            </div>
            <button aria-label="Close filters" className="grid h-10 w-10 place-items-center rounded-full text-primary transition hover:bg-surface-muted hover:text-blue" onClick={() => setMobileFiltersOpen(false)} ref={mobileCloseButtonRef} type="button"><X aria-hidden="true" size={20} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8" onClickCapture={(event) => {
            if ((event.target as HTMLElement).closest("a")) setMobileFiltersOpen(false);
          }}>
            {activeCount ? <Link className="mt-4 inline-flex text-xs font-semibold text-secondary underline decoration-border underline-offset-4 transition hover:text-blue" href={clearFiltersHref}>Clear filters</Link> : null}
            <FilterGroups {...props} />
          </div>
        </div>
      </div>

      <div className="hidden bg-surface lg:block">
        <div className="flex min-h-12 items-center justify-between border-b border-border pb-3">
          <div className="flex items-baseline gap-3">
            <h2 className="font-black">Filter:</h2>
            {activeCount ? <Link className="text-xs font-semibold text-secondary underline decoration-border underline-offset-4 transition hover:text-blue" href={clearFiltersHref}>Clear filters</Link> : null}
          </div>
          {activeCount ? <span className="text-xs font-semibold text-blue">{activeCount} active</span> : null}
        </div>
        <FilterGroups {...props} />
      </div>
    </aside>
  );
}

function FilterGroups({ ageCounts, basePath, brands, categories, categoryParam, fulfillmentCounts, priceFilters = [], selectedAge, selectedBrand, selectedCategory, selectedCollection, selectedFulfillment, selectedPrice, selectedSort }: ShopFilterPanelProps) {
  const selectedCategoryRecord = categories.find((category) => category.slug === selectedCategory);
  const selectedBrandRecord = brands.find((brand) => brand.slug === selectedBrand);
  const selectedAgeRecord = productAgeGroups.find((age) => age.id === selectedAge);
  const selectedFulfillmentRecord = fulfillmentOptions.find((mode) => mode.id === selectedFulfillment);
  const selectedPriceRecord = priceFilters.find((price) => price.id === selectedPrice);
  const shared = { age: selectedAge, basePath, brand: selectedBrand, category: selectedCategory, categoryParam, collection: selectedCollection, fulfillment: selectedFulfillment, price: selectedPrice, sort: selectedSort };

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
      {priceFilters.length > 0 ? (
        <FilterGroup label="Price" selection={selectedPriceRecord?.label}>
          <FilterLink active={!selectedPrice} href={shopHref({ ...shared, price: undefined })}>All prices</FilterLink>
          {priceFilters.map((price) => <FilterLink active={selectedPrice === price.id} count={price.productCount} href={shopHref({ ...shared, price: price.id })} key={price.id}>{price.label}</FilterLink>)}
        </FilterGroup>
      ) : null}
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
  const { categoryById, childrenByParentId } = useMemo(() => {
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const childrenMap = new Map<string | null, ShopCategoryFilter[]>();
    for (const category of categories) {
      const children = childrenMap.get(category.parentId) ?? [];
      children.push(category);
      childrenMap.set(category.parentId, children);
    }
    return { categoryById: categoryMap, childrenByParentId: childrenMap };
  }, [categories]);
  const visibleCategoryIds = useMemo(() => {
    if (!normalizedQuery) return null;
    const visibleIds = new Set<string>();
    for (const category of categories) {
      if (!category.name.toLowerCase().includes(normalizedQuery)) continue;
      let current: ShopCategoryFilter | undefined = category;
      const visited = new Set<string>();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        visibleIds.add(current.id);
        current = current.parentId ? categoryById.get(current.parentId) : undefined;
      }
    }
    return visibleIds;
  }, [categories, categoryById, normalizedQuery]);
  const selectedPathIds = useMemo(() => {
    const pathIds = new Set<string>();
    let current = categories.find((category) => category.slug === selectedCategory);
    while (current && !pathIds.has(current.id)) {
      pathIds.add(current.id);
      current = current.parentId ? categoryById.get(current.parentId) : undefined;
    }
    return pathIds;
  }, [categories, categoryById, selectedCategory]);
  const roots = (childrenByParentId.get(null) ?? []).filter((root) => !visibleCategoryIds || visibleCategoryIds.has(root.id));

  return (
    <div className="grid gap-2">
      <label className="flex min-h-10 items-center gap-2 border-b border-border focus-within:border-border"><Search aria-hidden="true" className="text-secondary" size={15} /><span className="sr-only">Search categories</span><input className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Search categories" type="search" value={query} /></label>
      <FilterLink active={!selectedCategory} categoryDepth={0} href={shopHref({ ...shared, category: undefined })}>All products</FilterLink>
      <div className="grid gap-1">
        {roots.map((root) => <CategoryBranch category={root} childrenByParentId={childrenByParentId} depth={0} key={root.id} normalizedQuery={normalizedQuery} selectedCategory={selectedCategory} selectedPathIds={selectedPathIds} shared={shared} visibleCategoryIds={visibleCategoryIds} />)}
        {roots.length === 0 ? <p className="rounded-md border border-dashed border-border p-3 text-sm text-secondary">No categories found.</p> : null}
      </div>
    </div>
  );
}

function CategoryBranch({ category, childrenByParentId, depth, normalizedQuery, selectedCategory, selectedPathIds, shared, visibleCategoryIds }: {
  category: ShopCategoryFilter;
  childrenByParentId: Map<string | null, ShopCategoryFilter[]>;
  depth: number;
  normalizedQuery: string;
  selectedCategory?: string;
  selectedPathIds: Set<string>;
  shared: ShopHrefInput;
  visibleCategoryIds: Set<string> | null;
}) {
  const children = (childrenByParentId.get(category.id) ?? []).filter((child) => !visibleCategoryIds || visibleCategoryIds.has(child.id));
  const active = selectedCategory === category.slug;
  const selectedInBranch = selectedPathIds.has(category.id);
  return (
    <details className={cn("group/category", depth === 0 && "border-b border-border/70 pb-1 last:border-b-0")} open={normalizedQuery || selectedInBranch ? true : undefined}>
      <summary className={cn(
        "flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-inset [&::-webkit-details-marker]:hidden",
        depth === 0 && "min-h-11 text-sm font-black",
        depth === 1 && "min-h-9 text-[13px] font-bold",
        depth >= 2 && "min-h-8 text-xs font-medium",
        selectedInBranch && "bg-blue/5"
      )}>
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className={cn(
            "shrink-0 rounded-full",
            depth === 0 && "h-2 w-2 bg-primary",
            depth === 1 && "h-1.5 w-1.5 bg-blue/70",
            depth >= 2 && "h-1.5 w-1.5 border border-secondary/70"
          )} />
          <span className={cn("truncate", selectedInBranch ? "text-blue" : depth >= 2 ? "text-secondary" : "text-primary")}>{category.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[11px] font-medium text-secondary">
          ({category.productCount.toLocaleString()})
          <ChevronDown aria-hidden="true" className="transition-transform group-open/category:rotate-180" size={depth === 0 ? 14 : 12} />
        </span>
      </summary>
      <div className={cn(
        "ml-3 grid pb-2 pl-3",
        depth === 0 ? "border-l-2 border-blue/25" : "border-l border-border"
      )}>
        <FilterLink active={active} categoryDepth={depth + 1} categoryOverview count={category.productCount} href={shopHref({ ...shared, category: category.slug })}>All {category.name}</FilterLink>
        {children.map((child) => <CategoryBranch category={child} childrenByParentId={childrenByParentId} depth={depth + 1} key={child.id} normalizedQuery={normalizedQuery} selectedCategory={selectedCategory} selectedPathIds={selectedPathIds} shared={shared} visibleCategoryIds={visibleCategoryIds} />)}
      </div>
    </details>
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
      <label className="flex min-h-10 items-center gap-2 border-b border-border focus-within:border-border"><Search aria-hidden="true" className="text-secondary" size={15} /><span className="sr-only">Search brands</span><input className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Search brands" type="search" value={query} /></label>
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

function FilterLink({ active, categoryDepth, categoryOverview = false, children, count, href }: {
  active: boolean;
  categoryDepth?: number;
  categoryOverview?: boolean;
  children: ReactNode;
  count?: number;
  href: string;
}) {
  const isCategoryLink = categoryDepth !== undefined;

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-9 items-center justify-between gap-3 py-2 transition-colors",
        !isCategoryLink && "text-sm",
        categoryDepth === 0 && "rounded-md px-2 text-sm font-bold",
        categoryDepth === 1 && "rounded px-1 text-[13px]",
        categoryDepth !== undefined && categoryDepth >= 2 && "min-h-8 rounded px-1 py-1.5 text-xs text-secondary",
        categoryOverview && "italic text-secondary",
        active ? "bg-blue/10 font-semibold text-blue" : "text-primary hover:bg-surface-muted hover:text-blue"
      )}
      href={href}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className={cn("grid h-4 w-4 shrink-0 place-items-center border", active ? "border-blue bg-blue text-white" : "border-secondary/60 bg-surface")}>{active ? <Check size={12} strokeWidth={3} /> : null}</span>
        <span className="truncate">{children}</span>
      </span>
      {count !== undefined ? <span className="shrink-0 text-[11px] text-secondary">({count.toLocaleString()})</span> : null}
    </Link>
  );
}

type ShopHrefInput = {
  age?: ProductAgeGroup;
  basePath?: string;
  brand?: string;
  category?: string;
  categoryParam?: "category" | "department";
  collection?: string;
  fulfillment?: FulfillmentMode;
  price?: string;
  sort?: string;
};

function shopHref(input: ShopHrefInput) {
  const params = new URLSearchParams();
  if (input.category) params.set(input.categoryParam ?? "department", input.category);
  if (input.collection) params.set("collection", input.collection);
  if (input.brand) params.set("brand", input.brand);
  if (input.age) params.set("age", input.age);
  if (input.fulfillment) params.set("fulfillment", input.fulfillment);
  if (input.price) params.set("price", input.price);
  if (input.sort && input.sort !== "featured") params.set("sort", input.sort);
  const query = params.toString();
  const basePath = input.basePath?.startsWith("/") ? input.basePath : "/shop";
  return query ? `${basePath}?${query}` : basePath;
}
