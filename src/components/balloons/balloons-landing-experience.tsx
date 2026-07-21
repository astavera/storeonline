import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { BalloonCatalogGate } from "@/components/balloons/balloon-catalog-gate";
import { SectionFrame } from "@/components/sections/section-frame";
import { ButtonLink } from "@/components/ui/button";
import { balloonFlows } from "@/config/balloons.config";

type BalloonsLandingExperienceProps = {
  title: string;
  body: string;
  heroImage: string;
  initialCollection?: string;
};

const flowCollection: Record<string, string> = {
  latex: "latex",
  mylar: "mylar",
  "numbers-letters": "numbers",
  bouquets: "bouquets"
};

export function BalloonsLandingExperience({ title, body, heroImage, initialCollection }: BalloonsLandingExperienceProps) {
  const galleryStyle = {
    backgroundImage: `linear-gradient(180deg, rgba(6, 44, 104, 0.04), rgba(6, 44, 104, 0.2)), url(${heroImage})`
  } satisfies CSSProperties;

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

      <SectionFrame
        area="Balloons"
        className="balloons-directory-section"
        component="BalloonTypeSelectorSection"
        sectionId="balloons.type-selector"
        variant="link-directory"
      >
        <div className="container-shell">
          <div className="balloons-section-heading">
            <p className="balloons-eyebrow">Find your starting point</p>
            <h2>Everything balloons, all in one place.</h2>
            <p>Browse by balloon type, then choose pickup or check whether local delivery is available for your address.</p>
          </div>

          <div className="balloons-directory-grid">
            {balloonFlows.map((flow) => (
              <DirectoryLink
                description={flow.description}
                eyebrow="Balloon type"
                href={`/balloons?collection=${flowCollection[flow.slug] ?? flow.slug}`}
                key={flow.slug}
                title={flow.title}
              />
            ))}
          </div>
        </div>
      </SectionFrame>

      <SectionFrame
        area="Balloons"
        className="balloons-showcase-section"
        component="BalloonArrangementShowcaseSection"
        sectionId="balloons.arrangement-showcase"
        variant="animated-mosaic"
      >
        <div className="container-shell">
          <div className="balloons-section-heading balloons-section-heading--light">
            <p className="balloons-eyebrow">Ideas for your celebration</p>
            <h2>Arrangements with personality.</h2>
            <p>Use these colors, shapes, and playful combinations as a starting point for your own order.</p>
          </div>

          <div className="balloons-showcase-grid">
            <div
              aria-label="Featured balloon arrangement photo slot"
              className="balloons-showcase-image balloons-showcase-image--feature"
              data-image-slot="balloons-showcase-feature"
              role="img"
              style={galleryStyle}
            />

            <div className="balloons-showcase-stack" aria-label="Additional arrangement photo slots">
              {["detail-one", "detail-two", "detail-three"].map((slot, index) => (
                <div
                  aria-label={`Balloon arrangement photo slot ${index + 2}`}
                  className={`balloons-showcase-image balloons-showcase-image--detail balloons-showcase-image--detail-${index + 1}`}
                  data-image-slot={`balloons-showcase-${slot}`}
                  key={slot}
                  role="img"
                  style={galleryStyle}
                />
              ))}
            </div>

            <article className="balloons-cloud-card">
              <div className="balloons-cloud-card__content">
                <p className="balloons-eyebrow">Made here, for your moment</p>
                <h3>A little lift for every kind of celebration.</h3>
                <p>From one thoughtful balloon to a full bouquet, we help you choose the colors, shapes, and timing that fit the day.</p>
                <ButtonLink href="/balloons?collection=bouquets" variant="secondary">
                  Explore bouquets
                </ButtonLink>
              </div>
            </article>
          </div>
        </div>
      </SectionFrame>
    </main>
  );
}

function DirectoryLink({
  eyebrow,
  title,
  description,
  href
}: {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link className="balloons-directory-link" href={href}>
      <span className="balloons-directory-link__eyebrow">{eyebrow}</span>
      <span className="balloons-directory-link__title">
        {title}
        <ArrowUpRight aria-hidden="true" size={19} />
      </span>
      <span className="balloons-directory-link__description">{description}</span>
    </Link>
  );
}
