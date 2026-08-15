/**
 * Renders the compact, CMS-editable party-supplies callout below the homepage feature cards.
 */

import Image from "next/image";

import { ButtonLink } from "@/components/ui/button";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

const PARTY_SUPPLIES_IMAGE =
  "/images/homepage/party-supplies-callout.jpg";

export function HomepagePartySuppliesCard({
  section
}: {
  section?: HomepageSectionConfig;
}) {
  const eyebrow = section?.eyebrow?.trim() || "Party supplies";
  const title =
    section?.title?.trim() || "Set the table. Start the party.";
  const body =
    section?.body?.trim() ||
    "Shop colorful tableware, decorations, candles, favors, and more.";
  const ctaLabel = section?.ctaLabel?.trim() || "Shop Party Supplies";
  const ctaHref = section?.ctaHref?.trim() || "/party-supplies";
  const imageUrl = section?.backgroundImage?.trim() || PARTY_SUPPLIES_IMAGE;
  const imageAlt =
    section?.imageAlt?.trim() ||
    "Colorful party plates, napkins, cups, and cupcakes arranged for a celebration";
  const hiddenElements = new Set(section?.hiddenElements ?? []);

  return (
    <article
      className="group relative mt-4 min-h-[500px] overflow-hidden rounded-[24px] border border-black/10 bg-[#f8f7f5] text-white shadow-[0_24px_60px_rgba(52,34,63,0.18)] sm:mt-5 sm:min-h-[520px] sm:rounded-[30px]"
      data-store-section={
        section?.sectionId ?? "home.party-supplies-callout"
      }
    >
      <Image
        alt={imageAlt}
        className="object-cover object-[center_52%] transition duration-700 group-hover:scale-[1.015]"
        fill
        sizes="100vw"
        src={imageUrl}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/[0.04]"
      />

      <div className="absolute inset-x-4 bottom-4 rounded-[22px] border border-white/20 bg-[#34223f]/90 p-6 shadow-[0_20px_45px_rgba(28,16,35,0.28)] backdrop-blur-md sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[min(520px,calc(100%-3rem))] sm:p-7 md:bottom-8 md:left-8 md:w-[38%] lg:w-[34%] xl:w-[30%]">
        {!hiddenElements.has("eyebrow") ? (
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#dccdf4]">
            {eyebrow}
          </p>
        ) : null}
        {!hiddenElements.has("title") ? (
          <h2 className="mt-2 max-w-[16ch] text-balance font-display text-3xl font-black leading-[0.98] tracking-tight sm:text-4xl md:text-3xl xl:text-4xl">
            {title}
          </h2>
        ) : null}
        {!hiddenElements.has("body") ? (
          <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-white/78 sm:mt-4 sm:text-base">
            {body}
          </p>
        ) : null}
        {!hiddenElements.has("primaryCta") ? (
          <ButtonLink
            className="mt-5 min-h-11 w-fit justify-center gap-3 rounded-pill bg-[#f1e8ff] px-6 py-3 text-sm font-black text-[#34223f] shadow-[0_12px_28px_rgba(18,10,24,0.24)] hover:bg-white"
            href={ctaHref}
          >
            <span>{ctaLabel}</span>
            <span
              aria-hidden="true"
              className="grid h-6 w-6 place-items-center rounded-full bg-[#34223f] text-sm text-white"
            >
              {"\u2192"}
            </span>
          </ButtonLink>
        ) : null}
      </div>
    </article>
  );
}
