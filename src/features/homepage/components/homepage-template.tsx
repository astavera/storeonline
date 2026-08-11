/**
 * Composes the storefront homepage from published CMS sections and focused feature components.
 */

import { PageRenderer } from "@/components/cms";
import { storeLocations } from "@/config/locations.config";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import type { WebsiteCategory } from "@/features/catalog/services/website-merchandising-service";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";
import { defaultHomepageSeo } from "@/features/homepage/config/homepage-seo.config";
import { getHomepageSectionType } from "@/features/homepage/utils/homepage-section-styles";
import {
  homepageSectionsToCmsPageDocument,
  type CmsSection
} from "@/lib/cms";
import { HomepageCalloutCards } from "./homepage-callout-cards";
import { HomepageFeaturedProductsSection } from "./homepage-featured-products-section";
import { HomepageFlexibleSection } from "./homepage-flexible-section";
import { HomepageHeroSection } from "./homepage-hero-section";
import { HomepagePromoTiles } from "./homepage-promo-tiles";
import { HomepageSeasonalProductCarousels } from "./homepage-seasonal-product-carousels";
import { HomepageStoreLocationsSection } from "./homepage-store-locations-section";

const SHOW_HOMEPAGE_PRODUCT_GRID = false;
const SHOW_HOMEPAGE_STORES = false;

type HomePageTemplateProps = {
  categories?: WebsiteCategory[];
  editorPreview?: boolean;
  editorPreviewSectionId?: string;
  locations?: typeof storeLocations;
  products?: StorefrontProduct[];
  sections: HomepageSectionConfig[];
  trendingProducts?: StorefrontProduct[];
};

export function HomePageTemplate({
  categories = [],
  editorPreview = false,
  editorPreviewSectionId,
  locations = storeLocations.filter(
    (location) => location.slug !== "warehouse"
  ),
  products = [],
  sections,
  trendingProducts = []
}: HomePageTemplateProps) {
  const homepageSectionsById = new Map(
    sections.map((section) => [section.sectionId, section])
  );
  const cmsDocument = homepageSectionsToCmsPageDocument({
    sections,
    seo: defaultHomepageSeo,
    status: "PUBLISHED"
  });

  return (
    <PageRenderer
      document={cmsDocument}
      renderSection={(section) =>
        renderHomepageSection(
          section,
          homepageSectionsById,
          categories,
          locations,
          products,
          trendingProducts,
          editorPreviewSectionId,
          editorPreview
        )
      }
    />
  );
}

function renderHomepageSection(
  section: CmsSection,
  sectionsById: Map<string, HomepageSectionConfig>,
  categories: WebsiteCategory[],
  locations: typeof storeLocations,
  products: StorefrontProduct[],
  trendingProducts: StorefrontProduct[],
  editorPreviewSectionId?: string,
  editorPreview = false
) {
  const homepageSection = sectionsById.get(section.id);

  if (!homepageSection) {
    return undefined;
  }

  const sectionType = getHomepageSectionType(homepageSection);

  if (sectionType === "hero") {
    return (
      <>
        <HomepageHeroSection section={homepageSection} />
        <HomepagePromoTiles />
        <HomepageSeasonalProductCarousels
          editorPreviewSectionId={editorPreviewSectionId}
          products={products}
          sections={[...sectionsById.values()]}
        />
        <HomepageCalloutCards
          balloonSection={sectionsById.get("home.balloon-promo")}
          categories={categories}
          editorPreview={editorPreview}
          editorPreviewSectionId={editorPreviewSectionId}
          featuredBrandsSection={sectionsById.get("home.featured-brands-carousel")}
          partySuppliesSection={sectionsById.get("home.party-supplies-callout")}
          products={products}
          section={sectionsById.get("home.new-trending")}
          toyCategoriesSection={sectionsById.get("home.toy-categories")}
          toysSection={sectionsById.get("home.toys-callout")}
          trendingProducts={trendingProducts}
        />
      </>
    );
  }

  if (sectionType === "image-banner") {
    return <HomepageHeroSection section={homepageSection} />;
  }

  if (sectionType === "departments" || sectionType === "promo") {
    return <></>;
  }

  if (homepageSection.variant === "seasonal-product-carousel") {
    return <></>;
  }

  if (homepageSection.variant === "new-trending-carousel") {
    return <></>;
  }

  if (homepageSection.variant === "featured-brands-carousel") {
    return <></>;
  }

  if (homepageSection.variant === "toy-category-carousel") {
    return <></>;
  }

  if (sectionType === "product-grid") {
    return SHOW_HOMEPAGE_PRODUCT_GRID && products.length > 0 ? (
      <HomepageFeaturedProductsSection
        products={products}
        section={homepageSection}
      />
    ) : (
      <></>
    );
  }

  if (sectionType === "storefront") {
    return SHOW_HOMEPAGE_STORES ? (
      <HomepageStoreLocationsSection
        locations={locations}
        section={homepageSection}
      />
    ) : (
      <></>
    );
  }

  return (
    <HomepageFlexibleSection
      products={products}
      section={homepageSection}
    />
  );
}
