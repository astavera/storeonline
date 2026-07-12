import { ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ProductCard } from "@/components/commerce/product-card";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { SectionFrame } from "@/components/sections/section-frame";
import { storefrontProducts, type StorefrontProduct } from "@/features/catalog/product-catalog";
import { cn } from "@/lib/utils";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";

export const metadata = {
  title: "Shop",
  description: "Shop Modern State toys, balloons, party supplies, stationery, gifts, and creative essentials."
};

type ShopPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const publishedDocument = await readLatestCmsDocument({ entityType: "landing", entityId: "shop", statuses: ["PUBLISHED"] });

  if (publishedDocument) {
    return <StorefrontCmsPage document={publishedDocument} />;
  }

  const params = await searchParams;
  const selectedDepartment = paramValue(params?.department);
  const selectedSort = paramValue(params?.sort) || "featured";
  const departments = Array.from(new Set(storefrontProducts.map((product) => product.department))).sort();
  const filteredProducts = selectedDepartment ? storefrontProducts.filter((product) => product.department.toLowerCase() === selectedDepartment.toLowerCase()) : storefrontProducts;
  const products = sortProducts(filteredProducts, selectedSort);

  return (
    <main className="bg-surface">
      <SectionFrame area="Shop" className="py-8 md:py-12" component="ShopPageSection" sectionId="shop.index" variant="product-grid">
        <div className="container-shell">
          <nav aria-label="Breadcrumb" className="mb-5 text-sm font-black text-primary [&_*]:text-primary">
            <Link className="text-primary hover:underline" href="/">
              Home
            </Link>
            <span className="mx-2 text-secondary">›</span>
            <span className="text-primary">Shop</span>
          </nav>
          <div className="mb-8 max-w-3xl">
            <h1 className="font-display text-4xl font-black leading-tight md:text-5xl">Shop Modern State</h1>
            <p className="mt-3 text-lg text-secondary">Browse toys, balloons, party supplies, stationery, gifts, and neighborhood favorites.</p>
          </div>

          <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-[170px] lg:self-start">
              <details className="rounded-md border border-border bg-surface lg:hidden">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-black [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal aria-hidden="true" className="text-blue" size={18} />
                    Filters
                  </span>
                  <ChevronDown aria-hidden="true" size={18} />
                </summary>
                <div className="border-t border-border px-5 pb-2">
                  <ShopFilterOptions departments={departments} selectedDepartment={selectedDepartment} selectedSort={selectedSort} />
                </div>
              </details>
              <div className="hidden rounded-md border border-border bg-surface p-5 lg:block">
                <div className="mb-4 flex items-center justify-between border-b border-border pb-4">
                  <h2 className="font-black">Filter</h2>
                  <SlidersHorizontal aria-hidden="true" className="text-blue" size={18} />
                </div>
                <ShopFilterOptions departments={departments} selectedDepartment={selectedDepartment} selectedSort={selectedSort} />
              </div>
            </aside>

            <section aria-label="Products">
              <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <p className="text-lg font-black">{products.length} products</p>
                <div className="flex flex-wrap items-center gap-3">
                  {selectedDepartment ? (
                    <Link className="rounded-pill border border-border px-4 py-2 text-sm font-black hover:bg-surface-muted" href={hrefWithParams({ sort: selectedSort })}>
                      Clear category
                    </Link>
                  ) : null}
                  <SortMenu selectedDepartment={selectedDepartment} selectedSort={selectedSort} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <ProductCard key={product.squareVariationId} product={product} variant="premium" />
                ))}
              </div>
            </section>
          </div>
        </div>
      </SectionFrame>
    </main>
  );
}

function ShopFilterOptions({
  departments,
  selectedDepartment,
  selectedSort
}: {
  departments: string[];
  selectedDepartment?: string;
  selectedSort: string;
}) {
  return (
    <>
      <FilterGroup label="Category">
        <FilterLink active={!selectedDepartment} href={hrefWithParams({ sort: selectedSort })}>
          All products
        </FilterLink>
        {departments.map((department) => (
          <FilterLink active={selectedDepartment?.toLowerCase() === department.toLowerCase()} href={hrefWithParams({ department, sort: selectedSort })} key={department}>
            {department}
          </FilterLink>
        ))}
      </FilterGroup>
      <FilterGroup label="Age">
        {["0-2", "3-4", "5-7", "8-10", "11-12", "13+"].map((age) => (
          <span className="rounded-pill bg-surface-muted px-3 py-1 text-sm font-bold text-secondary" key={age}>
            {age}
          </span>
        ))}
      </FilterGroup>
      <FilterGroup label="Fulfillment">
        {["Pickup", "Local delivery", "Shipping"].map((mode) => (
          <span className="rounded-pill bg-surface-muted px-3 py-1 text-sm font-bold text-secondary" key={mode}>
            {mode}
          </span>
        ))}
      </FilterGroup>
      <FilterGroup label="Price">
        <Link className="text-sm font-bold text-blue hover:underline" href={hrefWithParams({ department: selectedDepartment, sort: "price-low" })}>
          Low to high
        </Link>
        <Link className="text-sm font-bold text-blue hover:underline" href={hrefWithParams({ department: selectedDepartment, sort: "price-high" })}>
          High to low
        </Link>
      </FilterGroup>
    </>
  );
}

function FilterGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <details className="border-b border-border py-4 last:border-b-0" open>
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black">
        {label}
        <ChevronDown aria-hidden="true" size={16} />
      </summary>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </details>
  );
}

function FilterLink({ active, children, href }: { active: boolean; children: ReactNode; href: string }) {
  return (
    <Link className={cn("rounded-pill px-3 py-1 text-sm font-black", active ? "bg-blue text-white" : "bg-surface-muted text-secondary hover:bg-cyan hover:text-primary")} href={href}>
      {children}
    </Link>
  );
}

function SortMenu({ selectedDepartment, selectedSort }: { selectedDepartment?: string; selectedSort: string }) {
  const label = sortLabel(selectedSort);

  return (
    <details className="relative min-w-[230px] rounded-pill border border-border bg-surface px-5 py-3 text-sm font-black shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-5">
        <span>Sort by:</span>
        <span className="font-semibold text-secondary">{label}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </summary>
      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 grid min-w-full gap-1 rounded-md border border-border bg-surface p-2 shadow-card">
        {[
          ["featured", "Featured"],
          ["price-low", "Price: low to high"],
          ["price-high", "Price: high to low"]
        ].map(([value, optionLabel]) => (
          <Link className="rounded-md px-3 py-2 text-sm font-bold hover:bg-surface-muted" href={hrefWithParams({ department: selectedDepartment, sort: value })} key={value}>
            {optionLabel}
          </Link>
        ))}
      </div>
    </details>
  );
}

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hrefWithParams(input: { department?: string; sort?: string }) {
  const params = new URLSearchParams();

  if (input.department) {
    params.set("department", input.department);
  }

  if (input.sort && input.sort !== "featured") {
    params.set("sort", input.sort);
  }

  const query = params.toString();
  return query ? `/shop?${query}` : "/shop";
}

function sortProducts(products: StorefrontProduct[], sort: string) {
  const sortedProducts = [...products];

  if (sort === "price-low") {
    return sortedProducts.sort((a, b) => a.priceCents - b.priceCents);
  }

  if (sort === "price-high") {
    return sortedProducts.sort((a, b) => b.priceCents - a.priceCents);
  }

  return sortedProducts;
}

function sortLabel(sort: string) {
  if (sort === "price-low") {
    return "Price low";
  }

  if (sort === "price-high") {
    return "Price high";
  }

  return "Featured";
}
