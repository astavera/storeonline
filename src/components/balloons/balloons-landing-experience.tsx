import { BalloonCatalogGate } from "@/components/balloons/balloon-catalog-gate";
import { SectionFrame } from "@/components/sections/section-frame";

type BalloonsLandingExperienceProps = {
  title: string;
  body: string;
  initialCollection?: string;
};

export function BalloonsLandingExperience({ title, body, initialCollection }: BalloonsLandingExperienceProps) {
  return (
    <main className="balloons-landing-page">
      <SectionFrame
        area="Balloons"
        className="balloons-playful-hero"
        component="BalloonsLandingHeroSection"
        sectionId="balloons.landing-hero"
        variant="balloon-links"
      >
        <div className="container-shell balloons-playful-hero__inner">
          <p className="balloons-eyebrow">Balloons</p>

          <BalloonCatalogGate initialCollection={initialCollection} />

          <h1 className="sr-only">{title}</h1>
          <p className="sr-only">{body}</p>
        </div>
      </SectionFrame>

    </main>
  );
}
