import { Search } from "lucide-react";
import Link from "next/link";
import { ProductCard } from "@/components/commerce/product-card";
import { SectionFrame } from "@/components/sections/section-frame";
import { storefrontProducts } from "@/features/catalog/product-catalog";

export const metadata = {
  title: "Search",
  description: "Search Modern State toys, balloons, party supplies, stationery, gifts, and creative essentials."
};

type SearchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = paramValue(params?.q).trim().slice(0, 100);
  const products = query ? searchProducts(query) : [];

  return (
    <main className="bg-surface">
      <SectionFrame area="Search" className="py-8 md:py-12" component="SearchPageSection" sectionId="search.index" variant="product-grid">
        <div className="container-shell">
          <nav aria-label="Breadcrumb" className="mb-5 text-sm font-black text-primary">
            <Link className="hover:underline" href="/">
              Home
            </Link>
            <span className="mx-2 text-secondary">›</span>
            <span>Search</span>
          </nav>

          <div className="max-w-3xl">
            <h1 className="font-display text-4xl font-black leading-tight md:text-5xl">Search Modern State</h1>
            <p className="mt-3 text-lg text-secondary">Find products by name, category, or description.</p>
          </div>

          <form action="/search" className="mt-7 flex max-w-3xl flex-col gap-3 sm:flex-row" method="get" role="search">
            <label className="sr-only" htmlFor="catalog-search">
              Search products
            </label>
            <div className="flex min-h-14 flex-1 items-center gap-3 rounded-md border border-border bg-surface-muted px-4 focus-within:border-blue">
              <Search aria-hidden="true" className="shrink-0 text-blue" size={22} />
              <input className="min-w-0 flex-1 bg-transparent py-3 text-base font-semibold outline-none placeholder:text-text-muted" defaultValue={query} id="catalog-search" name="q" placeholder="Search products" type="search" />
            </div>
            <button className="min-h-14 rounded-pill bg-blue px-7 py-3 font-black text-white hover:bg-primary" type="submit">
              Search
            </button>
          </form>

          {query ? (
            <section aria-label="Search results" className="mt-10">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-black">Results for “{query}”</h2>
                  <p aria-live="polite" className="mt-1 text-secondary">
                    {products.length} {products.length === 1 ? "product" : "products"} found
                  </p>
                </div>
                <Link className="font-black text-blue hover:underline" href="/shop">
                  Browse all products
                </Link>
              </div>

              {products.length > 0 ? (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {products.map((product) => (
                    <ProductCard key={product.squareVariationId} product={product} variant="premium" />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-border bg-surface-muted p-6 sm:p-8">
                  <h3 className="text-xl font-black">No products matched that search.</h3>
                  <p className="mt-2 text-secondary">Try a broader term such as toys, balloons, party, gifts, arts, or stationery.</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link className="rounded-pill bg-yellow px-5 py-3 font-black text-blue" href="/shop">
                      Shop all
                    </Link>
                    <Link className="rounded-pill border border-border bg-surface px-5 py-3 font-black text-primary" href="/contact">
                      Ask a store
                    </Link>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <div className="mt-10 rounded-md border border-border bg-surface-muted p-6 text-secondary sm:p-8">Enter a product, department, or occasion to search the current catalog.</div>
          )}
        </div>
      </SectionFrame>
    </main>
  );
}

function paramValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function searchProducts(query: string) {
  const terms = normalizeSearchValue(query).split(" ").filter(Boolean);

  return storefrontProducts.filter((product) => {
    const searchableValue = normalizeSearchValue([product.name, product.department, product.shortDescription, product.description, product.badge, product.slug].filter(Boolean).join(" "));
    return terms.every((term) => searchableValue.includes(term));
  });
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
