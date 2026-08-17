/**
 * Renders a responsive homepage callout that guides shoppers to balloon ordering.
 */

import Image from "next/image";

import { ButtonLink } from "@/components/ui/button";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

const BALLOON_ORDER_IMAGE =
  "/images/balloons/standard-foil-balloon-bouquet-cutout-v2.png";

export function HomepageBalloonOrderCard({ section }: { section?: HomepageSectionConfig }) {
  const title = section?.title?.trim() || "Bring Your Celebration to Life";
  const body = section?.body?.trim() || "Balloons are available for store pickup or local delivery. Order online and choose the option that works for your celebration.";
  const ctaLabel = section?.ctaLabel?.trim() || "Order Balloons";
  const ctaHref = section?.ctaHref?.trim() || "/balloons";
  const imageUrl = section?.backgroundImage?.trim() || BALLOON_ORDER_IMAGE;
  const imageAlt = section?.imageAlt?.trim() || "A colorful bouquet of standard foil birthday balloons";
  const hiddenElements = new Set(section?.hiddenElements ?? []);

  return (
    <article
      className="homepage-card relative isolate overflow-hidden bg-[#f3efff] text-primary"
      data-store-section={section?.sectionId ?? "home.balloon-promo"}
    >
      <div
        aria-hidden="true"
        className="absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[#ccefff] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-28 right-[18%] h-72 w-72 rounded-full bg-[#ffd7e5] blur-3xl"
      />

      <div className="relative grid lg:min-h-[470px] lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)] lg:items-center">
        <div className="flex flex-col items-start px-6 pb-4 pt-8 sm:px-10 sm:pb-6 sm:pt-10 lg:px-10 lg:py-12 xl:px-14">
          {!hiddenElements.has("title") ? <h2 className="max-w-[12ch] text-balance font-display text-4xl font-black leading-[0.95] tracking-tight sm:text-5xl xl:text-6xl">{title}</h2> : null}
          {!hiddenElements.has("body") ? <p className="mt-5 max-w-xl text-base font-semibold leading-relaxed text-primary/70 sm:text-lg">{body}</p> : null}
          {!hiddenElements.has("primaryCta") ? <ButtonLink
            className="mt-7 min-h-12 w-full justify-center rounded-pill bg-[#7560a8] px-8 py-3.5 text-base font-black text-white shadow-[0_14px_35px_rgba(75,57,115,0.24)] hover:bg-primary sm:w-fit"
            href={ctaHref}
          >
            {ctaLabel}
          </ButtonLink> : null}
        </div>

        <div className="relative min-h-[290px] overflow-hidden sm:min-h-[360px] lg:h-full lg:min-h-[470px]">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 z-0 aspect-square w-[58%] max-w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#cfc3ea] shadow-[0_24px_54px_rgba(86,65,130,0.2)] ring-1 ring-white/70 sm:w-[54%] lg:w-[68%]"
          />
          <div className="absolute inset-x-3 inset-y-1 z-10 sm:inset-x-8 sm:inset-y-3 lg:inset-x-0 lg:inset-y-2">
            <Image
              alt={imageAlt}
              className="object-contain object-center drop-shadow-[0_24px_28px_rgba(45,33,64,0.3)]"
              fill
              sizes="(max-width: 1024px) 92vw, 420px"
              src={imageUrl}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
