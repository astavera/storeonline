/**
 * Renders the optional homepage overview of customer-facing store locations.
 */

import { SectionFrame } from "@/components/sections/section-frame";
import { storeLocations } from "@/config/locations.config";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";
import {
  getHomepageSectionPaddingClass,
  getHomepageSectionToneClass,
  getHomepageTextPositionClass,
  isHomepageSectionElementVisible
} from "@/features/homepage/utils/homepage-section-styles";
import { cn } from "@/lib/utils";

export function HomepageStoreLocationsSection({
  section,
  locations
}: {
  section: HomepageSectionConfig;
  locations: typeof storeLocations;
}) {
  return (
    <SectionFrame
      area="Homepage"
      className={cn(
        getHomepageSectionToneClass(section),
        getHomepageSectionPaddingClass(section)
      )}
      component="HomepageStoreLocationsSection"
      sectionId={section.sectionId}
      variant={section.variant}
    >
      <div className="container-shell">
        <div
          className={cn(
            "mb-8 max-w-2xl",
            getHomepageTextPositionClass(section)
          )}
        >
          {isHomepageSectionElementVisible(section, "title") &&
          section.title ? (
            <h2 className="font-display text-3xl font-semibold">
              {section.title}
            </h2>
          ) : null}
          {isHomepageSectionElementVisible(section, "body") && section.body ? (
            <p className="mt-3 text-secondary">{section.body}</p>
          ) : null}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {locations.map((location) => (
            <article className="surface-card p-6" key={location.id}>
              <h3 className="font-display text-xl font-semibold">
                {location.name}
              </h3>
              <p className="mt-2 text-sm text-secondary">
                {location.address}
              </p>
              <p className="text-sm text-secondary">{location.locality}</p>
              <p className="mt-4 text-sm font-semibold">{location.phone}</p>
              <p className="text-sm text-secondary">{location.hours}</p>
            </article>
          ))}
        </div>
      </div>
    </SectionFrame>
  );
}
