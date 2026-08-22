/**
 * Renders the balloons landing experience interface and its user interactions.
 */

import { BalloonCatalogGate } from "@/components/balloons/balloon-catalog-gate";
import { SectionFrame } from "@/components/sections/section-frame";

type BalloonsLandingExperienceProps = {
  title: string;
  body: string;
  embedded?: boolean;
  initialCollection?: string;
  previewMode?: boolean;
};

export function BalloonsLandingExperience({ title, body, embedded = false, initialCollection, previewMode = false }: BalloonsLandingExperienceProps) {
  const Root = embedded ? "div" : "main";

  return (
    <Root className="balloons-landing-page">
      <SectionFrame
        area="Balloons"
        className="balloons-playful-hero"
        component="BalloonsLandingHeroSection"
        sectionId="balloons.landing-hero"
        variant="balloon-links"
      >
        <div className="container-shell balloons-playful-hero__inner">
          <BalloonCatalogGate initialCollection={initialCollection} previewMode={previewMode} />

          <h1 className="sr-only">{title}</h1>
          <p className="sr-only">{body}</p>
        </div>
      </SectionFrame>

    </Root>
  );
}
