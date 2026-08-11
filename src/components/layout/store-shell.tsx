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
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { StorefrontRouteMap } from "./storefront-route-map";

export async function StoreShell({ children }: { children: ReactNode }) {
  const homepageState = await getPublishedHomepageState();

  return (
    <div className="min-h-screen bg-background">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <SiteHeader navigation={homepageState.headerNavigation} />
      <StorefrontRouteMap />
      <div id="main-content" tabIndex={-1}>{children}</div>
      <SiteFooter />
    </div>
  );
}
