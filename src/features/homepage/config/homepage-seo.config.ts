/**
 * Defines the default search and social metadata used by the storefront homepage.
 */

import { defaultHomepageImage } from "./homepage.config";

export type HomepageSeoConfig = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  canonicalUrl: string;
  indexable: boolean;
};

export const defaultHomepageSeo: HomepageSeoConfig = {
  title: "Modern State - State News NYC",
  description: "Toys, party supplies, balloons, stationery, arts and crafts, greeting cards, and gifts on the Upper East Side.",
  ogTitle: "Modern State - State News NYC",
  ogDescription: "Shop Modern State for toys, balloons, party supplies, stationery, gifts, and neighborhood essentials.",
  ogImage: defaultHomepageImage,
  canonicalUrl: "/",
  indexable: true
};
