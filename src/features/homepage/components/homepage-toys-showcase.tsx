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
    <section className="mt-5" data-store-section="home.toys-showcase">
      <div className="mx-auto 2xl:max-w-[94.75rem]">
        <HomepageToysAgeInterestCard section={section} />
      </div>
      <HomepageToyCategoryCarousel
        categories={categories}
        section={toyCategoriesSection}
      />
    </section>
  );
}
