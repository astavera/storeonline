/**
 * Combines the toys shop banner and toy category carousel.
 */

import type { WebsiteCategory } from "@/features/catalog/services/website-merchandising-service";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

import { HomepageToyCategoryCarousel } from "./homepage-toy-category-carousel";
import { HomepageToysAgeInterestCard } from "./homepage-toys-age-interest-card";

export function HomepageToysShowcase({
  categories = [],
  section,
  toyCategoriesSection
}: {
  categories?: WebsiteCategory[];
  section?: HomepageSectionConfig;
  toyCategoriesSection?: HomepageSectionConfig;
}) {
  return (
    <section className="mt-8 sm:mt-10" data-store-section="home.toys-showcase">
      <div>
        <HomepageToysAgeInterestCard section={section} />
      </div>
      <HomepageToyCategoryCarousel
        categories={categories}
        section={toyCategoriesSection}
      />
    </section>
  );
}
