/**
 * Inventories authenticated Admin pages and records their implementation status.
 *
 * This is an architecture registry, not the sidebar definition. Navigation code may
 * consume it later, but generic placeholders must remain hidden until they are
 * connected to their real domain data and behavior.
 */

export const adminRouteClassifications = [
  "functional",
  "external",
  "generic",
  "redirect",
  "internal-detail"
] as const;

export type AdminRouteClassification = (typeof adminRouteClassifications)[number];

export const adminRouteAuthorities = ["store-admin", "square", "operations", "shippo"] as const;

export type AdminRouteAuthority = (typeof adminRouteAuthorities)[number];

export const adminNavigationVisibilities = ["primary", "preview", "hidden"] as const;

export type AdminNavigationVisibility = (typeof adminNavigationVisibilities)[number];

export const adminSettingsAreaHrefs = {
  business: "/admin/settings?area=business",
  locations: "/admin/settings?area=locations",
  tax: "/admin/settings?area=tax",
  policies: "/admin/settings?area=policies"
} as const;

type AdminRouteBase = {
  routePattern: string;
  pageFile: `src/app/(admin)/admin/${string}page.tsx`;
  label: string;
  authorities: readonly AdminRouteAuthority[];
  note?: string;
};

type FunctionalAdminRoute = AdminRouteBase & {
  classification: "functional";
  navigation: AdminNavigationVisibility;
};

type ExternalAdminRoute = AdminRouteBase & {
  classification: "external";
  navigation: "primary" | "hidden";
  externalAuthority: "operations" | "shippo";
};

type GenericAdminRoute = AdminRouteBase & {
  classification: "generic";
  navigation: "hidden";
  replacementPlan: string;
  canonicalHref?: string;
};

type RedirectAdminRoute = AdminRouteBase & {
  classification: "redirect";
  navigation: "hidden";
  redirectTo: string;
};

type InternalDetailAdminRoute = AdminRouteBase & {
  classification: "internal-detail";
  navigation: "hidden";
  parentRoute: string;
};

export type AdminRouteDefinition =
  | FunctionalAdminRoute
  | ExternalAdminRoute
  | GenericAdminRoute
  | RedirectAdminRoute
  | InternalDetailAdminRoute;

