/*
STORE AREA: Storefront
SECTION: Store Shell
SECTION ID: layout.store-shell
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: No
WHAT THIS CONTROLS: Shared public storefront frame.
SAFE TO EDIT: Header/footer composition and page background.
DO NOT EDIT HERE: Route content, checkout logic, admin auth, or Square API access.
RELATED FILES: src/components/layout/site-header.tsx, src/components/layout/site-footer.tsx
BUSINESS LOGIC FILES: none
*/

import type { ReactNode } from "react";
import { getPublishedHomepageState } from "@/features/homepage/server";
import { readWebsiteMerchandisingSnapshot } from "@/server/admin/website-merchandising-store";
import { readPublishedStoreAdministrationSettings } from "@/server/admin/store-administration-settings-service";
import { readPublicStoreLocations } from "@/server/storefront/public-store-locations";
import { readPublishedPolicyLinks } from "@/server/storefront/published-policy-links";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { StorefrontRouteMap } from "./storefront-route-map";

export async function StoreShell({ children }: { children: ReactNode }) {
  const [homepageState, merchandising, administration, publicLocations, policyLinks] = await Promise.all([
    getPublishedHomepageState(),
    readWebsiteMerchandisingSnapshot(),
    readPublishedStoreAdministrationSettings(),
    readPublicStoreLocations(),
    readPublishedPolicyLinks()
  ]);

  return (
    <div className="min-h-screen bg-background">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <SiteHeader categories={merchandising.categories} navigation={homepageState.headerNavigation} />
      <StorefrontRouteMap />
      <div id="main-content" tabIndex={-1}>{children}</div>
      <SiteFooter administration={administration} policyLinks={policyLinks} publicLocations={publicLocations} />
    </div>
  );
}
