/**
 * Renders a real-product horizontal shelf with accessible carousel controls.
 */

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { ProductCard } from "@/components/commerce/product-card";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";

export function DepartmentProductShelf({ products, title }: { products: StorefrontProduct[]; title: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const visibleProducts = products.slice(0, 12);

  if (visibleProducts.length === 0) return null;

  function move(direction: -1 | 1) {
    const rail = railRef.current;
    const firstCard = rail?.firstElementChild;
    if (!rail || !(firstCard instanceof HTMLElement)) return;
    const step = firstCard.getBoundingClientRect().width + Number.parseFloat(getComputedStyle(rail).columnGap || "0");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({ behavior: reducedMotion ? "auto" : "smooth", left: step * direction });
  }

  return (
    <section aria-labelledby={`${slugifyId(title)}-title`} className="bg-surface-muted py-10 sm:py-14">
      <div className="container-shell">
        <div className="mb-7 flex items-center justify-between gap-5">
          <h2 className="font-display text-2xl font-black tracking-tight text-primary sm:text-3xl" id={`${slugifyId(title)}-title`}>{title}</h2>
          {visibleProducts.length > 2 ? (
            <div aria-label={`Browse ${title}`} className="flex gap-2" role="group">
              <ShelfButton direction="previous" onClick={() => move(-1)} />
              <ShelfButton direction="next" onClick={() => move(1)} />
            </div>
          ) : null}
        </div>
        <div
          aria-label={title}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:gap-4 sm:px-0 lg:grid lg:grid-flow-col lg:auto-cols-[minmax(190px,1fr)] lg:gap-5"
          ref={railRef}
        >
          {visibleProducts.map((product) => (
            <div className="min-w-0 shrink-0 basis-[calc((100%_-_0.75rem)/2)] snap-start sm:basis-[calc((100%_-_1rem)/3)] lg:w-auto lg:basis-auto [&_.storefront-product-card]:h-full" key={product.squareVariationId}>
              <ProductCard product={product} variant="compact" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShelfButton({ direction, onClick }: { direction: "next" | "previous"; onClick: () => void }) {
  const previous = direction === "previous";
  return (
    <button aria-label={`${previous ? "Previous" : "Next"} products`} className="grid h-11 w-11 place-items-center rounded-full border border-blue bg-surface text-blue transition hover:bg-blue hover:text-white" onClick={onClick} type="button">
      {previous ? <ChevronLeft aria-hidden="true" size={20} /> : <ChevronRight aria-hidden="true" size={20} />}
    </button>
  );
}

function slugifyId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
