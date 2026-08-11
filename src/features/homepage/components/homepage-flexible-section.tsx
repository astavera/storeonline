/**
 * Renders flexible CMS-driven homepage sections, cards, trust items, and FAQs.
 */

import { ProductCard } from "@/components/commerce/product-card";
import { SectionFrame } from "@/components/sections/section-frame";
import { ButtonLink } from "@/components/ui/button";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import {
  defaultHomepageImage,
  type HomepageSectionConfig,
  type HomepageSectionItem
} from "@/features/homepage/config/homepage.config";
import {
  getHomepageSectionColumnsClass,
  getHomepageSectionContentWidthClass,
  getHomepageSectionPaddingClass,
  getHomepageSectionToneClass,
  getHomepageSectionType,
  getHomepageTextPositionClass,
  getHomepageTextWidthClass,
  isHomepageSectionElementVisible
} from "@/features/homepage/utils/homepage-section-styles";
import { cn } from "@/lib/utils";
import Image from "next/image";

export function HomepageFlexibleSection({
  products,
  section
}: {
  products: StorefrontProduct[];
  section: HomepageSectionConfig;
}) {
  const sectionType = getHomepageSectionType(section);
  const hasImage =
    Boolean(section.backgroundImage) && section.mediaPlacement !== "none";
  const image = hasImage ? (
    <Image
      alt={section.imageAlt || section.title}
      className="aspect-[4/3] h-full w-full rounded-md object-cover"
      height={600}
      loading="lazy"
      src={section.backgroundImage || defaultHomepageImage}
      unoptimized
      width={800}
    />
  ) : null;

  if (sectionType === "trust-bar") {
    return (
      <SectionFrame
        area="Homepage"
        className={cn(
          getHomepageSectionToneClass(section),
          getHomepageSectionPaddingClass(section)
        )}
        component="HomepageTrustBarSection"
        sectionId={section.sectionId}
        variant={section.variant}
      >
        <div className="container-shell">
          <HomepageInlineItemGrid
            items={section.items ?? []}
            tone={
              section.backgroundTone === "dark" ||
              section.backgroundTone === "brand"
                ? "dark"
                : "light"
            }
          />
        </div>
      </SectionFrame>
    );
  }

  if (sectionType === "faq") {
    return (
      <SectionFrame
        area="Homepage"
        className={cn(
          getHomepageSectionToneClass(section),
          getHomepageSectionPaddingClass(section)
        )}
        component="HomepageFaqSection"
        sectionId={section.sectionId}
        variant={section.variant}
      >
        <div
          className={cn(
            "container-shell",
            getHomepageSectionContentWidthClass(section)
          )}
        >
          <HomepageSectionIntro section={section} />
          <div className="mt-8 grid gap-3">
            {(section.items ?? []).map((item) => (
              <details
                className="rounded-md border border-border bg-surface p-5"
                key={item.id}
              >
                <summary className="cursor-pointer font-semibold">
                  {item.title}
                </summary>
                {item.body ? (
                  <p className="mt-3 text-sm text-secondary">{item.body}</p>
                ) : null}
              </details>
            ))}
          </div>
        </div>
      </SectionFrame>
    );
  }

  if (sectionType === "split-media") {
    return (
      <SectionFrame
        area="Homepage"
        className={cn(
          getHomepageSectionToneClass(section),
          getHomepageSectionPaddingClass(section)
        )}
        component="HomepageSplitMediaSection"
        sectionId={section.sectionId}
        variant={section.variant}
      >
        <div className="container-shell grid gap-8 lg:grid-cols-2 lg:items-center">
          {section.mediaPlacement === "left" ? image : null}
          <div>
            <HomepageSectionIntro section={section} />
            {section.items?.length ? (
              <HomepageSectionItemCards
                className="mt-7"
                items={section.items}
                products={products}
                section={section}
              />
            ) : null}
          </div>
          {section.mediaPlacement !== "left" ? image : null}
        </div>
      </SectionFrame>
    );
  }

  return (
    <SectionFrame
      area="Homepage"
      backgroundImage={
        section.mediaPlacement === "background"
          ? section.backgroundImage
          : undefined
      }
      className={cn(
        getHomepageSectionToneClass(section),
        getHomepageSectionPaddingClass(section),
        section.mediaPlacement === "background" && "bg-cover text-white"
      )}
      component="HomepageFlexibleSection"
      sectionId={section.sectionId}
      variant={section.variant}
    >
      <div
        className={cn(
          "container-shell",
          getHomepageSectionContentWidthClass(section)
        )}
      >
        <HomepageSectionIntro section={section} />
        {isHomepageSectionElementVisible(section, "primaryCta") &&
        section.ctaHref ? (
          <ButtonLink
            className="mt-7"
            href={section.ctaHref}
            variant={
              section.mediaPlacement === "background"
                ? "primary"
                : "secondary"
            }
          >
            {section.ctaLabel || "Learn more"}
          </ButtonLink>
        ) : null}
        {isHomepageSectionElementVisible(section, "items") &&
        section.items?.length ? (
          <HomepageSectionItemCards
            className="mt-8"
            items={section.items}
            products={products}
            section={section}
          />
        ) : null}
      </div>
    </SectionFrame>
  );
}

