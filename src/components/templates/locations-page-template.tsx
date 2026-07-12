/*
STORE AREA: Locations
SECTION: Locations Template
SECTION ID: locations.*
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Partially
WHAT THIS CONTROLS: Public store location pages and pickup/local delivery positioning.
SAFE TO EDIT: Location presentation and verified public details.
DO NOT EDIT HERE: Delivery zone polygons, slot capacity, shipping warehouse routing, or Square location IDs.
RELATED FILES: src/config/locations.config.ts
BUSINESS LOGIC FILES: src/features/locations/services/location-service.ts, src/features/fulfillment/services/delivery-zone-service.ts
*/

import { notFound } from "next/navigation";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { getLocationBySlug, storeLocations } from "@/config/locations.config";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";
import { SectionFrame } from "../sections/section-frame";

export async function LocationsIndexTemplate() {
  const publishedDocument = await readLatestCmsDocument({ entityType: "location", entityId: "index", statuses: ["PUBLISHED"] });

  if (publishedDocument) {
    return <StorefrontCmsPage document={publishedDocument} />;
  }

  const publicLocations = storeLocations.filter((location) => location.slug !== "warehouse");

  return (
    <main>
      <SectionFrame area="Locations" className="bg-surface-muted py-16" component="LocationsIndexSection" sectionId="locations.index" variant="location-card-section">
        <div className="container-shell">
          <h1 className="font-display text-4xl font-semibold">Two Upper East Side stores.</h1>
          <p className="mt-4 max-w-2xl text-secondary">Pickup and local delivery will be driven by editable zones, verified server-side address checks, and capacity-point slots.</p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {publicLocations.map((location) => (
              <article className="surface-card p-6" key={location.id}>
                <h2 className="font-display text-2xl font-semibold">{location.name}</h2>
                <p className="mt-2 text-secondary">{location.address}</p>
                <p className="text-secondary">{location.locality}</p>
                <p className="mt-4 font-semibold">{location.phone}</p>
                <p className="text-secondary">{location.hours}</p>
              </article>
            ))}
          </div>
        </div>
      </SectionFrame>
    </main>
  );
}

export async function LocationDetailTemplate({ slug }: { slug: string }) {
  const publishedDocument = await readLatestCmsDocument({ entityType: "location", entityId: slug, statuses: ["PUBLISHED"] });

  if (publishedDocument) {
    return <StorefrontCmsPage document={publishedDocument} />;
  }

  const location = getLocationBySlug(slug);

  if (!location || location.slug === "warehouse") {
    notFound();
  }

  return (
    <main>
      <SectionFrame area="Locations" className="bg-surface-muted py-16" component="LocationDetailSection" sectionId={`locations.${location.slug}`} variant="location-detail">
        <div className="container-shell">
          <h1 className="font-display text-4xl font-semibold">{location.name}</h1>
          <div className="mt-8 grid gap-6 md:grid-cols-[1fr_0.7fr]">
            <div className="surface-card p-6">
              <p className="text-secondary">{location.address}</p>
              <p className="text-secondary">{location.locality}</p>
              <p className="mt-4 font-semibold">{location.phone}</p>
              <p className="text-secondary">{location.hours}</p>
            </div>
            <div className="surface-card p-6">
              <h2 className="font-display text-xl font-semibold">Fulfillment</h2>
              <p className="mt-3 text-sm text-secondary">Pickup and local delivery are enabled after backend availability, delivery zone, and slot-capacity validation.</p>
            </div>
          </div>
        </div>
      </SectionFrame>
    </main>
  );
}
