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
import { HomepageProductCardPlaceholders } from "./homepage-product-card-placeholders";

export function HomepageFeaturedProductsSection({
  editorPreview = false,
  products,
  section
}: {
  editorPreview?: boolean;
  products: StorefrontProduct[];
  section: HomepageSectionConfig;
}) {
  if (products.length === 0 && !editorPreview) {
    return null;
  }

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
        {products.length > 0 ? (
          <ProductGrid
            cardVariant="premium"
            limit={4}
            preset="balloons"
            products={products.slice(0, 4)}
          />
        ) : (
          <div className="space-y-4">
            <div className="rounded-[20px] border border-dashed border-black/20 bg-[#f7f7f7] px-6 py-4 text-center">
              <p className="font-display text-lg font-black text-primary">
                The featured product area is ready
              </p>
              <p className="mt-1 text-sm leading-relaxed text-secondary">
                Product cards will publish here after the catalog connection is enabled.
              </p>
            </div>
            <HomepageProductCardPlaceholders />
          </div>
        )}
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
