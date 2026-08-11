/**
 * Defines the departments configuration used by the application.
 */

import type { ProductCardVariant } from "@/design/presets/card-presets";
import type { ProductGridPresetId } from "@/design/presets/product-grid-presets";

export type DepartmentConfig = {
  slug: string;
  title_en: string;
  short_title_en: string;
  description_en: string;
  hero_title_en: string;
  hero_subtitle_en: string;
  seo_title_en: string;
  seo_description_en: string;
  hero_image_url: string;
  mobile_hero_image_url: string;
  accent_color_token: string;
  sort_order: number;
  navigation_priority: "primary" | "secondary";
  is_primary_nav: boolean;
  is_visible: boolean;
  layout_preset: string;
  product_grid_preset: ProductGridPresetId;
  product_card_variant: ProductCardVariant;
  created_at: string;
  updated_at: string;
};

const now = "2026-07-08T00:00:00.000Z";

export const departments: DepartmentConfig[] = [
  {
    slug: "toys",
    title_en: "Toys",
    short_title_en: "Toys",
    description_en: "Classic favorites, new discoveries, games, building sets, dolls, puzzles, plush, and toys for every age.",
    hero_title_en: "Upper East Side toys with neighborhood taste.",
    hero_subtitle_en: "A modern home for the State News toy selection: useful, joyful, and easy to shop online or in store.",
    seo_title_en: "Upper East Side Toy Store | Modern State - State News NYC",
    seo_description_en: "Shop toys, games, building sets, dolls, plush, and creative play favorites from Modern State on NYC's Upper East Side.",
    hero_image_url: "/images/homepage/toys-age-interest-banner-edge-to-edge-v2.webp",
    mobile_hero_image_url: "/images/homepage/toys-age-interest-banner-edge-to-edge-v2.webp",
    accent_color_token: "--color-legacy-blue",
    sort_order: 10,
    navigation_priority: "primary",
    is_primary_nav: true,
    is_visible: true,
    layout_preset: "department-hero",
    product_grid_preset: "editorial",
    product_card_variant: "premium",
    created_at: now,
    updated_at: now
  },
  {
    slug: "party-supplies",
    title_en: "Party Supplies",
    short_title_en: "Party",
    description_en: "Birthday, graduation, shower, wedding, sports, tableware, decorations, gift wrap, invitations, and event essentials.",
    hero_title_en: "Party supplies for every Upper East Side celebration.",
    hero_subtitle_en: "Build the table, wrap the gift, finish the theme, and keep the day moving.",
    seo_title_en: "Upper East Side Party Supplies | Modern State - State News NYC",
    seo_description_en: "Shop party supplies, tableware, decorations, invitations, gift wrap, and event essentials from Modern State in NYC.",
    hero_image_url: "/images/homepage/party-supplies-callout.jpg",
    mobile_hero_image_url: "/images/homepage/party-supplies-callout.jpg",
    accent_color_token: "--color-legacy-red",
    sort_order: 20,
    navigation_priority: "primary",
    is_primary_nav: true,
    is_visible: true,
    layout_preset: "department-hero",
    product_grid_preset: "editorial",
    product_card_variant: "premium",
    created_at: now,
    updated_at: now
  },
  {
    slug: "balloons",
    title_en: "Balloons",
    short_title_en: "Balloons",
    description_en: "Latex, mylar, numbers, letters, bouquets, custom notes, store pickup, and local delivery guided by event timing.",
    hero_title_en: "Balloons planned around your moment.",
    hero_subtitle_en: "Choose the type, colors, add-ons, and either store pickup or local delivery with a guided shopping flow.",
    seo_title_en: "Upper East Side Balloons and NYC Balloon Delivery | Modern State",
    seo_description_en: "Order balloons for store pickup or local delivery from Modern State on the Upper East Side.",
    hero_image_url: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=1800&q=80",
    mobile_hero_image_url: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=900&q=80",
    accent_color_token: "--color-legacy-yellow",
    sort_order: 30,
    navigation_priority: "primary",
    is_primary_nav: true,
    is_visible: true,
    layout_preset: "department-hero",
    product_grid_preset: "balloons",
    product_card_variant: "balloons",
    created_at: now,
    updated_at: now
  },
  {
    slug: "stationery",
    title_en: "Stationery",
    short_title_en: "Stationery",
    description_en: "Office, school, project, desk, planner, writing, paper, and everyday supplies.",
    hero_title_en: "Stationery for school, desk, and daily errands.",
    hero_subtitle_en: "The dependable State News mix, edited into a cleaner online shopping experience.",
    seo_title_en: "Upper East Side Stationery Store | Modern State NYC",
    seo_description_en: "Shop stationery, school supplies, planners, paper, pens, pencils, folders, and desk essentials in NYC.",
    hero_image_url: "https://images.unsplash.com/photo-1456735190827-d1262f71b8a3?auto=format&fit=crop&w=1800&q=80",
    mobile_hero_image_url: "https://images.unsplash.com/photo-1456735190827-d1262f71b8a3?auto=format&fit=crop&w=900&q=80",
    accent_color_token: "--color-legacy-navy",
    sort_order: 40,
    navigation_priority: "secondary",
    is_primary_nav: false,
    is_visible: true,
    layout_preset: "department-hero",
    product_grid_preset: "compact",
    product_card_variant: "minimal",
    created_at: now,
    updated_at: now
  },
  {
    slug: "arts-and-crafts",
    title_en: "Arts & Crafts",
    short_title_en: "Arts & Crafts",
    description_en: "Art supplies, craft materials, paints, brushes, canvases, school projects, and creative kits.",
    hero_title_en: "Creative supplies ready for the next project.",
    hero_subtitle_en: "Practical, colorful, and easy to browse for kids, families, teachers, and makers.",
    seo_title_en: "Upper East Side Arts and Crafts Supplies | Modern State NYC",
    seo_description_en: "Shop arts and crafts supplies, creative kits, paints, brushes, canvases, and project materials at Modern State.",
    hero_image_url: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1800&q=80",
    mobile_hero_image_url: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=900&q=80",
    accent_color_token: "--color-legacy-green",
    sort_order: 50,
    navigation_priority: "secondary",
    is_primary_nav: false,
    is_visible: true,
    layout_preset: "department-hero",
    product_grid_preset: "editorial",
    product_card_variant: "image-focused",
    created_at: now,
    updated_at: now
  },
  {
    slug: "greeting-cards",
    title_en: "Greeting Cards",
    short_title_en: "Cards",
    description_en: "Birthday, thank-you, invitation, seasonal, religious, holiday, blank, and everyday greeting cards.",
    hero_title_en: "A card for the thing you meant to say.",
    hero_subtitle_en: "Occasion-led browsing for cards, notes, and the small finishing touches that matter.",
    seo_title_en: "Greeting Cards on the Upper East Side | Modern State NYC",
    seo_description_en: "Shop greeting cards for birthdays, thank-you notes, invitations, holidays, religious occasions, and everyday moments.",
    hero_image_url: "https://images.unsplash.com/photo-1512909006721-3d6018887383?auto=format&fit=crop&w=1800&q=80",
    mobile_hero_image_url: "https://images.unsplash.com/photo-1512909006721-3d6018887383?auto=format&fit=crop&w=900&q=80",
    accent_color_token: "--color-legacy-red",
    sort_order: 60,
    navigation_priority: "secondary",
    is_primary_nav: false,
    is_visible: true,
    layout_preset: "department-hero",
    product_grid_preset: "category-card",
    product_card_variant: "minimal",
    created_at: now,
    updated_at: now
  },
  {
    slug: "gifts",
    title_en: "Gifts",
    short_title_en: "Gifts",
    description_en: "Neighborhood-ready gifts, gift wrap, frames, photo albums, candles, small finds, and occasion picks.",
    hero_title_en: "Useful gifts with a local point of view.",
    hero_subtitle_en: "Easy-to-love finds for birthdays, hosts, teachers, thank-yous, and last-minute visits.",
    seo_title_en: "Upper East Side Gifts | Modern State - State News NYC",
    seo_description_en: "Shop gifts, gift wrap, frames, photo albums, candles, and local favorites from Modern State on the Upper East Side.",
    hero_image_url: "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=1800&q=80",
    mobile_hero_image_url: "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=900&q=80",
    accent_color_token: "--color-legacy-navy",
    sort_order: 70,
    navigation_priority: "secondary",
    is_primary_nav: false,
    is_visible: true,
    layout_preset: "department-hero",
    product_grid_preset: "editorial",
    product_card_variant: "premium",
    created_at: now,
    updated_at: now
  }
];

export function getDepartmentBySlug(slug: string) {
  return departments.find((department) => department.slug === slug);
}
