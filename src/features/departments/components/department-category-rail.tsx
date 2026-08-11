/**
 * Renders an image-led category rail backed only by persistent Admin assets.
 */

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WebsiteCategory } from "@/features/catalog/services/website-merchandising-service";

export function DepartmentCategoryRail({
  basePath,
  categories,
  title
}: {
  basePath: string;
  categories: WebsiteCategory[];
  title: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ back: false, forward: false });
  const readyCategories = categories.filter((category) => category.visible && isPersistentImage(category.imageUrl));

  const updateScrollState = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const next = {
      back: rail.scrollLeft > 4,
      forward: rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4
    };
    setScrollState((current) => current.back === next.back && current.forward === next.forward ? current : next);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const frame = window.requestAnimationFrame(updateScrollState);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollState);
    observer?.observe(rail);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [readyCategories.length, updateScrollState]);

  if (readyCategories.length === 0) return null;

  function move(direction: -1 | 1) {
    const rail = railRef.current;
    if (!rail) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({
      behavior: reducedMotion ? "auto" : "smooth",
      left: direction * (window.matchMedia("(max-width: 639px)").matches ? rail.clientWidth : Math.max(240, rail.clientWidth * 0.7))
    });
  }

  return (
    <section aria-labelledby={`${basePath.slice(1)}-categories-title`} className="bg-surface py-10 sm:py-14" id={basePath === "/party-supplies" ? "shop-by-occasion" : "shop-by-category"}>
      <div className="container-shell">
        <div className="mb-7 flex items-center justify-between gap-5 sm:mb-9">
          <h2 className="font-display text-2xl font-black tracking-tight text-primary sm:text-3xl" id={`${basePath.slice(1)}-categories-title`}>
            {title}
          </h2>
          <div aria-label={`Browse ${title}`} className="flex shrink-0 gap-2" role="group">
            <RailButton disabled={!scrollState.back} direction="previous" onClick={() => move(-1)} />
            <RailButton disabled={!scrollState.forward} direction="next" onClick={() => move(1)} />
          </div>
        </div>
        <div
          className="grid snap-x snap-mandatory grid-flow-col grid-rows-2 auto-cols-[calc((100%_-_1rem)/2)] gap-x-4 gap-y-7 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex sm:grid-flow-row sm:grid-rows-none sm:gap-7"
          onScroll={updateScrollState}
          ref={railRef}
        >
          {readyCategories.map((category) => (
            <Link
              aria-label={`Shop ${category.name}`}
              className="group w-full min-w-0 snap-start text-center sm:w-[168px] sm:min-w-[168px] lg:w-[184px] lg:min-w-[184px]"
              href={`${basePath}?category=${encodeURIComponent(category.slug)}#catalog`}
              key={category.id}
            >
              <span className="relative block aspect-square">
                <span aria-hidden="true" className="absolute inset-[8%] rounded-full bg-cyan transition duration-300 group-hover:scale-[1.03]" />
                <Image
                  alt={category.imageAlt || `${category.name} category`}
                  className="relative z-[1] object-contain mix-blend-multiply transition duration-300 group-hover:scale-[1.03]"
                  fill
                  sizes="(min-width: 1024px) 184px, (min-width: 640px) 168px, 44vw"
                  src={category.imageUrl}
                />
              </span>
              <span className="mx-auto mt-3 block max-w-[12rem] text-sm font-bold leading-tight text-primary transition group-hover:text-blue sm:text-base">
                {category.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function RailButton({ disabled, direction, onClick }: { disabled: boolean; direction: "next" | "previous"; onClick: () => void }) {
  const previous = direction === "previous";
  return (
    <button
      aria-label={`${previous ? "Previous" : "Next"} categories`}
      className="grid h-11 w-11 place-items-center rounded-full border border-blue bg-surface text-blue transition hover:bg-blue hover:text-white disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-secondary disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {previous ? <ChevronLeft aria-hidden="true" size={20} /> : <ChevronRight aria-hidden="true" size={20} />}
    </button>
  );
}

function isPersistentImage(imageUrl: string) {
  return imageUrl.startsWith("/images/") || imageUrl.startsWith("/uploads/");
}
