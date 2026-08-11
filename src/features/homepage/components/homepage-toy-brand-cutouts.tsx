/**
 * Renders four selected brand logos as circular cutouts beneath the toys showcase.
 */

import Image from "next/image";
import Link from "next/link";

import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import type { HomepageSectionConfig } from "@/features/homepage/config/homepage.config";

export function HomepageToyBrandCutouts({
  products,
  section
}: {
  products: StorefrontProduct[];
  section?: HomepageSectionConfig;
}) {
  const brands = displayBrands(section, products).slice(0, 4);

  if (brands.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="toy-brand-cutouts-title" className="mt-6 rounded-[24px] bg-[#fffaf0] px-5 py-7 sm:rounded-[30px] sm:px-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#155bc2]">
            {section?.eyebrow?.trim() || "Brands"}
          </p>
          <h2 className="mt-1 font-display text-2xl font-black text-[#062c68] sm:text-3xl" id="toy-brand-cutouts-title">
            {section?.title?.trim() || "Four names to discover."}
          </h2>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="grid min-w-[640px] grid-cols-4 gap-5">
          {brands.map((brand, index) => (
            <Link
              className="group flex min-w-0 flex-col items-center text-center"
              href={brand.href}
              key={brand.id}
            >
              <span
                className={`grid aspect-square w-full max-w-[150px] place-items-center overflow-hidden rounded-full border border-black/10 p-7 shadow-[0_12px_30px_rgba(6,44,104,0.09)] transition duration-300 group-hover:-translate-y-1 group-hover:border-[#155bc2]/35 ${
                  ["bg-white", "bg-[#e9f7ff]", "bg-[#fff1bd]", "bg-[#f3eaff]"][index]
                }`}
              >
                {brand.image ? (
                  <Image
                    alt={brand.imageAlt || `${brand.title} logo`}
                    className="max-h-full w-full object-contain"
                    height={110}
                    src={brand.image}
                    unoptimized
                    width={140}
                  />
                ) : (
                  <span className="font-display text-3xl font-black tracking-tight text-[#062c68]">
                    {brandInitials(brand.title)}
                  </span>
                )}
              </span>
              <span className="mt-3 line-clamp-1 text-sm font-black text-[#062c68] group-hover:text-[#155bc2]">
                {brand.title}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

type DisplayBrand = {
  href: string;
  id: string;
  image?: string;
  imageAlt?: string;
  title: string;
};

function displayBrands(
  section: HomepageSectionConfig | undefined,
  products: StorefrontProduct[]
) {
  const seen = new Set<string>();
  const brands: DisplayBrand[] = [];

  (section?.items ?? []).forEach((item) => {
    const key = item.linkValue?.trim() || item.href?.trim();
    const isBrand =
      item.linkType === "brand" &&
      Boolean(key) &&
      Boolean(item.href?.trim()) &&
      Boolean(item.image?.trim()) &&
      Boolean(item.title?.trim());

    if (!isBrand || !key || seen.has(key)) return;

    seen.add(key);
    brands.push({
      href: item.href!,
      id: item.id,
      image: item.image,
      imageAlt: item.imageAlt,
      title: item.title
    });
  });

  products.forEach((product) => {
    (product.squareVendorNames ?? []).forEach((vendorName) => {
      const title = vendorName.trim();
      const key = title.toLowerCase();

      if (!title || seen.has(key)) return;

      seen.add(key);
      brands.push({
        href: "/toys",
        id: `toy-vendor-${normalizeId(title)}`,
        title
      });
    });
  });

  return brands;
}

function brandInitials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function normalizeId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
