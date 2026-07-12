import type { CmsScope } from "@/lib/cms";
import { departments } from "./departments.config";
import { holidays } from "./holidays.config";
import { storeLocations } from "./locations.config";
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

const balloonFlowPages: StorefrontEditablePage[] = ["latex", "mylar", "numbers-letters", "bouquets", "pickup", "local-delivery"].map((slug) => ({
  title: `Balloons: ${toTitle(slug)}`,
  route: `/balloons/${slug}`,
  scope: "landing",
  entityId: `balloons-${slug}`,
  group: "Balloons",
  description: "Balloon flow-specific copy, visuals, FAQs, and conversion sections."
}));

const departmentPages: StorefrontEditablePage[] = departments
  .filter((department) => department.slug !== "balloons")
  .map((department) => ({
    title: department.title_en,
    route: `/${department.slug}`,
    scope: "department",
    entityId: department.slug,
    group: "Departments",
    description: "Department hero, category copy, local SEO content, FAQs, and product merchandising sections."
  }));

const holidayPages: StorefrontEditablePage[] = [
  {
    title: "Holidays index",
    route: "/holidays",
    scope: "holiday",
    entityId: "index",
    group: "Holidays",
    description: "Holiday campaign hub, seasonal messaging, active holiday cards, and SEO sections."
  },
  ...holidays.map((holiday) => ({
    title: holiday.title_en,
    route: `/holidays/${holiday.slug}`,
    scope: "holiday" as const,
    entityId: holiday.slug,
    group: "Holidays" as const,
    description: "Holiday detail hero, gift guide content, seasonal product sections, and campaign FAQs."
  }))
];

const contentPages: StorefrontEditablePage[] = [
  ["About Us", "/about", "about"],
  ["Contact", "/contact", "contact"],
  ["Search", "/search", "search"],
  ["Upper East Side Toy Store", "/upper-east-side-toy-store", "upper-east-side-toy-store"],
  ["Upper East Side Balloons", "/upper-east-side-balloons", "upper-east-side-balloons"],
  ["Upper East Side Party Supplies", "/upper-east-side-party-supplies", "upper-east-side-party-supplies"],
  ["Upper East Side Gifts", "/upper-east-side-gifts", "upper-east-side-gifts"],
  ["Upper East Side Stationery", "/upper-east-side-stationery", "upper-east-side-stationery"],
  ["Upper East Side Greeting Cards", "/upper-east-side-greeting-cards", "upper-east-side-greeting-cards"],
  ["Upper East Side Arts and Crafts", "/upper-east-side-arts-and-crafts", "upper-east-side-arts-and-crafts"],
  ["NYC Balloon Delivery", "/nyc-balloon-delivery", "nyc-balloon-delivery"]
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
  },
  ...storeLocations
    .filter((location) => location.slug !== "warehouse")
    .map((location) => ({
      title: location.name,
      route: `/locations/${location.slug}`,
      scope: "location" as const,
      entityId: location.slug,
      group: "Locations" as const,
      description: "Location detail hero, hours, pickup details, service copy, map, and FAQ sections."
    }))
];

const productPages: StorefrontEditablePage[] = storefrontProducts.map((product) => ({
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
  ...balloonFlowPages,
  ...holidayPages,
  ...contentPages,
  ...policyPages,
  ...locationPages,
  ...productPages
];

export function builderHrefForStorefrontPage(page: Pick<StorefrontEditablePage, "entityId" | "scope">) {
  return `/admin/builder/${page.scope}/${page.entityId}`;
}

export function storefrontEditablePagesByGroup() {
  return storefrontEditablePages.reduce<Record<StorefrontEditablePageGroup, StorefrontEditablePage[]>>(
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

function toTitle(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
