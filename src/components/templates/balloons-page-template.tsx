/*
STORE AREA: Balloons
SECTION: Balloons Template
SECTION ID: balloons.*
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Partially
WHAT THIS CONTROLS: Balloon landing, builder steps, fulfillment selector, and slot picker shell.
SAFE TO EDIT: Guided-flow presentation and copy.
DO NOT EDIT HERE: Slot locking, delivery zone validation, payment handling, Square access tokens, or inventory deduction.
RELATED FILES: src/config/balloons.config.ts, src/config/departments.config.ts
BUSINESS LOGIC FILES: src/features/balloons/services/balloon-builder-service.ts, src/features/fulfillment/services/slot-capacity-service.ts
*/

import { notFound } from "next/navigation";
import { StorefrontCmsPage } from "@/components/cms/storefront-cms-page";
import { balloonBuilderStepLabels, balloonBuilderSteps, balloonFlows } from "@/config/balloons.config";
import { getDepartmentBySlug } from "@/config/departments.config";
import { readLatestCmsDocument } from "@/server/admin/admin-cms-document-service";
import { ButtonLink } from "../ui/button";
import { SectionFrame } from "../sections/section-frame";

type BalloonsPageTemplateProps = {
  flowSlug?: string;
};

export async function BalloonsPageTemplate({ flowSlug }: BalloonsPageTemplateProps) {
  const publishedDocument = await readLatestCmsDocument({
    entityType: flowSlug ? "landing" : "department",
    entityId: flowSlug ? `balloons-${flowSlug}` : "balloons",
    statuses: ["PUBLISHED"]
  });

  if (publishedDocument) {
    return <StorefrontCmsPage document={publishedDocument} />;
  }

  const balloons = getDepartmentBySlug("balloons");
  const selectedFlow = flowSlug ? balloonFlows.find((flow) => flow.slug === flowSlug) : null;

  if (!balloons || (flowSlug && !selectedFlow && flowSlug !== "local-delivery" && flowSlug !== "pickup")) {
    notFound();
  }

  const title = selectedFlow?.title ?? (flowSlug === "local-delivery" ? "Balloon Local Delivery" : flowSlug === "pickup" ? "Balloon Pickup" : balloons.hero_title_en);
  const body =
    selectedFlow?.description ??
    (flowSlug === "local-delivery"
      ? "Local delivery ordering is coming soon. Contact the store with your address and event date to ask about availability."
      : flowSlug === "pickup"
        ? "Online pickup scheduling is coming soon. Contact your preferred store to confirm balloon choices and timing."
        : balloons.hero_subtitle_en);

  return (
    <main>
      <SectionFrame
        area="Balloons"
        backgroundImage={balloons.hero_image_url}
        className="flex min-h-[440px] items-end bg-cover bg-center text-white"
        component="BalloonsLandingHeroSection"
        sectionId="balloons.landing-hero"
        variant={flowSlug ?? "landing"}
      >
        <div className="container-shell pb-12 pt-28">
          <span className="mb-4 block h-1 w-12 rounded-pill bg-yellow" />
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight md:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-white/88">{body}</p>
          <ButtonLink className="mt-7" href="/balloons/bouquets">
            Explore bouquets
          </ButtonLink>
        </div>
      </SectionFrame>

      <SectionFrame area="Balloons" className="py-16" component="BalloonBuilderSection" sectionId="balloons.builder" variant="guided">
        <div className="container-shell">
          <div className="mb-8 max-w-2xl">
            <h2 className="font-display text-3xl font-semibold">Plan your balloon order</h2>
            <p className="mt-3 text-secondary">Browse balloon types and planning steps, then contact the store to confirm colors, timing, pickup, or local delivery.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {balloonBuilderSteps.map((step) => (
              <BuilderStepCard key={step} step={step} />
            ))}
          </div>
        </div>
      </SectionFrame>

      <SectionFrame area="Balloons" className="bg-surface py-16" component="BalloonTypeSelectorSection" sectionId="balloons.type-selector" variant="flow-cards">
        <div className="container-shell">
          <h2 className="font-display text-3xl font-semibold">Choose a balloon style</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {balloonFlows.map((flow) => (
              <article className="surface-card p-5" key={flow.slug}>
                <h3 className="font-semibold">{flow.title}</h3>
                <p className="mt-2 text-sm text-secondary">{flow.description}</p>
                <ButtonLink className="mt-4 w-full" href={`/balloons/${flow.slug}`} variant="secondary">
                  View options
                </ButtonLink>
              </article>
            ))}
          </div>
        </div>
      </SectionFrame>

      <SectionFrame area="Balloons" className="py-14" component="BalloonFulfillmentSelectorSection" sectionId="balloons.fulfillment-selector" variant="pickup-delivery">
        <div className="container-shell grid gap-5 md:grid-cols-2">
          <div className="surface-card p-6">
            <h2 className="font-display text-2xl font-semibold">Pickup</h2>
            <p className="mt-3 text-secondary">Choose your preferred store and contact us to confirm pickup timing.</p>
          </div>
          <div className="surface-card p-6">
            <h2 className="font-display text-2xl font-semibold">Local delivery</h2>
            <p className="mt-3 text-secondary">Contact us with your delivery address and event date to check availability and pricing.</p>
          </div>
        </div>
      </SectionFrame>

      <SectionFrame area="Balloons" className="bg-surface-muted py-14" component="BalloonTimeSlotPickerSection" sectionId="balloons.time-slot-picker" variant="capacity-points">
        <div className="container-shell">
          <h2 className="font-display text-3xl font-semibold">Timing and availability</h2>
          <p className="mt-3 max-w-2xl text-secondary">Balloon orders may require advance notice. Contact the store to confirm a pickup or delivery window.</p>
        </div>
      </SectionFrame>
    </main>
  );
}

function BuilderStepCard({ step }: { step: (typeof balloonBuilderSteps)[number] }) {
  const sectionId = `balloons.${step}`;
  const label = balloonBuilderStepLabels[step];

  return (
    <article className="surface-card p-5" data-store-area="Balloons" data-store-component="BalloonBuilderStep" data-store-section={sectionId} data-store-variant="builder-step">
      <p className="font-semibold">{label}</p>
      <p className="mt-2 text-sm text-secondary">Choose your preferences. Final availability is confirmed by the store.</p>
    </article>
  );
}
