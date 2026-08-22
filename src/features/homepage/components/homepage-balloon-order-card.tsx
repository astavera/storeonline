/**
 * Renders a responsive homepage callout that guides shoppers to balloon ordering.
 */

import Image from "next/image";
import { ShoppingBag, Truck } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

const BALLOON_ORDER_IMAGE =
  "/images/balloons/standard-foil-balloon-bouquet-cutout-v2.png";

const BALLOON_PROMO_COPY = {
  title: "Looking for balloons?",
  body: "Create a custom bouquet or choose a ready-made design.",
  ctaLabel: "Start your order"
};

const LEGACY_BALLOON_PROMO_COPY = {
  title: "Plan your balloon order",
  body: "Choose latex, mylar, numbers, or a ready-made bouquet, then select pickup or local delivery.",
  ctaLabel: "Explore balloons"
};

function resolvePromoCopy(value: string | undefined, legacyValue: string, nextValue: string) {
  const normalizedValue = value?.trim();

  return !normalizedValue || normalizedValue === legacyValue
    ? nextValue
    : normalizedValue;
}

export function HomepageBalloonOrderCard({ section }: { section?: HomepageSectionConfig }) {
  const title = resolvePromoCopy(section?.title, LEGACY_BALLOON_PROMO_COPY.title, BALLOON_PROMO_COPY.title);
  const body = resolvePromoCopy(section?.body, LEGACY_BALLOON_PROMO_COPY.body, BALLOON_PROMO_COPY.body);
  const ctaLabel = resolvePromoCopy(section?.ctaLabel, LEGACY_BALLOON_PROMO_COPY.ctaLabel, BALLOON_PROMO_COPY.ctaLabel);
  const ctaHref = section?.ctaHref?.trim() || "/balloons";
  const imageUrl = section?.backgroundImage?.trim() || BALLOON_ORDER_IMAGE;
  const imageAlt = section?.imageAlt?.trim() || "A colorful bouquet of standard foil birthday balloons";
  const hiddenElements = new Set(section?.hiddenElements ?? []);

  return (
    <article
      className="homepage-card relative isolate overflow-hidden bg-[#fffdfa] text-primary"
      data-store-section={section?.sectionId ?? "home.balloon-promo"}
    >
      <div className="relative grid lg:min-h-[500px] lg:grid-cols-[minmax(0,0.95fr)_minmax(280px,1.05fr)] lg:items-center">
        <div className="relative z-20 flex flex-col items-start px-6 pb-5 pt-8 sm:px-10 sm:pb-7 sm:pt-10 lg:px-10 lg:py-12 xl:px-14">
          {!hiddenElements.has("title") ? <h2 className="max-w-[11ch] text-balance font-display text-4xl font-black leading-[0.96] tracking-tight sm:text-5xl xl:text-[3.75rem]">{title}</h2> : null}
          {!hiddenElements.has("body") ? <p className="mt-5 max-w-[31rem] text-base font-semibold leading-relaxed text-primary/75 sm:text-lg">{body}</p> : null}

          <div aria-label="Balloon order fulfillment options" className="mt-6 flex flex-wrap gap-2" role="list">
            <div className="flex min-h-14 w-28 items-center gap-2 rounded-xl border border-[#d9cef3] bg-[#faf7ff]/90 px-3 py-2 shadow-sm" role="listitem">
              <ShoppingBag aria-hidden="true" className="size-5 shrink-0 text-[#6547c7]" strokeWidth={1.8} />
              <span className="text-xs font-bold leading-tight text-primary sm:text-sm">In-store pickup</span>
            </div>
            <div className="flex min-h-14 w-28 items-center gap-2 rounded-xl border border-[#f0cedc] bg-[#fff8fb]/90 px-3 py-2 shadow-sm" role="listitem">
              <Truck aria-hidden="true" className="size-5 shrink-0 text-[#dd6699]" strokeWidth={1.8} />
              <span className="text-xs font-bold leading-tight text-primary sm:text-sm">Local delivery</span>
            </div>
          </div>

          {!hiddenElements.has("primaryCta") ? <ButtonLink
            className="mt-4 min-h-12 w-full max-w-60 justify-center gap-3 rounded-pill bg-black px-6 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(0,0,0,0.18)] hover:bg-[#292929]"
            href={ctaHref}
          >
            <span>{ctaLabel}</span>
            <span
              aria-hidden="true"
              className="grid h-7 w-7 place-items-center rounded-full bg-white/15 text-base"
            >
              {"\u2192"}
            </span>
          </ButtonLink> : null}
        </div>

        <div className="relative min-h-[330px] overflow-hidden sm:min-h-[400px] lg:h-full lg:min-h-[500px]">
          <div
            aria-hidden="true"
            className="absolute left-[56%] top-[47%] z-0 aspect-square w-[76%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#dcd0f3]/75"
          />
          <div
            aria-hidden="true"
            className="absolute left-[54%] top-[67%] z-0 aspect-square w-[66%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f7dce8]/65"
          />
          <div
            aria-hidden="true"
            className="absolute left-[29%] top-[56%] z-0 aspect-square w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#bfe8f7]/90"
          />

          <div className="absolute inset-x-1 inset-y-0 z-10 sm:inset-x-5 lg:-left-6 lg:right-0 lg:inset-y-1">
            <Image
              alt={imageAlt}
              className="object-contain object-center drop-shadow-[0_24px_28px_rgba(45,33,64,0.26)]"
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
