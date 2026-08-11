/**
 * Renders the compact, CMS-editable toys callout below the party-supplies card.
 */

import Image from "next/image";

import { ButtonLink } from "@/components/ui/button";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

const TOYS_IMAGE = "/images/homepage/toys-callout-istock.webp";

export function HomepageToysCard({
  section
}: {
  section?: HomepageSectionConfig;
}) {
  const ctaLabel = section?.ctaLabel?.trim() || "Shop Toys";
  const ctaHref = section?.ctaHref?.trim() || "/toys";
  const imageUrl = section?.backgroundImage?.trim() || TOYS_IMAGE;
  const imageAlt =
    section?.imageAlt?.trim() ||
    "Child playing with colorful wooden sorting toys on a tabletop";

  return (
    <article
      className="group relative h-full w-full overflow-hidden rounded-[24px] border border-black/10 text-[#062c68] shadow-[0_20px_50px_rgba(6,44,104,0.13)] sm:rounded-[30px]"
      data-store-section={section?.sectionId ?? "home.toys-callout"}
    >
      <div className="aspect-[3/2] h-full shrink-0 overflow-hidden bg-[#f4dfc4] lg:aspect-auto">
        <Image
          alt={imageAlt}
          className="h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.015]"
          height={408}
          sizes="(min-width: 1024px) 32vw, calc(100vw - 2rem)"
          src={imageUrl}
          unoptimized
          width={612}
        />
      </div>

      <ButtonLink
        className="absolute left-1/2 top-5 z-10 min-h-11 w-fit -translate-x-1/2 justify-center whitespace-nowrap rounded-pill bg-[#ffcf24] px-7 py-3 text-sm font-black text-[#062c68] shadow-[0_10px_24px_rgba(6,44,104,0.18)] hover:bg-white"
        href={ctaHref}
      >
        {ctaLabel}
      </ButtonLink>
    </article>
  );
}
