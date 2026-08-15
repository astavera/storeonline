/**
 * Renders an automatic two-product carousel of admin-selected trending items.
 */

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";
import { resolveHomepageCarouselProducts } from "@/features/homepage/utils/homepage-carousel-products";
import { formatMoney } from "@/lib/utils";

const CAROUSEL_INTERVAL_MS = 4_500;
const CAROUSEL_ITEMS_PER_VIEW = 2;
const MAX_TRENDING_PRODUCTS = 10;

export function HomepageNewTrendingCard({
  products,
  section,
  trendingProducts
}: {
  products: StorefrontProduct[];
  section?: HomepageSectionConfig;
  trendingProducts: StorefrontProduct[];
}) {
  const categorySlug = section?.categorySlug?.trim() ?? "";
  const visibleProducts = section
    ? resolveHomepageCarouselProducts({
        fallbackProducts: trendingProducts,
        products,
        section
      }).slice(0, MAX_TRENDING_PRODUCTS)
    : trendingProducts.slice(0, MAX_TRENDING_PRODUCTS);
  const eyebrow = section?.eyebrow?.trim() || "Just landed";
  const title = section?.title?.trim() || "New & trending";
  const ctaLabel = section?.ctaLabel?.trim() || "Discover What's New";
  const ctaHref = categorySlug
    ? `/shop?department=${encodeURIComponent(categorySlug)}`
    : section?.ctaHref?.trim() || "/shop?feature=new-and-trending";
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const maxStartIndex = Math.max(
    0,
    visibleProducts.length - CAROUSEL_ITEMS_PER_VIEW
  );
  const displayIndex = Math.min(activeIndex, maxStartIndex);

  useEffect(() => {
    if (maxStartIndex === 0 || isPaused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const intervalId = window.setInterval(() => {
      setActiveIndex((current) =>
        current >= maxStartIndex ? 0 : current + 1
      );
    }, CAROUSEL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isPaused, maxStartIndex]);

  return (
    <article
      className="relative isolate flex min-h-[430px] overflow-hidden rounded-[24px] border border-black/15 bg-white text-black shadow-[0_22px_60px_rgba(0,0,0,0.08)] sm:rounded-[32px] lg:min-h-[500px]"
      data-store-section={section?.sectionId ?? "home.new-trending"}
      onBlur={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        aria-hidden="true"
        className="absolute -right-16 -top-20 h-52 w-52 rounded-full border border-black/[0.06] bg-black/[0.025]"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-24 -left-16 h-48 w-48 rounded-full border border-black/[0.06] bg-black/[0.035]"
      />

      <div className="relative z-10 flex w-full min-w-0 flex-col p-6 sm:p-8 lg:p-7 xl:p-8">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-black/55">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-balance font-display text-3xl font-black leading-none tracking-tight sm:text-4xl lg:text-3xl xl:text-4xl">
            {title}
          </h2>
          {categorySlug ? (
            <p className="mt-3 inline-flex rounded-full bg-black px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white">
              Category: {categoryLabel(categorySlug)}
            </p>
          ) : null}
        </div>

        {visibleProducts.length > 0 ? (
          <>
            <div
              aria-label="New and trending products"
              aria-live="off"
              className="-mx-1.5 mt-5 min-w-0 overflow-hidden"
              role="region"
            >
              <div
                className="flex transition-transform duration-700 ease-out motion-reduce:transition-none"
                style={{ transform: `translateX(-${displayIndex * 50}%)` }}
              >
                {visibleProducts.map((product, index) => {
                  const isProductVisible =
                    index >= displayIndex &&
                    index < displayIndex + CAROUSEL_ITEMS_PER_VIEW;

                  return (
                    <div
                      aria-hidden={!isProductVisible}
                      className={`min-w-[50%] px-1.5 ${
                        visibleProducts.length === 1 ? "mx-auto" : ""
                      }`}
                      key={product.squareVariationId}
                    >
                      <Link
                        className="group flex h-full min-h-[250px] flex-col rounded-[20px] border border-black/10 bg-white p-3 shadow-[0_16px_34px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:border-black/30"
                        href={`/products/${product.slug}`}
                        tabIndex={isProductVisible ? 0 : -1}
                      >
                        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[14px] bg-[#f4f4f4]">
                          {product.imageUrl ? (
                            <Image
                              alt={product.name}
                              className="object-contain p-2 transition duration-300 group-hover:scale-105"
                              fill
                              sizes="(max-width: 1024px) 46vw, 23vw"
                              src={product.imageUrl}
                              unoptimized
                            />
                          ) : (
                            <div className="grid h-full place-items-center px-3 text-center text-xs font-bold text-secondary">
                              Image coming soon
                            </div>
                          )}
                        </div>
                        <div className="mt-3 min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-black/50">
                            New arrival
                          </p>
                          <h3 className="mt-1.5 line-clamp-2 font-display text-base font-black leading-tight sm:text-lg xl:text-xl">
                            {product.name}
                          </h3>
                          <p className="mt-2 text-base font-black sm:text-lg">
                            {formatMoney(product.priceCents)}
                          </p>
                          <span className="mt-2 inline-flex text-xs font-black text-black">
                            Shop product {"\u2192"}
                          </span>
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>

            {maxStartIndex > 0 ? (
              <div
                aria-label="Choose trending products"
                className="mt-auto flex justify-center gap-2 pt-4"
                role="group"
              >
                {visibleProducts
                  .slice(0, maxStartIndex + 1)
                  .map((product, index) => (
                    <button
                      aria-label={`Show ${product.name} and ${visibleProducts[index + 1]?.name}`}
                      aria-pressed={displayIndex === index}
                      className={`h-2.5 rounded-full transition-all ${
                        displayIndex === index
                          ? "w-7 bg-black"
                          : "w-2.5 bg-black/15 hover:bg-black/35"
                      }`}
                      key={product.squareVariationId}
                      onClick={() => setActiveIndex(index)}
                      type="button"
                    />
                  ))}
              </div>
            ) : null}

            <ButtonLink
              className="mx-auto mt-4 min-h-12 w-fit justify-center gap-3 rounded-pill bg-black px-6 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(0,0,0,0.18)] hover:bg-[#292929]"
              href={ctaHref}
            >
              <span>{ctaLabel}</span>
              <span
                aria-hidden="true"
                className="grid h-7 w-7 place-items-center rounded-full bg-white/15 text-base"
              >
                {"\u2192"}
              </span>
            </ButtonLink>
          </>
        ) : (
          <div className="mt-5 flex flex-1 flex-col items-center justify-end rounded-[22px] border border-black/10 bg-[#f7f7f7] p-5">
            <ButtonLink
              className="min-h-12 w-fit justify-center gap-3 rounded-pill bg-black px-6 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(0,0,0,0.18)] hover:bg-[#292929]"
              href={ctaHref}
            >
              <span>{ctaLabel}</span>
              <span
                aria-hidden="true"
                className="grid h-7 w-7 place-items-center rounded-full bg-white/15 text-base"
              >
                {"\u2192"}
              </span>
            </ButtonLink>
          </div>
        )}
      </div>
    </article>
  );
}

function categoryLabel(categorySlug: string) {
  return categorySlug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
