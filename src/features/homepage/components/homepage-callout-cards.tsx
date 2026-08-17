/**
 * Arranges the homepage balloon and new-product callouts responsively.
 */

import { SectionFrame } from "@/components/sections/section-frame";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import type { WebsiteCategory } from "@/features/catalog/services/website-merchandising-service";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

import { HomepageBalloonOrderCard } from "./homepage-balloon-order-card";
import { HomepageFeaturedBrandsCarousel } from "./homepage-featured-brands-carousel";
import { HomepageNewTrendingCard } from "./homepage-new-trending-card";
import { HomepagePartySuppliesCard } from "./homepage-party-supplies-card";
import { HomepageToysShowcase } from "./homepage-toys-showcase";

export function HomepageCalloutCards({
  balloonSection,
  categories = [],
  editorPreview = false,
  editorPreviewSectionId,
  featuredBrandsSection,
  partySuppliesSection,
  products,
  section,
  toyCategoriesSection,
  toysSection,
  trendingProducts
}: {
  balloonSection?: HomepageSectionConfig;
  categories?: WebsiteCategory[];
  editorPreview?: boolean;
  editorPreviewSectionId?: string;
  featuredBrandsSection?: HomepageSectionConfig;
  partySuppliesSection?: HomepageSectionConfig;
  products: StorefrontProduct[];
  section?: HomepageSectionConfig;
  toyCategoriesSection?: HomepageSectionConfig;
  toysSection?: HomepageSectionConfig;
  trendingProducts: StorefrontProduct[];
}) {
  const showNewTrending =
    section?.isVisible !== false ||
    section?.sectionId === editorPreviewSectionId;

  return (
    <SectionFrame
      area="Homepage"
      className="bg-surface pb-12 pt-1 sm:pb-16 sm:pt-2"
      component="HomepageCalloutCards"
      sectionId="home.callouts"
      variant="feature-callouts"
    >
      <div className="container-shell homepage-wide-shell">
        <div className={`grid gap-6 sm:gap-8 lg:items-stretch ${showNewTrending ? "lg:grid-cols-2" : ""}`}>
          {balloonSection?.isVisible !== false ? <HomepageBalloonOrderCard section={balloonSection} /> : null}
          {showNewTrending ? (
            <HomepageNewTrendingCard
              products={products}
              section={section}
              trendingProducts={trendingProducts}
            />
          ) : null}
        </div>
        {partySuppliesSection?.isVisible !== false ? (
          <HomepagePartySuppliesCard section={partySuppliesSection} />
        ) : null}
        <HomepageFeaturedBrandsCarousel
          editorPreview={editorPreview}
          forceVisible={
            featuredBrandsSection?.sectionId === editorPreviewSectionId
          }
          section={featuredBrandsSection}
        />
        {toysSection?.isVisible !== false ? (
          <HomepageToysShowcase
            categories={categories}
            section={toysSection}
            toyCategoriesSection={toyCategoriesSection}
          />
        ) : null}
      </div>
    </SectionFrame>
  );
}
