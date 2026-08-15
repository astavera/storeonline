/**
 * Renders reusable admin-managed seasonal product rows as responsive carousels.
 */

"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";

import { ProductCard } from "@/components/commerce/product-card";
import { SectionFrame } from "@/components/sections/section-frame";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";
import { resolveHomepageCarouselProducts } from "@/features/homepage/utils/homepage-carousel-products";
import { isHomepageSectionElementVisible } from "@/features/homepage/utils/homepage-section-styles";

type HomepageSeasonalProductCarouselsProps = {
  editorPreviewSectionId?: string;
  products: StorefrontProduct[];
  sections: HomepageSectionConfig[];
};

export function HomepageSeasonalProductCarousels({
  editorPreviewSectionId,
  products,
  sections
}: HomepageSeasonalProductCarouselsProps) {
  const visibleRows = sections
    .filter(
      (section) =>
        (section.isVisible || section.sectionId === editorPreviewSectionId) &&
        section.variant === "seasonal-product-carousel" &&
        isHomepageSectionElementVisible(section, "items")
    )
    .sort((first, second) => first.sortOrder - second.sortOrder);

  if (visibleRows.length === 0) {
    return null;
  }

  return (
    <div className="bg-surface py-3 sm:py-4">
      {visibleRows.map((section) => (
        <SeasonalProductRow
          editorPreview={section.sectionId === editorPreviewSectionId}
          key={section.sectionId}
          products={products}
          section={section}
        />
      ))}
    </div>
  );
}

function SeasonalProductRow({
  editorPreview,
  products,
  section
}: {
  editorPreview: boolean;
  products: StorefrontProduct[];
  section: HomepageSectionConfig;
}) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const selectedProducts = resolveHomepageCarouselProducts({
    products,
    section
  });

  function moveCarousel(direction: -1 | 1) {
    const carousel = carouselRef.current;
    const firstCard = carousel?.firstElementChild;

    if (!carousel || !(firstCard instanceof HTMLElement)) {
      return;
    }

    const gap = Number.parseFloat(getComputedStyle(carousel).columnGap || "0");
    const cardStep = firstCard.getBoundingClientRect().width + gap;
    const maximumScroll = carousel.scrollWidth - carousel.clientWidth;
    const isAtStart = carousel.scrollLeft <= 4;
    const isAtEnd = carousel.scrollLeft >= maximumScroll - 4;

    if (direction === -1 && isAtStart) {
      carousel.scrollTo({ left: maximumScroll, behavior: "smooth" });
      return;
    }

    if (direction === 1 && isAtEnd) {
      carousel.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }

    carousel.scrollBy({ left: cardStep * direction, behavior: "smooth" });
  }

  return (
    <SectionFrame
      area="Homepage"
      className="py-4 sm:py-5"
      component="HomepageSeasonalProductCarousel"
      sectionId={section.sectionId}
      variant={section.variant}
    >
      <div className="container-shell homepage-wide-shell">
        <div className={selectedProducts.length > 0 ? "mb-4 flex items-end justify-between gap-5 sm:mb-5" : "flex items-end justify-between gap-5"}>
          <div>
            {isHomepageSectionElementVisible(section, "title") ? (
              <h2 className="font-display text-2xl font-black leading-tight tracking-tight text-primary sm:text-3xl">
                {section.title}
              </h2>
            ) : null}
          </div>

          {selectedProducts.length > 1 ? (
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <CarouselButton
                direction="previous"
                onClick={() => moveCarousel(-1)}
                rowTitle={section.title}
              />
              <CarouselButton
                direction="next"
                onClick={() => moveCarousel(1)}
                rowTitle={section.title}
              />
            </div>
          ) : null}
        </div>

        {selectedProducts.length > 0 ? (
          <div
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:gap-4 sm:px-0 lg:grid lg:grid-flow-col lg:auto-cols-[minmax(210px,1fr)] lg:gap-5"
            ref={carouselRef}
          >
            {selectedProducts.map((product) => (
              <div
                className="min-w-0 shrink-0 basis-[82%] snap-start sm:basis-[calc((100%-1rem)/2)] lg:w-auto lg:basis-auto [&_.storefront-product-card]:h-full"
                key={product.squareVariationId}
              >
                <ProductCard
                  product={product}
                  showQuantitySelector
                  variant="compact"
                />
              </div>
            ))}
          </div>
        ) : editorPreview ? (
          <div className="grid min-h-40 place-items-center rounded-[20px] border border-dashed border-black/20 bg-[#f7f7f7] px-6 text-center">
            <div className="max-w-md">
              <p className="font-display text-lg font-black text-primary">
                This row is ready for products
              </p>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
                Choose a Catalog Publishing category or add individual products
                in the editor. The actual product cards will appear here.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </SectionFrame>
  );
}

function CarouselButton({
  direction,
  onClick,
  rowTitle
}: {
  direction: "next" | "previous";
  onClick: () => void;
  rowTitle: string;
}) {
  const isPrevious = direction === "previous";

  return (
    <button
      aria-label={`${isPrevious ? "Previous" : "Next"} items in ${rowTitle}`}
      className="grid size-10 place-items-center rounded-full border border-border bg-surface text-primary transition hover:border-purple hover:bg-purple hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple"
      onClick={onClick}
      type="button"
    >
      {isPrevious ? (
        <ChevronLeft aria-hidden="true" size={19} />
      ) : (
        <ChevronRight aria-hidden="true" size={19} />
      )}
    </button>
  );
}
