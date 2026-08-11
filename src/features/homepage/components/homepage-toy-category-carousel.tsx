/**
 * Renders real, image-backed website categories beneath the toys shop banner.
 */

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { WebsiteCategory } from "@/features/catalog/services/website-merchandising-service";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

export function HomepageToyCategoryCarousel({
  categories,
  section
}: {
  categories: WebsiteCategory[];
  section?: HomepageSectionConfig;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ canGoBack: false, canGoForward: false });
  const readyCategories = categories.filter(
    (category) => category.visible && category.imageUrl.trim()
  );
  const selectedCategorySlugs = (section?.items ?? [])
    .filter((item) => item.linkType === "category" && item.linkValue)
    .map((item) => item.linkValue as string);
  const categoryBySlug = new Map(
    readyCategories.map((category) => [category.slug, category])
  );
  const visibleCategories =
    selectedCategorySlugs.length > 0
      ? selectedCategorySlugs
          .map((slug) => categoryBySlug.get(slug))
          .filter((category): category is WebsiteCategory => Boolean(category))
      : readyCategories;
  const updateScrollState = useCallback(() => {
    const rail = railRef.current;

    if (!rail) return;
    const nextState = {
      canGoBack: rail.scrollLeft > 4,
      canGoForward: rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4
    };
    setScrollState((current) =>
      current.canGoBack === nextState.canGoBack && current.canGoForward === nextState.canGoForward
        ? current
        : nextState
    );
  }, []);

  function moveCategories(direction: -1 | 1) {
    const rail = railRef.current;

    if (!rail) return;
    const mobileLayout = window.matchMedia("(max-width: 639px)").matches;
    rail.scrollBy({
      behavior: "smooth",
      left: direction * (mobileLayout ? rail.clientWidth : Math.max(220, rail.clientWidth * 0.72))
    });
  }

  useEffect(() => {
    const rail = railRef.current;

    if (!rail) return;
    const animationFrame = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame(updateScrollState)
      : null;
    const fallbackTimer = animationFrame === null
      ? window.setTimeout(updateScrollState, 0)
      : null;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollState);
    observer?.observe(rail);

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      observer?.disconnect();
    };
  }, [updateScrollState, visibleCategories.length]);

  if (section?.isVisible === false || visibleCategories.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="homepage-toy-categories-title"
      className="mt-8 bg-white px-3 py-7 sm:px-1 sm:py-9"
      data-store-section={section?.sectionId ?? "home.toy-categories"}
    >
      <div className="mb-8 flex min-h-10 items-center justify-between gap-5 px-2 text-left sm:relative sm:mb-9 sm:justify-center sm:px-20 sm:text-center">
        <h2
          className="min-w-0 font-display text-[1.45rem] font-black leading-tight tracking-tight text-black sm:text-[1.9rem]"
          id="homepage-toy-categories-title"
        >
          {section?.title.trim() || "Shop By Category"}
        </h2>
        <div className="flex shrink-0 gap-3 sm:absolute sm:right-1 sm:top-1/2 sm:-translate-y-1/2 sm:gap-2" role="group" aria-label="Browse toy categories">
          <button
            aria-label="Previous toy categories"
            className="grid h-9 w-9 place-items-center rounded-full border border-[#155bc2]/20 bg-[#dbe9f9] text-[#155bc2] transition hover:bg-[#c9def5] disabled:cursor-not-allowed disabled:opacity-35 sm:h-10 sm:w-10"
            disabled={!scrollState.canGoBack}
            onClick={() => moveCategories(-1)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={20} strokeWidth={2.4} />
          </button>
          <button
            aria-label="Next toy categories"
            className="grid h-9 w-9 place-items-center rounded-full border border-[#155bc2] bg-[#155bc2] text-white transition hover:bg-[#0f489d] disabled:cursor-not-allowed disabled:border-[#155bc2]/20 disabled:bg-[#dbe9f9] disabled:text-[#155bc2] disabled:opacity-35 sm:h-10 sm:w-10"
            disabled={!scrollState.canGoForward}
            onClick={() => moveCategories(1)}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={20} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <div
        className={`grid snap-x snap-mandatory grid-flow-col grid-rows-2 auto-cols-[calc((100%_-_1rem)/2)] gap-x-4 gap-y-7 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex sm:auto-cols-auto sm:grid-flow-row sm:grid-rows-none sm:gap-7 sm:pb-1 lg:gap-8 xl:gap-10 ${visibleCategories.length <= 5 ? "lg:justify-center" : "lg:justify-start"}`}
        onScroll={updateScrollState}
        ref={railRef}
      >
        {visibleCategories.map((category) => {
          return (
            <Link
              aria-label={`Shop ${category.name}`}
              className="group w-full min-w-0 snap-start text-center sm:w-[168px] sm:min-w-[168px] lg:w-[178px] lg:min-w-[178px] xl:w-[190px] xl:min-w-[190px]"
              href={`/shop?department=${encodeURIComponent(category.slug)}`}
              key={category.id}
            >
              <span className="relative block aspect-square">
                <span
                  aria-hidden="true"
                  className="absolute inset-[9%] rounded-full bg-[#e4f4fb] transition duration-500 ease-out group-hover:scale-[1.025]"
                />
                <Image
                  alt={category.imageAlt || `${category.name} category`}
                  className="relative z-[1] h-full w-full scale-[0.94] object-contain opacity-100 mix-blend-multiply brightness-[0.96] contrast-[1.12] saturate-[1.14] transition duration-500 ease-out group-hover:scale-100"
                  fill
                  sizes="(min-width: 1280px) 190px, (min-width: 1024px) 178px, (min-width: 640px) 168px, 44vw"
                  src={category.imageUrl}
                  unoptimized
                />
              </span>
              <span className="mx-auto mt-4 block max-w-[13rem] text-[0.98rem] font-medium leading-[1.25] text-black transition group-hover:text-[#155bc2] sm:text-[1.05rem]">
                {category.name}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