export const adminRouteRegistry = [
  {
    routePattern: "/admin",
    pageFile: "src/app/(admin)/admin/page.tsx",
    label: "Overview",
    classification: "functional",
    navigation: "primary",
    authorities: ["store-admin", "square"]
  },
  {
    routePattern: "/admin/products",
    pageFile: "src/app/(admin)/admin/products/page.tsx",
    label: "Products",
    classification: "functional",
    navigation: "primary",
    authorities: ["store-admin", "square"]
  },
  {
    routePattern: "/admin/products/[variationId]",
    pageFile: "src/app/(admin)/admin/products/[variationId]/page.tsx",
    label: "Product detail",
    classification: "internal-detail",
    navigation: "hidden",
    parentRoute: "/admin/products",
    authorities: ["store-admin", "square"]
  },
  {
    routePattern: "/admin/homepage",
    pageFile: "src/app/(admin)/admin/homepage/page.tsx",
    label: "Homepage studio",
    classification: "internal-detail",
    navigation: "hidden",
    parentRoute: "/admin/storefront-pages",
    authorities: ["store-admin", "square"]
  },
  {
    routePattern: "/admin/product-placement",
    pageFile: "src/app/(admin)/admin/product-placement/page.tsx",
    label: "Catalog Publishing (compatibility)",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/products?tab=publishing",
    authorities: ["store-admin", "square"]
  },
  {
    routePattern: "/admin/inventory",
    pageFile: "src/app/(admin)/admin/inventory/page.tsx",
    label: "Inventory (retired)",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin",
    authorities: ["square"]
  },
  {
    routePattern: "/admin/orders",
    pageFile: "src/app/(admin)/admin/orders/page.tsx",
    label: "Orders",
    classification: "functional",
    navigation: "primary",
    authorities: ["square", "operations"]
  },
  {
    routePattern: "/admin/returns",
    pageFile: "src/app/(admin)/admin/returns/page.tsx",
    label: "Returns (compatibility)",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/orders?tab=returns",
    authorities: ["store-admin", "square", "operations", "shippo"],
    note: "Read-only RMA support queue; Operations executes fulfillment and Square remains the refund authority."
  },
  {
    routePattern: "/admin/customers",
    pageFile: "src/app/(admin)/admin/customers/page.tsx",
    label: "Customers",
    classification: "functional",
    navigation: "primary",
    authorities: ["store-admin", "square"],
    note: "Read-only support directory with privacy-minimized customer profiles, consent history, and locally matched order and return counts."
  },
  {
    routePattern: "/admin/settings",
    pageFile: "src/app/(admin)/admin/settings/page.tsx",
    label: "Store settings",
    classification: "functional",
    navigation: "primary",
    authorities: ["store-admin", "square"],
    note: `Locations is canonical at ${adminSettingsAreaHrefs.locations}.`
  },
  {
    routePattern: "/admin/notifications",
    pageFile: "src/app/(admin)/admin/notifications/page.tsx",
    label: "Message templates",
    classification: "functional",
    navigation: "hidden",
    authorities: ["store-admin"],
    note: "Versioned transactional templates and provider-gated test sends; marketing automation remains excluded."
  },
  {
    routePattern: "/admin/promotions",
    pageFile: "src/app/(admin)/admin/promotions/page.tsx",
    label: "Promotions",
    classification: "functional",
    navigation: "primary",
    authorities: ["store-admin", "square"],
    note: "CMS-backed promotional content visibility; Square remains authoritative for financial discounts and coupons."
  },
  {
    routePattern: "/admin/analytics",
    pageFile: "src/app/(admin)/admin/analytics/page.tsx",
    label: "Analytics",
    classification: "functional",
    navigation: "primary",
    authorities: ["store-admin", "square", "operations"],
    note: "Read-only metrics from local mirrors with explicit partial/unavailable states; no COGS, margin, or attribution inference."
  },
  {
    routePattern: "/admin/media",
    pageFile: "src/app/(admin)/admin/media/page.tsx",
    label: "Media (compatibility)",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/storefront-pages?tab=media",
    authorities: ["store-admin"],
    note: "Indexed raster uploads with alt text and website visibility metadata; destructive file deletion is excluded."
  },
  {
    routePattern: "/admin/catalog",
    pageFile: "src/app/(admin)/admin/catalog/page.tsx",
    label: "Catalog Browser",
    classification: "functional",
    navigation: "preview",
    authorities: ["square"],
    note: "Shown only in the restricted storefront preview navigation."
  },
  {
    routePattern: "/admin/fulfillment",
    pageFile: "src/app/(admin)/admin/fulfillment/page.tsx",
    label: "Fulfillment",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "https://operation.modernstate.com",
    authorities: ["operations"],
    note: "Read-only handoff panel; execution belongs to operation.modernstate.com."
  },
  {
    routePattern: "/admin/slots",
    pageFile: "src/app/(admin)/admin/slots/page.tsx",
    label: "Slots",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "https://operation.modernstate.com",
    authorities: ["operations"],
    note: "Availability and capacity are managed by Operations."
  },
  {
    routePattern: "/admin/storefront-pages",
    pageFile: "src/app/(admin)/admin/storefront-pages/page.tsx",
    label: "Website Editor",
    classification: "functional",
    navigation: "primary",
    authorities: ["store-admin"]
  },
  {
    routePattern: "/admin/departments",
    pageFile: "src/app/(admin)/admin/departments/page.tsx",
    label: "Departments",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/products?tab=publishing#structure-categories",
    authorities: ["store-admin"]
  },
  {
    routePattern: "/admin/builder/[scope]/[id]",
    pageFile: "src/app/(admin)/admin/builder/[scope]/[id]/page.tsx",
    label: "Storefront page detail",
    classification: "internal-detail",
    navigation: "hidden",
    parentRoute: "/admin/storefront-pages",
    authorities: ["store-admin"]
  },
  {
    routePattern: "/admin/users-roles",
    pageFile: "src/app/(admin)/admin/users-roles/page.tsx",
    label: "Users & Roles",
    classification: "functional",
    navigation: "hidden",
    note: "Database-backed identity directory, role assignment, MFA state, revocable sessions, location scopes, and Operations access state.",
    authorities: ["store-admin", "operations"]
  },
  {
    routePattern: "/admin/audit-log",
    pageFile: "src/app/(admin)/admin/audit-log/page.tsx",
    label: "Audit log",
    classification: "functional",
    navigation: "hidden",
    note: "Immutable, permission-scoped activity with actor, action, target, before/after data, filters, and pagination.",
    authorities: ["store-admin"]
  },
  {
    routePattern: "/admin/sync-status",
    pageFile: "src/app/(admin)/admin/sync-status/page.tsx",
    label: "Sync status",
    classification: "functional",
    navigation: "hidden",
    note: "Read-only Square, Operations, Shippo, database, and webhook configuration/freshness health with no secret disclosure.",
    authorities: ["square", "operations", "shippo"]
  },
  {
    routePattern: "/admin/webhooks",
    pageFile: "src/app/(admin)/admin/webhooks/page.tsx",
    label: "Webhooks",
    classification: "functional",
    navigation: "hidden",
    note: "Read-only webhook inbox with bounded filters and audited requeue for failed or dead-letter events.",
    authorities: ["square", "operations", "shippo"]
  },
  {
    routePattern: "/admin/shipping",
    pageFile: "src/app/(admin)/admin/shipping/page.tsx",
    label: "Shipping",
    classification: "functional",
    navigation: "hidden",
    note: "Read-only Shippo configuration health and validated Operations handoff; no rates, labels, or fulfillment mutations.",
    authorities: ["operations", "shippo"]
  },
  {
    routePattern: "/admin/delivery-zones",
    pageFile: "src/app/(admin)/admin/delivery-zones/page.tsx",
    label: "Delivery zones",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/shipping",
    authorities: ["operations"]
  },
  {
    routePattern: "/admin/locations",
    pageFile: "src/app/(admin)/admin/locations/page.tsx",
    label: "Locations (duplicate)",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: adminSettingsAreaHrefs.locations,
    authorities: ["store-admin", "square"]
  },
  {
    routePattern: "/admin/navigation",
    pageFile: "src/app/(admin)/admin/navigation/page.tsx",
    label: "Navigation & SEO (compatibility)",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/storefront-pages?tab=navigation",
    note: "Controlled CMS-backed navigation editing plus read-only SEO health; arbitrary code and CSS are rejected.",
    authorities: ["store-admin"]
  },
  {
    routePattern: "/admin/theme",
    pageFile: "src/app/(admin)/admin/theme/page.tsx",
    label: "Theme",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/storefront-pages",
    authorities: ["store-admin"]
  },
  {
    routePattern: "/admin/product-display",
    pageFile: "src/app/(admin)/admin/product-display/page.tsx",
    label: "Product display",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/products",
    authorities: ["store-admin", "square"]
  },
  {
    routePattern: "/admin/product-images",
    pageFile: "src/app/(admin)/admin/product-images/page.tsx",
    label: "Product images",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/products",
    authorities: ["store-admin", "square"]
  },
  {
    routePattern: "/admin/product-overrides",
    pageFile: "src/app/(admin)/admin/product-overrides/page.tsx",
    label: "Product overrides",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/products",
    authorities: ["store-admin", "square"]
  },
  {
    routePattern: "/admin/product-seo",
    pageFile: "src/app/(admin)/admin/product-seo/page.tsx",
    label: "Product SEO",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/products",
    authorities: ["store-admin", "square"]
  },
  {
    routePattern: "/admin/balloons",
    pageFile: "src/app/(admin)/admin/balloons/page.tsx",
    label: "Balloon builder",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/products?tab=publishing",
    authorities: ["store-admin", "square", "operations"]
  },
  {
    routePattern: "/admin/holidays",
    pageFile: "src/app/(admin)/admin/holidays/page.tsx",
    label: "Holidays",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/products?tab=publishing",
    authorities: ["store-admin"]
  },
  {
    routePattern: "/admin/holidays/new",
    pageFile: "src/app/(admin)/admin/holidays/new/page.tsx",
    label: "New holiday",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/products?tab=publishing",
    authorities: ["store-admin"]
  },
  {
    routePattern: "/admin/holidays/[id]",
    pageFile: "src/app/(admin)/admin/holidays/[id]/page.tsx",
    label: "Holiday detail",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/products?tab=publishing",
    authorities: ["store-admin"]
  },
  {
    routePattern: "/admin/departments/[id]",
    pageFile: "src/app/(admin)/admin/departments/[id]/page.tsx",
    label: "Department detail",
    classification: "redirect",
    navigation: "hidden",
    redirectTo: "/admin/products?tab=publishing",
    authorities: ["store-admin"]
  }
] as const satisfies readonly AdminRouteDefinition[];

export type RegisteredAdminRoutePattern = (typeof adminRouteRegistry)[number]["routePattern"];
