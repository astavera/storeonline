/**
 * Defines the holidays configuration used by the application.
 */

import type { ProductCardVariant } from "@/design/presets/card-presets";
import type { ProductGridPresetId } from "@/design/presets/product-grid-presets";

export type HolidayConfig = {
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
  custom_accent_color: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_visible: boolean;
  sort_order: number;
  layout_preset: string;
  product_grid_preset: ProductGridPresetId;
  product_card_variant: ProductCardVariant;
  created_at: string;
  updated_at: string;
};

const now = "2026-07-08T00:00:00.000Z";

export const holidays: HolidayConfig[] = [
  {
    slug: "back-to-school",
    title_en: "Back to School",
    short_title_en: "Back to School",
    description_en: "School supplies, stationery, art essentials, teacher gifts, and small rewards for the first weeks back.",
    hero_title_en: "First day, fully ready.",
    hero_subtitle_en: "Notebooks, pencils, planners, art supplies, teacher gifts, and after-school rewards from your neighborhood State News store.",
    seo_title_en: "Back to School Supplies and Gifts | Modern State NYC",
    seo_description_en: "Shop Back to School supplies, stationery, art kits, teacher gifts, and first-day essentials from Modern State on the Upper East Side.",
    hero_image_url: "https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?auto=format&fit=crop&w=1800&q=80",
    mobile_hero_image_url: "https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?auto=format&fit=crop&w=900&q=80",
    accent_color_token: "--color-legacy-yellow",
    custom_accent_color: null,
    start_date: "2026-06-15",
    end_date: "2026-09-15",
    is_active: true,
    is_visible: true,
    sort_order: 5,
    layout_preset: "holiday-hero",
    product_grid_preset: "holiday-card",
    product_card_variant: "image-focused",
    created_at: now,
    updated_at: now
  },
  {
    slug: "valentines-day",
    title_en: "Valentine's Day",
    short_title_en: "Valentine's",
    description_en: "Cards, small gifts, balloons, party touches, and seasonal sweets assigned by admin.",
    hero_title_en: "Thoughtful Valentine's Day finds.",
    hero_subtitle_en: "Editable seasonal merchandising for cards, gifts, and balloons.",
    seo_title_en: "Valentine's Day Gifts and Cards | Modern State NYC",
    seo_description_en: "Shop Valentine's Day cards, gifts, balloons, and seasonal favorites from Modern State.",
    hero_image_url: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=1800&q=80",
    mobile_hero_image_url: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=900&q=80",
    accent_color_token: "--color-legacy-red",
    custom_accent_color: null,
    start_date: "2027-01-15",
    end_date: "2027-02-15",
    is_active: false,
    is_visible: true,
    sort_order: 10,
    layout_preset: "holiday-hero",
    product_grid_preset: "holiday-card",
    product_card_variant: "premium",
    created_at: now,
    updated_at: now
  },
  {
    slug: "graduation",
    title_en: "Graduation",
    short_title_en: "Graduation",
    description_en: "Cards, balloons, gifts, tableware, and celebration pieces for graduation season.",
    hero_title_en: "Graduation details, gathered locally.",
    hero_subtitle_en: "Cards, balloons, decorations, and gifts for the next ceremony or party.",
    seo_title_en: "Graduation Party Supplies and Gifts | Modern State NYC",
    seo_description_en: "Shop graduation cards, balloons, party supplies, and gifts at Modern State on the Upper East Side.",
    hero_image_url: "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=1800&q=80",
    mobile_hero_image_url: "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=900&q=80",
    accent_color_token: "--color-legacy-blue",
    custom_accent_color: null,
    start_date: "2027-04-15",
    end_date: "2027-06-30",
    is_active: true,
    is_visible: true,
    sort_order: 20,
    layout_preset: "holiday-hero",
    product_grid_preset: "holiday-card",
    product_card_variant: "image-focused",
    created_at: now,
    updated_at: now
  },
  {
    slug: "halloween",
    title_en: "Halloween",
    short_title_en: "Halloween",
    description_en: "Seasonal party supplies, cards, decor, and event-ready add-ons controlled by admin.",
    hero_title_en: "Halloween, edited for the neighborhood.",
    hero_subtitle_en: "Seasonal essentials can be turned on, arranged, and retired from the admin.",
    seo_title_en: "Halloween Party Supplies | Modern State NYC",
    seo_description_en: "Shop Halloween party supplies, cards, decorations, and seasonal products from Modern State.",
    hero_image_url: "https://images.unsplash.com/photo-1509557965875-b88c97052f0e?auto=format&fit=crop&w=1800&q=80",
    mobile_hero_image_url: "https://images.unsplash.com/photo-1509557965875-b88c97052f0e?auto=format&fit=crop&w=900&q=80",
    accent_color_token: "--color-legacy-yellow",
    custom_accent_color: null,
    start_date: "2026-09-15",
    end_date: "2026-11-01",
    is_active: true,
    is_visible: true,
    sort_order: 30,
    layout_preset: "holiday-hero",
    product_grid_preset: "holiday-card",
    product_card_variant: "premium",
    created_at: now,
    updated_at: now
  },
  {
    slug: "christmas",
    title_en: "Christmas",
    short_title_en: "Christmas",
    description_en: "Holiday cards, wrap, gifts, ornaments, seasonal supplies, and festive balloons.",
    hero_title_en: "Christmas cards, gifts, and holiday details.",
    hero_subtitle_en: "A seasonal parent page designed for safe admin editing.",
    seo_title_en: "Christmas Cards, Gifts, and Supplies | Modern State NYC",
    seo_description_en: "Shop Christmas cards, gifts, gift wrap, decorations, and holiday supplies from Modern State.",
    hero_image_url: "https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=1800&q=80",
    mobile_hero_image_url: "https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=900&q=80",
    accent_color_token: "--color-legacy-green",
    custom_accent_color: null,
    start_date: "2026-11-01",
    end_date: "2026-12-26",
    is_active: false,
    is_visible: true,
    sort_order: 40,
    layout_preset: "holiday-hero",
    product_grid_preset: "holiday-card",
    product_card_variant: "premium",
    created_at: now,
    updated_at: now
  }
];

export function getHolidayBySlug(slug: string) {
  return holidays.find((holiday) => holiday.slug === slug);
}
