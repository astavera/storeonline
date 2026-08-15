/**
 * Renders the complete toys banner and its three responsive shop shortcuts.
 */

"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

const TOYS_BANNER_IMAGE =
  "/images/homepage/toys-age-interest-banner-edge-to-edge-v2.webp";

const toyShopLinks = [
  {
    className: "bg-[#1a3c8d] text-white hover:bg-[#163478]",
    href: "/toys",
    label: "Shop All Toys"
  },
  {
    className:
      "border-y border-[#062c68]/12 bg-[#f7bb5e] text-[#062c68] hover:bg-[#ffcf24]",
    href: "/shop?department=toys",
    label: "Shop By Age"
  },
  {
    className: "bg-[#c72d43] text-white hover:bg-[#ad2438]",
    href: "/shop?department=toys&feature=new-and-trending",
    label: "Shop Trending"
  }
] as const;

export function HomepageToysAgeInterestCard({ section }: { section?: HomepageSectionConfig }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;

    if (!section) return;

    if (
      typeof window.IntersectionObserver === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      const revealTimer = window.setTimeout(() => setIsRevealed(true), 0);

      return () => window.clearTimeout(revealTimer);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;

        setIsRevealed(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -8%", threshold: 0.18 }
    );

    observer.observe(section);

    return () => observer.disconnect();
  }, []);

  const revealClass = isRevealed
    ? "translate-y-0 opacity-100"
    : "translate-y-5 opacity-0";
  const configuredLinks = section?.items?.length
    ? section.items.slice(0, 3).map((item, index) => ({
        className: toyShopLinks[index]?.className ?? toyShopLinks[0].className,
        href: item.href || "/toys",
        label: item.title || toyShopLinks[index]?.label || "Shop Toys"
      }))
    : [...toyShopLinks];

  return (
    <article
      className="min-w-0 overflow-hidden rounded-[24px] bg-white shadow-[0_18px_45px_rgba(6,44,104,0.08)] sm:rounded-[30px]"
      data-revealed={isRevealed ? "true" : "false"}
      data-store-section="home.toys-age-interest"
      ref={sectionRef}
    >
      <div className="grid lg:grid-cols-[minmax(0,72fr)_minmax(285px,28fr)] lg:items-stretch">
        <Link
          aria-label="Shop toys by age and interest"
          className={`block min-w-0 overflow-hidden bg-white transition-[opacity,transform] duration-500 ease-out focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-4 focus-visible:outline-inset focus-visible:outline-[#ffcf24] motion-reduce:transform-none motion-reduce:transition-none ${revealClass}`}
          href="/toys"
          style={{ transitionDelay: isRevealed ? "0ms" : "0ms" }}
        >
          <Image
            alt="Hot Wheels, Barbie, and Fisher-Price toys for different ages and interests"
            className="block h-auto w-full"
            height={840}
            priority={false}
            sizes="(min-width: 1024px) 72vw, calc(100vw - 2rem)"
            src={TOYS_BANNER_IMAGE}
            unoptimized
            width={1871}
          />
        </Link>

        <nav
          aria-label="Shop toys"
          className="relative z-[1] grid min-w-0 grid-rows-3"
        >
          {configuredLinks.map((item, index) => (
            <Link
              className={`flex min-h-[88px] items-center justify-between gap-5 px-6 py-5 font-display text-xl font-black uppercase tracking-[-0.025em] transition-[background-color,opacity,transform] duration-500 ease-out focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-4 focus-visible:outline-inset focus-visible:outline-white motion-reduce:transform-none motion-reduce:transition-none sm:min-h-[100px] sm:px-8 sm:text-2xl lg:min-h-0 xl:px-10 xl:text-[clamp(1.35rem,1.7vw,2rem)] ${item.className} ${revealClass}`}
              href={item.href}
              key={item.label}
              style={{ transitionDelay: isRevealed ? `${90 + index * 90}ms` : "0ms" }}
            >
              <span>{item.label}</span>
              <ArrowRight
                aria-hidden="true"
                className="shrink-0"
                strokeWidth={2.5}
              />
            </Link>
          ))}
        </nav>
      </div>
    </article>
  );
}
