/*
STORE AREA: Balloons
SECTION: Balloons Template
SECTION ID: balloons.*
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Partially
WHAT THIS CONTROLS: Balloon landing and guided catalog entry.
SAFE TO EDIT: Guided-flow presentation and copy.
DO NOT EDIT HERE: Delivery validation, payment handling, Square access tokens, or inventory deduction.
RELATED FILES: src/config/departments.config.ts
BUSINESS LOGIC FILES: src/features/fulfillment/services/slot-capacity-service.ts
*/

import { BalloonsLandingExperience } from "@/components/balloons/balloons-landing-experience";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { getDepartmentBySlug } from "@/config/departments.config";
import { readPublishedStorefrontCmsDocument } from "@/server/storefront/published-cms-document";

type BalloonsPageTemplateProps = {
  initialCollection?: string;
};

export async function BalloonsPageTemplate({ initialCollection }: BalloonsPageTemplateProps) {
  const publishedDocument = await readPublishedStorefrontCmsDocument({
    entityType: "department",
    entityId: "balloons"
  });

  if (publishedDocument?.sections.some((section) => section.id === "balloons.catalog-gate" || section.variant === "balloon-catalog-gate")) {
    return <StorefrontCmsPage document={publishedDocument} />;
  }

  const balloons = getDepartmentBySlug("balloons");

  return (
    <BalloonsLandingExperience
      body={balloons?.hero_subtitle_en ?? "Choose balloons for pickup or local delivery."}
      initialCollection={initialCollection}
      title={balloons?.hero_title_en ?? "Balloons planned around your moment."}
    />
  );
}