function HomepageSectionIntro({
  section
}: {
  section: HomepageSectionConfig;
}) {
  const isDark =
    section.backgroundTone === "dark" ||
    section.backgroundTone === "brand" ||
    section.mediaPlacement === "background";

  return (
    <div
      className={cn(
        "max-w-3xl",
        getHomepageTextPositionClass(section),
        getHomepageTextWidthClass(section)
      )}
    >
      {isHomepageSectionElementVisible(section, "eyebrow") &&
      section.eyebrow ? (
        <p
          className={cn(
            "text-sm font-semibold uppercase tracking-[0.16em]",
            isDark ? "text-white/75" : "text-secondary"
          )}
        >
          {section.eyebrow}
        </p>
      ) : null}
      {isHomepageSectionElementVisible(section, "title") && section.title ? (
        <h2 className="mt-3 font-display text-3xl font-semibold md:text-4xl">
          {section.title}
        </h2>
      ) : null}
      {isHomepageSectionElementVisible(section, "body") && section.body ? (
        <p
          className={cn(
            "mt-4",
            isDark ? "text-white/82" : "text-secondary"
          )}
        >
          {section.body}
        </p>
      ) : null}
    </div>
  );
}

function HomepageSectionItemCards({
  className,
  items,
  products,
  section
}: {
  className?: string;
  items: HomepageSectionItem[];
  products: StorefrontProduct[];
  section: HomepageSectionConfig;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        getHomepageSectionColumnsClass(section),
        className
      )}
    >
      {items.map((item) => (
        <HomepageItemCard item={item} key={item.id} products={products} />
      ))}
    </div>
  );
}

function HomepageItemCard({
  item,
  products
}: {
  item: HomepageSectionItem;
  products: StorefrontProduct[];
}) {
  const linkedProduct = item.productSlug
    ? products.find((product) => product.slug === item.productSlug)
    : null;

  if (linkedProduct) {
    return <ProductCard product={linkedProduct} variant="premium" />;
  }

  return (
    <article className="surface-card p-5">
      {item.image ? (
        <Image
          alt={item.imageAlt || item.title}
          className="mb-4 aspect-[4/3] w-full rounded-md object-cover"
          height={600}
          loading="lazy"
          src={item.image}
          unoptimized
          width={800}
        />
      ) : null}
      {item.badge ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-secondary">
          {item.badge}
        </p>
      ) : null}
      <h3 className="font-display text-xl font-semibold">{item.title}</h3>
      {item.body ? (
        <p className="mt-2 text-sm text-secondary">{item.body}</p>
      ) : null}
      {item.href ? (
        <ButtonLink
          className="mt-4 min-h-9 px-3 py-2"
          href={item.href}
          variant="secondary"
        >
          {item.label || "View"}
        </ButtonLink>
      ) : null}
    </article>
  );
}

function HomepageInlineItemGrid({
  className,
  items,
  tone
}: {
  className?: string;
  items: HomepageSectionItem[];
  tone: "dark" | "light";
}) {
  const displayItems =
    items.length > 0
      ? items
      : [
          { id: "trust", title: "Secure checkout" },
          { id: "pickup", title: "Store pickup" },
          { id: "delivery", title: "Local delivery" }
        ];

  return (
    <div
      className={cn(
        "grid gap-3 md:grid-cols-3 lg:grid-cols-4",
        className
      )}
    >
      {displayItems.map((item) => (
        <div
          className={cn(
            "rounded-md border px-4 py-3 text-sm font-semibold",
            tone === "dark"
              ? "border-white/20 bg-white/10 text-white"
              : "border-border bg-surface text-primary"
          )}
          key={item.id}
        >
          {item.title}
          {item.body ? (
            <p
              className={cn(
                "mt-1 text-xs font-normal",
                tone === "dark" ? "text-white/75" : "text-secondary"
              )}
            >
              {item.body}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
