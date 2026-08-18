/**
 * Renders configurable homepage hero variants and their seasonal presentation.
 */

import { SectionFrame } from "@/components/sections/section-frame";
import { ButtonLink } from "@/components/ui/button";
import {
  defaultHomepageImage,
  type HomepageSectionConfig
} from "@/features/homepage/config/homepage.config";
import {
  getHomepageHeroCardPositionClass,
  isHomepageSectionElementVisible
} from "@/features/homepage/utils/homepage-section-styles";
import { cn } from "@/lib/utils";
import { HalloweenHeroCarousel } from "./halloween-hero-carousel";

export function HomepageHeroSection({
  section
}: {
  section: HomepageSectionConfig;
}) {
  const isBackToSchoolHero = section.variant === "back-to-school";
  const isSeasonalCardHero = section.variant === "seasonal-card";
  const heroImage = section.backgroundImage || defaultHomepageImage;
  const isHalloweenHeroCard =
    isSeasonalCardHero && section.sectionId === "home.hero";
  const showPrimaryCta =
    isHomepageSectionElementVisible(section, "primaryCta") &&
    Boolean(section.ctaHref);
  const secondaryCtaHref =
    section.secondaryCtaHref ||
    (isBackToSchoolHero
      ? "/stationery"
      : isSeasonalCardHero
        ? "/party-supplies"
        : "/balloons");
  const secondaryCtaLabel =
    section.secondaryCtaLabel ||
    (isBackToSchoolHero
      ? "Build a School Kit"
      : isSeasonalCardHero
        ? "Browse party supplies"
        : "Balloon order");
  const showSecondaryCta =
    isHomepageSectionElementVisible(section, "secondaryCta") &&
    Boolean(secondaryCtaHref && secondaryCtaLabel);
  const heroSizeClasses = {
    compact:
      "min-h-[520px] py-8 sm:min-h-[680px] sm:py-10 lg:min-h-[calc(100svh-96px)] lg:py-12",
    standard:
      "min-h-[calc(100svh-96px)] py-10 sm:min-h-[calc(100svh-106px)] sm:py-12 lg:min-h-[calc(100svh-96px)] lg:py-16",
    large:
      "min-h-[calc(100svh-96px)] py-10 sm:min-h-[calc(108svh-106px)] sm:py-12 lg:min-h-[calc(100svh-96px)] lg:py-16",
    fullscreen:
      "min-h-[100svh] py-10 sm:py-12 lg:min-h-[calc(100svh-96px)] lg:py-16"
  } as const;

  if (isHalloweenHeroCard) {
    return (
      <SectionFrame
        area="Homepage"
        className="homepage-full-hero relative isolate overflow-hidden bg-primary text-white sm:pb-0 sm:pt-6"
        component="HomepageHeroSection"
        sectionId={section.sectionId}
        variant={section.variant}
      >
        <div className="homepage-hero-stage">
          <HalloweenHeroCarousel section={section} />
        </div>
      </SectionFrame>
    );
  }

  return (
    <SectionFrame
      area="Homepage"
      className={cn(
        "homepage-full-hero relative isolate overflow-hidden bg-primary text-white",
        heroImage && "homepage-full-hero--has-image"
      )}
      component="HomepageHeroSection"
      sectionId={section.sectionId}
      variant={section.variant}
    >
      {heroImage ? (
        <div
          aria-hidden="true"
          className="homepage-hero-bg"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
      ) : null}
      {isBackToSchoolHero && !heroImage ? (
        <BackToSchoolHeroBackdrop />
      ) : null}
      <div
        className={cn(
          "container-shell relative z-10 flex flex-col justify-center gap-8",
          heroSizeClasses[section.heroSize ?? "large"]
        )}
      >
        <div
          className={cn(
            "homepage-hero-copy",
            isSeasonalCardHero
              ? "homepage-seasonal-hero-card max-w-2xl"
              : "mx-auto max-w-5xl text-center",
            isSeasonalCardHero &&
              getHomepageHeroCardPositionClass(section)
          )}
        >
          {isHomepageSectionElementVisible(section, "eyebrow") &&
          section.eyebrow ? (
            <p
              className={cn(
                "inline-flex rounded-pill px-4 py-2 text-xs font-black uppercase tracking-[0.14em]",
                isSeasonalCardHero
                  ? "bg-primary text-white"
                  : "bg-yellow text-primary"
              )}
            >
              {section.eyebrow}
            </p>
          ) : null}
          {isHomepageSectionElementVisible(section, "title") &&
          section.title ? (
            <h1
              className={cn(
                "mt-5 font-display text-4xl font-black sm:text-5xl md:text-7xl",
                isSeasonalCardHero
                  ? "max-w-xl text-center leading-[0.92] text-primary"
                  : "mx-auto max-w-5xl uppercase leading-[0.94] text-white drop-shadow xl:text-8xl",
                isBackToSchoolHero && "leading-[0.86] xl:text-[6.5rem]"
              )}
            >
              {section.title}
            </h1>
          ) : null}
          {isHomepageSectionElementVisible(section, "body") &&
          section.body ? (
            <p
              className={cn(
                "homepage-hero-body mt-5 max-w-3xl text-lg font-bold leading-relaxed md:text-xl",
                isSeasonalCardHero
                  ? "text-primary"
                  : "mx-auto text-white"
              )}
            >
              {section.body}
            </p>
          ) : null}
          {showPrimaryCta || showSecondaryCta ? (
            <div
              className={cn(
                "mt-8 flex flex-wrap justify-center gap-3",
                isSeasonalCardHero && "homepage-seasonal-hero-actions"
              )}
            >
              {showPrimaryCta ? (
                <ButtonLink
                  className={cn(
                    "w-full justify-center px-8 py-3.5 text-base font-black sm:w-auto sm:px-10 sm:py-4",
                    isSeasonalCardHero
                      ? "rounded-sm bg-primary text-white hover:bg-blue"
                      : "rounded-pill bg-white text-primary hover:bg-yellow"
                  )}
                  href={section.ctaHref || "/shop"}
                >
                  {section.ctaLabel}
                </ButtonLink>
              ) : null}
              {showSecondaryCta ? (
                <ButtonLink
                  className={cn(
                    "w-full justify-center px-8 py-3.5 text-base font-black sm:w-auto sm:px-10 sm:py-4",
                    isSeasonalCardHero
                      ? "rounded-sm border-2 border-primary bg-transparent text-primary hover:bg-white/35"
                      : "rounded-pill bg-yellow text-blue hover:bg-cyan"
                  )}
                  href={secondaryCtaHref}
                >
                  {secondaryCtaLabel}
                </ButtonLink>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </SectionFrame>
  );
}

function BackToSchoolHeroBackdrop() {
  return (
    <div aria-hidden="true" className="homepage-back-to-school-shapes">
      <span className="homepage-school-paper" />
      <span className="homepage-school-pencil" />
      <span className="homepage-school-ruler" />
      <span className="homepage-school-eraser" />
    </div>
  );
}
