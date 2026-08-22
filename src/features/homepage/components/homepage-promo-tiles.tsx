/**
 * Renders the supporting homepage campaign tiles without a featured promotion.
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SectionFrame } from "@/components/sections/section-frame";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

type HomepagePromoTile = {
  cta: string;
  href: string;
  image: string;
  imageAlt: string;
};

const PROMO_TILES: HomepagePromoTile[] = [
  {
    cta: "Costumes",
    href: "/shop",
    image: "/images/homepage/promo-posters/costumes-poster-v1.png",
    imageAlt: "Children wearing Halloween costumes"
  },
  {
    cta: "Plan a Party",
    href: "/party-supplies",
    image: "/images/homepage/promo-posters/party-poster-v1.png",
    imageAlt: "Halloween party decorations"
  },
  {
    cta: "Accessories",
    href: "/halloween-accessories",
    image: "/images/homepage/promo-posters/accessories-poster-v1.png",
    imageAlt: "Halloween costume accessories"
  },
  {
    cta: "Home Decor",
    href: "/halloween-home-decor",
    image: "/images/homepage/promo-posters/decor-poster-v1.png",
    imageAlt: "Halloween home decorations"
  }
];

export function HomepagePromoTiles({ section }: { section?: HomepageSectionConfig }) {
  if (section?.isVisible === false) return null;

  const tiles: HomepagePromoTile[] = section?.items?.length
    ? section.items.map((item, index) => ({
        cta: item.title || `Promotion ${index + 1}`,
        href: item.href || "/shop",
        image: item.image || PROMO_TILES[index % PROMO_TILES.length].image,
        imageAlt: item.imageAlt || item.title || `Promotion ${index + 1}`
      }))
    : PROMO_TILES;

  return (
    <SectionFrame
      area="Homepage"
      className="bg-surface pb-6 pt-2 sm:pb-8 sm:pt-3"
      component="HomepagePromoTiles"
      sectionId="home.retail-promos"
      variant="promo-tiles"
    >
      <div className="container-shell homepage-wide-shell">
        <div className="mb-5 flex justify-end sm:mb-6">
          <Link
            className="inline-flex shrink-0 items-center gap-2 rounded-pill border border-ink/15 bg-white px-5 py-3 text-sm font-black text-primary transition hover:border-primary hover:bg-surface-muted"
            href="/holidays/halloween"
          >
            View all Halloween
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </Link>
        </div>
        <div className="-mx-4 grid snap-x snap-mandatory grid-flow-col auto-cols-[82%] gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
          {tiles.map((tile, index) => (
            <HomepagePromoCard key={`${tile.href}-${index}`} tile={tile} />
          ))}
        </div>
      </div>
    </SectionFrame>
  );
}

function HomepagePromoCard({ tile }: { tile: HomepagePromoTile }) {
  return (
    <article className="homepage-card group relative aspect-[4/5] min-w-0 snap-center overflow-hidden bg-white first:snap-start sm:snap-align-none">
      <Link
        aria-label={tile.cta}
        className="absolute inset-0 block outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        href={tile.href}
      >
        <Image
          alt={tile.imageAlt}
          className="object-cover transition duration-500 ease-out group-hover:scale-[1.025]"
          fill
          sizes="(max-width: 640px) 82vw, (max-width: 1279px) 50vw, 25vw"
          src={tile.image}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-0 flex justify-center px-5 pb-5 pt-20 sm:px-6 sm:pb-6">
          <h3 className="inline-flex min-h-11 items-center justify-center rounded-pill bg-white px-5 py-2.5 text-center text-base font-black leading-tight tracking-[-0.02em] text-ink shadow-md transition-transform duration-200 group-hover:-translate-y-0.5 sm:text-lg">
            {tile.cta}
          </h3>
        </div>
      </Link>
    </article>
  );
}
