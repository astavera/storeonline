/**
 * Presents approved solid-color tableware assets as a compact category navigator.
 */

import Image from "next/image";
import Link from "next/link";

const solidCategoryCards = [
  {
    label: "Plates",
    type: "plates",
    images: ["/images/party-supplies/solid-blue/royal-blue-plates.png"]
  },
  {
    label: "Napkins",
    type: "napkins",
    images: ["/images/party-supplies/solid-blue/royal-blue-napkins.png"]
  },
  {
    label: "Cups",
    type: "cups",
    images: ["/images/party-supplies/solid-blue/royal-blue-cups.png"]
  },
  {
    label: "Cutlery",
    type: "cutlery",
    images: ["/images/party-supplies/solid-blue/royal-blue-spoons.png"]
  },
  {
    label: "Table Covers",
    type: "table-covers",
    images: ["/images/party-supplies/solid-blue/royal-blue-table-covers.png"]
  }
] as const;

export function PartySolidCategoryShowcase() {
  return (
    <section aria-labelledby="party-solid-category-title" className="border-y border-blue/10 bg-[#f6f8fc] py-7 sm:py-9">
      <div className="department-commerce-shell">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-2xl font-black tracking-tight text-primary sm:text-3xl" id="party-solid-category-title">Shop solid colors</h2>
          <Link className="hidden text-sm font-bold text-blue hover:text-navy sm:inline" href="/party-supplies?collection=solids#catalog">Shop all solids</Link>
        </div>
        <div className="mt-6 flex snap-x gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0">
          {solidCategoryCards.map((card) => (
            <Link className="group w-24 shrink-0 snap-start text-center sm:w-auto sm:min-w-0" href={`/party-supplies?collection=solids&type=${card.type}#catalog`} key={card.type}>
              <span className="relative mx-auto flex aspect-square w-full max-w-[112px] items-center justify-center overflow-hidden rounded-full border border-blue/10 bg-white p-4 shadow-sm transition duration-300 group-hover:-translate-y-1 group-hover:border-blue/35 group-hover:shadow-md sm:max-w-[126px]">
                {card.images.map((image) => (
                  <span className={`relative block h-full ${card.images.length > 1 ? "w-1/2" : "w-full"}`} key={image}>
                    <Image alt="" className={`object-contain mix-blend-multiply ${card.type === "table-covers" ? "scale-90" : ""}`} fill sizes="126px" src={image} />
                  </span>
                ))}
              </span>
              <span className="mt-3 block truncate text-sm font-black text-primary transition group-hover:text-blue">{card.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
