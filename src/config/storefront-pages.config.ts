/**
 * Defines the storefront pages configuration used by the application.
 */

import type { CmsScope } from "@/lib/cms";
import { holidays } from "./holidays.config";
import { storefrontProducts } from "@/features/catalog/product-catalog";

export type StorefrontEditablePageGroup = "Commerce" | "Departments" | "Balloons" | "Holidays" | "Content" | "Policies" | "Locations" | "Products";

export type StorefrontEditablePage = {
  title: string;
  route: string;
  scope: CmsScope;
  entityId: string;
  group: StorefrontEditablePageGroup;
  description: string;
};

const staticCommercePages: StorefrontEditablePage[] = [
  {
    title: "Shop all",
    route: "/shop",
    scope: "landing",
    entityId: "shop",
    group: "Commerce",
    description: "Main catalog landing, filters, product grid intro, merchandising bands, and SEO sections."
  },
  {
    title: "Balloons",
    route: "/balloons",
    scope: "department",
    entityId: "balloons",
    group: "Balloons",
    description: "Balloon landing hero, builder copy, fulfillment content, and balloon category sections."
  }
];

const departmentPages: StorefrontEditablePage[] = [
  ["Toys Department Page", "/toys", "toys"],
  ["Party Supplies Department Page", "/party-supplies", "party-supplies"]
].map(([title, route, entityId]) => ({
  title,
  route,
  scope: "department" as const,
  entityId,
  group: "Departments" as const,
  description: "Department hero, category copy, local SEO content, FAQs, and product merchandising sections."
}));

const holidayPages: StorefrontEditablePage[] = holidays.map((holiday) => ({
    title: holiday.title_en,
    route: `/holidays/${holiday.slug}`,
    scope: "holiday" as const,
    entityId: holiday.slug,
    group: "Holidays" as const,
    description: "Holiday detail hero, gift guide content, seasonal product sections, and campaign FAQs."
  }));

const contentPages: StorefrontEditablePage[] = [
  ["About Us", "/about", "about"],
  ["Contact", "/contact", "contact"],
  ["Search", "/search", "search"]
].map(([title, route, entityId]) => ({
  title,
  route,
  scope: "landing" as const,
  entityId,
  group: "Content" as const,
  description: "Editable informational, local SEO, story, media, CTA, and FAQ sections."
}));

const policyPages: StorefrontEditablePage[] = [
  ["Privacy Policy", "/privacy-policy", "privacy"],
  ["Terms", "/terms", "terms"],
  ["Security", "/security", "security"],
  ["Pickup Policy", "/pickup-policy", "pickup"],
  ["Local Delivery Policy", "/local-delivery-policy", "local-delivery"],
  ["Shipping Policy", "/shipping-policy", "shipping"],
  ["Return Policy", "/return-policy", "returns"]
].map(([title, route, entityId]) => ({
  title,
  route,
  scope: "policy" as const,
  entityId,
  group: "Policies" as const,
  description: "Editable policy copy, trust blocks, FAQs, and operational explanation sections."
}));

const locationPages: StorefrontEditablePage[] = [
  {
    title: "Locations index",
    route: "/locations",
    scope: "location",
    entityId: "index",
    group: "Locations",
    description: "Store location hub, pickup/local delivery copy, maps, service areas, and store cards."
  }
];

const productPages: StorefrontEditablePage[] = (process.env.E2E_CATALOG_FIXTURE === "true" ? storefrontProducts : []).map((product) => ({
  title: product.name,
  route: `/products/${product.slug}`,
  scope: "product",
  entityId: product.slug,
  group: "Products",
  description: "Product detail layout sections, local product copy, trust blocks, related products, and merchandising."
}));

export const storefrontEditablePages: StorefrontEditablePage[] = [
  ...staticCommercePages,
  ...departmentPages,
  ...holidayPages,
  ...contentPages,
  ...policyPages,
  ...locationPages,
  ...productPages
];

export function builderHrefForStorefrontPage(page: Pick<StorefrontEditablePage, "entityId" | "scope">) {
  return `/admin/builder/${page.scope}/${page.entityId}`;
}
export function websiteHolidayEditorPages(websiteHolidays: Array<{ description: string; name: string; slug: string }>): StorefrontEditablePage[] {
  return websiteHolidays.map((holiday) => ({
    title: holiday.name,
    route: `/holidays/${holiday.slug}`,
    scope: "holiday",
    entityId: holiday.slug,
    group: "Holidays",
    description: holiday.description || `${holiday.name} storefront design.`
  }));
}

export function storefrontEditablePagesByGroup(additionalPages: StorefrontEditablePage[] = []) {
  const pageByKey = new Map(storefrontEditablePages.map((page) => [`${page.scope}:${page.entityId}`, page]));
  for (const page of additionalPages) pageByKey.set(`${page.scope}:${page.entityId}`, page);

  return Array.from(pageByKey.values()).reduce<Record<StorefrontEditablePageGroup, StorefrontEditablePage[]>>(
    (groups, page) => {
      groups[page.group].push(page);
      return groups;
    },
    {
      Commerce: [],
      Departments: [],
      Balloons: [],
      Holidays: [],
      Content: [],
      Policies: [],
      Locations: [],
      Products: []
    }
  );
}
