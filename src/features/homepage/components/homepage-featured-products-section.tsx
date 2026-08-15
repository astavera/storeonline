/**
 * Renders the optional homepage product collection and its catalog call to action.
 */

import { ProductGrid } from "@/components/commerce/product-grid";
import { SectionFrame } from "@/components/sections/section-frame";
import { ButtonLink } from "@/components/ui/button";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";
import {
  getHomepageSectionPaddingClass,
  getHomepageSectionToneClass,
  getHomepageTextPositionClass,
  isHomepageSectionElementVisible
} from "@/features/homepage/utils/homepage-section-styles";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function HomepageFeaturedProductsSection({
  products,
  section
}: {
  products: StorefrontProduct[];
  section: HomepageSectionConfig;
}) {
  return (
    <SectionFrame
      area="Homepage"
      className={cn(
        getHomepageSectionToneClass(section),
        getHomepageSectionPaddingClass(section)
      )}
      component="HomepageFeaturedProductsSection"
      sectionId={section.sectionId}
      variant={section.variant}
    >
      <div className="container-shell">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div
            className={cn(
              "max-w-2xl",
              getHomepageTextPositionClass(section)
            )}
          >
            <h2 className="font-display text-4xl font-black">
              {section.title}
            </h2>
            <p className="mt-3 text-secondary">{section.body}</p>
          </div>
          <div
            aria-hidden="true"
            className="hidden items-center gap-2 md:flex"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-blue/45 text-white">
              <ChevronLeft size={20} />
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-blue text-white">
              <ChevronRight size={20} />
            </span>
          </div>
        </div>
        <ProductGrid
          cardVariant="premium"
          limit={4}
          preset="balloons"
          products={products.slice(0, 4)}
        />
        {isHomepageSectionElementVisible(section, "primaryCta") &&
        section.ctaHref ? (
          <div className="mt-10 flex justify-center">
            <ButtonLink
              className="rounded-pill px-8 py-3 font-black"
              href={section.ctaHref}
            >
              {section.ctaLabel || "Shop all"}
            </ButtonLink>
          </div>
        ) : null}
      </div>
    </SectionFrame>
  );
}
