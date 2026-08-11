/**
 * Prevents production deploys from omitting storefront images that are
 * referenced by committed homepage and CMS defaults.
 */

import { statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const requiredProductionImages = [
  "public/images/balloons/standard-foil-balloon-bouquet-cutout-v2.png",
  "public/images/categories/outdoor-toys-collage-cutout-v5.png",
  "public/images/homepage/halloween-hero-01-bg.png",
  "public/images/homepage/halloween-hero-02-bg.png",
  "public/images/homepage/halloween-hero-03-bg.png",
  "public/images/homepage/halloween-party-card.jpg",
  "public/images/homepage/home-hero-back-to-school-ecommerce-wireframe.svg",
  "public/images/homepage/modern-state-store-awning.webp",
  "public/images/homepage/modern-state-third-avenue-storefront.webp",
  "public/images/homepage/party-supplies-callout.jpg",
  "public/images/homepage/toys-age-interest-banner-edge-to-edge-v2.webp",
  "public/images/homepage/toys-callout-istock.webp",
  "public/uploads/admin/188bd680-3391-456f-b87f-86bbe8701ded.png",
  "public/uploads/admin/20260714185434-web-brand-caspari-images.png",
  "public/uploads/admin/912104fc-801d-43b0-ae30-bd13d19277f2.png",
  "public/uploads/admin/dc2209c9-9ea9-4d50-ad28-549aa5390aa8.png"
] as const;

describe("production storefront image assets", () => {
  it.each(requiredProductionImages)("includes a non-empty %s", (relativePath) => {
    const stats = statSync(path.join(process.cwd(), relativePath));

    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
  });
});
