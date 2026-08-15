/**
 * Renders the supporting homepage campaign tiles without a featured promotion.
 */

import Image from "next/image";

import { SectionFrame } from "@/components/sections/section-frame";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

type HomepagePromoTile = {
  cta: string;
  href: string;
  image: string;
  imageAlt: string;
  imageClassName?: string;
  backgroundColor?: string;
};

const PROMO_TILES: HomepagePromoTile[] = [
  {
    cta: "Costumes",
    href: "/shop",
    image:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRARUJ5P6KooB1Y2umV3lgboOLbFqw7BsBt79Q229OmVw&s=10",
    imageAlt: "Children wearing Halloween costumes",
    backgroundColor: "bg-blue"
  },
  {
    cta: "Plan a party",
    href: "/party-supplies",
    image: "/images/homepage/halloween-party-card.jpg",
    imageAlt: "Halloween party decorations",
    imageClassName:
      "object-[center_34%] sm:object-[center_38%] lg:object-center",
    backgroundColor: "bg-primary"
  },
  {
    cta: "Shop Accessories",
    href: "/halloween-accessories",
    image:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTMnGgsR0pz39Uq4yYj-62DX88i-yMAW9uhbAiB_13zow&s=10",
    imageAlt: "Halloween costume accessories",
    backgroundColor: "bg-red"
  },
  {
    cta: "Home Decor",
    href: "/halloween-home-decor",
    image:"https://media.istockphoto.com/id/1178228622/photo/a-house-with-halloween-pumpkins-and-halloween-decorations-at-halloween-night-on-a-city-street.jpg?b=1&s=612x612&w=0&k=20&c=PoDOq8w_kY3pXOFbkD3QXb2FmW_O2OWU2UViMkLdjBU=",
    imageAlt: "Halloween home decorations",
    backgroundColor: "bg-purple"
  }
];

export function HomepagePromoTiles({ section }: { section?: HomepageSectionConfig }) {
  if (section?.isVisible === false) return null;

  const tiles: HomepagePromoTile[] = section?.items?.length
    ? section.items.map((item, index) => ({
        cta: item.title || `Promotion ${index + 1}`,
        href: item.href || "/shop",
        image: item.image || PROMO_TILES[index % PROMO_TILES.length].image,
        imageAlt: item.imageAlt || item.title || `Promotion ${index + 1}`,
        backgroundColor: toneClassName(item.tone) ?? PROMO_TILES[index % PROMO_TILES.length].backgroundColor
      }))
    : PROMO_TILES;

  return (
    <SectionFrame
      area="Homepage"
      className="bg-surface py-4 sm:py-5"
      component="HomepagePromoTiles"
      sectionId="home.retail-promos"
      variant="promo-tiles"
    >
      <div className="container-shell homepage-wide-shell">
        <div className="-mx-4 grid snap-x snap-mandatory grid-flow-col auto-cols-[82%] gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
          {tiles.map((tile, index) => (
            <HomepagePromoCard key={`${tile.href}-${index}`} tile={tile} />
          ))}
        </div>
      </div>
    </SectionFrame>
  );
}

function toneClassName(tone?: string) {
  if (tone === "cyan") return "bg-blue";
  if (tone === "red") return "bg-red";
  if (tone === "green") return "bg-green";
  if (tone === "yellow") return "bg-yellow";
  return undefined;
}

function HomepagePromoCard({ tile }: { tile: HomepagePromoTile }) {
  return (
    <article
      className={cn(
        "relative min-h-[250px] snap-center overflow-hidden rounded-[18px] first:snap-start sm:min-h-[360px] sm:snap-align-none sm:rounded-md lg:min-h-[520px]",
        tile.backgroundColor ?? "bg-blue",
        "text-white"
      )}
    >
      <Image
        alt={tile.imageAlt}
        className={cn("object-cover", tile.imageClassName)}
        fill
        sizes="(max-width: 640px) 82vw, (max-width: 1024px) 50vw, 25vw"
        src={tile.image}
        unoptimized
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/5" />
      <div className="relative flex min-h-[250px] flex-col justify-center p-5 sm:min-h-[360px] sm:p-8 lg:min-h-[520px] lg:p-6">
        <ButtonLink
          className="absolute bottom-4 left-1/2 min-h-11 max-w-[calc(100%_-_2rem)] -translate-x-1/2 justify-center whitespace-nowrap rounded-pill bg-white px-6 py-3 text-sm font-black text-primary shadow-lg hover:bg-yellow sm:bottom-6 sm:px-8"
          href={tile.href}
        >
          {tile.cta}
        </ButtonLink>
      </div>
    </article>
  );
}
