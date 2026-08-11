/**
 * Rotates the Halloween homepage campaign artwork with accessible controls.
 */

"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

import styles from "./halloween-hero-carousel.module.css";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

const ROTATION_INTERVAL_MS = 15_000;

const fallbackSlides = [
  {
    image: "/images/homepage/halloween-hero-01-bg.png",
    alt: "Spiderwebs, a witch crossing an orange moon, and a haunted house",
    variant: "red",
    words: ["Halloween", "Headquarters"],
    body: "Costumes, decorations, candy and party-night surprises.",
    href: "/shop",
    ctaLabel: "Shop Halloween"
  },
  {
    image: "/images/homepage/halloween-hero-02-bg.png",
    alt: "A purple Halloween night with a witch, ghost, pumpkin, bat and black cat",
    variant: "moon",
    words: ["Happy", "Halloween"],
    body: "Get the best costumes, decorations, accessories and candy in all of NYC.",
    href: "/shop",
    ctaLabel: "Shop Halloween"
  },
  {
    image: "/images/homepage/halloween-hero-03-bg.png",
    alt: "A dancing skeleton and stacked pumpkins beneath a canopy of spiderwebs",
    variant: "navy",
    words: ["Your", "Halloween", "Headquarters"],
    body: "Everything for a frightfully fun celebration, all in one place.",
    href: "/shop",
    ctaLabel: "Shop Halloween"
  }
] as const;

type WordStyle = CSSProperties & {
  "--word-delay": string;
};

export function HalloweenHeroCarousel({ section }: { section: HomepageSectionConfig }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const slides = resolveSlides(section);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (isPaused || prefersReducedMotion) return;

    const timeout = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, ROTATION_INTERVAL_MS);

    return () => window.clearTimeout(timeout);
  }, [activeIndex, isPaused, prefersReducedMotion, slides.length]);

  const selectSlide = (index: number) => {
    setActiveIndex((index + slides.length) % slides.length);
  };

  return (
    <div
      aria-label="Halloween featured collections"
      aria-roledescription="carousel"
      className={styles.carousel}
      role="region"
    >
      <div className={styles.slides}>
        {slides.map((slide, slideIndex) => {
          const isActive = slideIndex === activeIndex;

          return (
            <article
              aria-hidden={!isActive}
              aria-label={`${slideIndex + 1} of ${slides.length}`}
              className={`${styles.slide} ${styles[slide.variant]} ${isActive ? styles.active : ""}`}
              inert={!isActive ? true : undefined}
              key={slide.image}
            >
              <Image
                alt={slide.alt}
                className={styles.background}
                fill
                priority={slideIndex === 0}
                sizes="100vw"
                src={slide.image}
              />
              <div aria-hidden="true" className={styles.atmosphere} />

              <div className={styles.copy}>
                <h1 className={styles.title}>
                  {slide.words.map((word, wordIndex) => (
                    <span
                      className={styles.word}
                      key={word}
                      style={{ "--word-delay": `${180 + wordIndex * 170}ms` } as WordStyle}
                    >
                      <span className={styles.wordText}>{word}</span>
                      <span aria-hidden="true" className={styles.glitch} data-text={word} />
                    </span>
                  ))}
                </h1>
                <p className={styles.body}>{slide.body}</p>
                <Link className={styles.cta} href={slide.href}>
                  {slide.ctaLabel}
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <div className={styles.controls}>
        <div aria-label="Choose a Halloween feature" className={styles.dots} role="group">
          {slides.map((slide, index) => (
            <button
              aria-label={
                index === activeIndex
                  ? isPaused
                    ? `Resume automatic rotation on Halloween feature ${index + 1}`
                    : `Pause automatic rotation on Halloween feature ${index + 1}`
                  : `Show Halloween feature ${index + 1}`
              }
              aria-pressed={index === activeIndex}
              className={styles.dot}
              key={slide.image}
              onClick={() => {
                if (index === activeIndex) {
                  setIsPaused((current) => !current);
                  return;
                }

                selectSlide(index);
                setIsPaused(false);
              }}
              title={
                index === activeIndex
                  ? isPaused
                    ? "Resume slideshow"
                    : "Pause slideshow"
                  : `Show slide ${index + 1}`
              }
              type="button"
            >
              <span className={styles.srOnly}>{index + 1}</span>
            </button>
          ))}
        </div>
      </div>

      {!isPaused && !prefersReducedMotion ? (
        <div aria-hidden="true" className={styles.progress} key={activeIndex}>
          <span />
        </div>
      ) : null}
    </div>
  );
}

function resolveSlides(section: HomepageSectionConfig) {
  const configuredItems = section.items?.filter((item) => item.title.trim()) ?? [];

  if (configuredItems.length === 0) return fallbackSlides;

  return configuredItems.slice(0, 3).map((item, index) => {
    const fallback = fallbackSlides[index % fallbackSlides.length];
    const title = index === 0 && section.title.trim() ? section.title : item.title;

    return {
      image: item.image || fallback.image,
      alt: item.imageAlt || fallback.alt,
      variant: fallback.variant,
      words: splitHeroTitle(title),
      body: index === 0 && section.body.trim() ? section.body : item.body?.trim() || fallback.body,
      href: item.href?.trim() || section.ctaHref?.trim() || fallback.href,
      ctaLabel: section.ctaLabel?.trim() || fallback.ctaLabel
    };
  });
}

function splitHeroTitle(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);

  if (words.length <= 2) return words;
  if (words.length === 3) return words;

  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
}
