/**
 * Renders a compact, continuously moving brand carousel selected in the Homepage Website Editor.
 */

import Image from "next/image";
import Link from "next/link";

import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

import styles from "./homepage-featured-brands-carousel.module.css";

export function HomepageFeaturedBrandsCarousel({
  editorPreview = false,
  forceVisible = false,
  section
}: {
  editorPreview?: boolean;
  forceVisible?: boolean;
  section?: HomepageSectionConfig;
}) {
  const brands = uniqueBrandItems(section);
  const previewPlaceholderCount = editorPreview
    ? Math.max(0, 8 - brands.length)
    : 0;
  const carouselItemCount = brands.length + previewPlaceholderCount;
  const animationDuration = Math.max(42, carouselItemCount * 5);

  if (
    (!forceVisible && section?.isVisible === false) ||
    (!editorPreview && brands.length === 0)
  ) {
    return null;
  }

  return (
    <section
      aria-label="Featured brands"
      className="mt-8 sm:mt-10"
      data-store-section={
        section?.sectionId ?? "home.featured-brands-carousel"
      }
    >
      <div
        aria-label="Featured brands"
        className={`${styles.viewport} -mx-1 px-1 pb-3`}
        role="region"
      >
        <div
          className={styles.track}
          style={{ animationDuration: `${animationDuration}s` }}
        >
          <BrandCarouselGroup
            brands={brands}
            duplicate
            previewPlaceholderCount={previewPlaceholderCount}
          />
          <BrandCarouselGroup
            brands={brands}
            previewPlaceholderCount={previewPlaceholderCount}
          />
        </div>
      </div>
    </section>
  );
}

function BrandCarouselGroup({
  brands,
  duplicate = false,
  previewPlaceholderCount
}: {
  brands: ReturnType<typeof uniqueBrandItems>;
  duplicate?: boolean;
  previewPlaceholderCount: number;
}) {
  return (
    <div aria-hidden={duplicate || undefined} className="flex shrink-0 gap-3 pr-3">
      {brands.map((brand) => (
        <Link
          aria-label={`Shop ${brand.title}`}
          className="relative grid aspect-square w-[140px] min-w-[140px] place-items-center overflow-hidden rounded-[20px] border border-black/10 bg-white p-5 shadow-[0_10px_25px_rgba(0,0,0,0.05)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f527f] sm:w-[160px] sm:min-w-[160px]"
          href={brand.href!}
          key={`${duplicate ? "duplicate-" : ""}${brand.id}`}
          tabIndex={duplicate ? -1 : undefined}
        >
          <Image
            alt={brand.imageAlt || `${brand.title} logo`}
            className="max-h-full w-full object-contain"
            height={120}
            src={brand.image!}
            unoptimized
            width={160}
          />
        </Link>
      ))}
      {Array.from({ length: previewPlaceholderCount }, (_, index) => (
          <div
            aria-hidden="true"
            className="grid aspect-square w-[140px] min-w-[140px] place-items-center rounded-[20px] border border-dashed border-black/15 bg-[#f6f6f6] p-5 sm:w-[160px] sm:min-w-[160px]"
            data-brand-placeholder="true"
            key={`${duplicate ? "duplicate-" : ""}brand-placeholder-${index + 1}`}
          >
            <div className="grid h-full w-full place-items-center rounded-[14px] bg-white/80">
              <span className="h-12 w-12 rounded-full bg-black/[0.05]" />
            </div>
          </div>
      ))}
    </div>
  );
}

function uniqueBrandItems(section?: HomepageSectionConfig) {
  const seen = new Set<string>();

  return (section?.items ?? []).filter((item) => {
    const key = item.linkValue?.trim() || item.href?.trim();
    const isBrand =
      item.linkType === "brand" &&
      Boolean(key) &&
      Boolean(item.href?.trim()) &&
      Boolean(item.image?.trim()) &&
      Boolean(item.title?.trim());

    if (!isBrand || !key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
