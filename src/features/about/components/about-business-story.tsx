/**
 * Introduces Modern State on the About page through alternating story rows.
 */

import Image from "next/image";
import Link from "next/link";

import { SectionFrame } from "@/components/sections/section-frame";
import { cn } from "@/lib/utils";
import { AboutBusinessStoryReveal } from "./about-business-story-reveal";
import styles from "./about-business-story.module.css";

const BUSINESS_STORIES = [
  {
    id: "store-selection",
    eyebrow: "Our history",
    titleLines: ["Our story began", "in 1972."],
    bodyParagraphs: [
      "State News has been operating since 1972. We started out as a single storefront operation in New Jersey which grew into twelve locations.",
      "We then took over all the news stands at the New York Port Authority Bus Terminal.",
      "In 1979 we opened at the present location 1243 Third Avenue on 72nd street. On September 6, 2006 we had a grand opening at 112 East 86th Street."
    ],
    cta: null,
    href: null,
    image: "/images/homepage/modern-state-store-awning.webp",
    imageAlt:
      "Modern State storefront awnings highlighting toys, party supplies, stationery, arts, and crafts",
    imagePosition: "left",
    revealDirection: "left"
  },
  {
    id: "store-history",
    eyebrow: "Our neighborhood",
    titleLines: ["Rooted in our", "neighborhoods."],
    bodyParagraphs: [
      "We are neighborhood stores and cater to each locations\u2019 needs which vary slightly from store to store.",
      "We try our best to keep up with trends and have changed our product mix accordingly. Friendly customer service is a key ingredient in our day to day operation."
    ],
    cta: "Visit our stores",
    href: "/locations",
    image: "/images/homepage/modern-state-third-avenue-storefront.webp",
    imageAlt:
      "The Modern State storefront at 1243 Third Avenue in New York City",
    imagePosition: "right",
    revealDirection: "right"
  }
] as const;

export function AboutBusinessStory() {
  return (
    <SectionFrame
      area="About"
      className="overflow-hidden bg-surface py-10 sm:py-16"
      component="AboutBusinessStory"
      sectionId="about.history"
      variant="business-story"
    >
      <div className="container-shell lg:w-[calc(100%_-_8rem)] lg:max-w-[1600px] xl:w-[calc(100%_-_12rem)]">
        <div className={styles.storyGrid}>
          {BUSINESS_STORIES.map((story, storyIndex) => {
            const Heading = storyIndex === 0 ? "h1" : "h2";

            return (
            <AboutBusinessStoryReveal
              direction={story.revealDirection}
              key={story.id}
            >
              <article className={cn("group", styles.storyRow)}>
                <div
                  className={cn(
                    "relative aspect-[4/3] min-h-[260px] overflow-hidden sm:aspect-[16/10] lg:aspect-[4/3] lg:min-h-0",
                    story.imagePosition === "right" && "lg:order-2"
                  )}
                >
                  <Image
                    alt={story.imageAlt}
                    className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.025]"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    src={story.image}
                  />
                </div>

                <div
                  className={cn(
                    "flex flex-col items-center justify-center py-2 text-center lg:mx-auto lg:w-full lg:max-w-[680px] lg:px-12 xl:px-16",
                    story.imagePosition === "right" && "lg:order-1"
                  )}
                >
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-primary/55">
                    {story.eyebrow}
                  </p>
                  <Heading
                    aria-label={story.titleLines.join(" ")}
                    className="mt-3 font-display text-3xl font-black leading-[1.03] tracking-[-0.02em] text-primary sm:text-4xl lg:text-5xl xl:text-[3.25rem]"
                  >
                    {story.titleLines.map((line) => (
                      <span aria-hidden="true" className="block" key={line}>
                        {line}
                      </span>
                    ))}
                  </Heading>
                  <div className="mt-6 grid max-w-[58ch] gap-3 text-base font-semibold leading-relaxed text-primary/70 sm:text-lg">
                    {story.bodyParagraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                  {story.cta && story.href ? (
                    <Link
                      className="mt-8 inline-flex w-fit items-center gap-3 border-b border-primary pb-1 text-sm font-black uppercase tracking-[0.08em] text-primary transition-opacity hover:opacity-55"
                      href={story.href}
                    >
                      <span>{story.cta}</span>
                      <span
                        aria-hidden="true"
                        className="text-lg leading-none transition-transform duration-300 group-hover:translate-x-0.5"
                      >
                        {"\u2192"}
                      </span>
                    </Link>
                  ) : null}
                </div>
              </article>
            </AboutBusinessStoryReveal>
            );
          })}
        </div>
      </div>
    </SectionFrame>
  );
}
