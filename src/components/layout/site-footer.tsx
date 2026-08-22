/*
STORE AREA: Storefront
SECTION: Global Footer
SECTION ID: layout.footer
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: Partially
WHAT THIS CONTROLS: Public footer links, location summary, and legal navigation.
SAFE TO EDIT: Footer content, link order, and contact presentation.
DO NOT EDIT HERE: Policy legal text, payment logic, Square data, or order state.
RELATED FILES: src/config/footer.config.ts, src/config/locations.config.ts
BUSINESS LOGIC FILES: none
*/

import Link from "next/link";
import {
  defaultStoreAdministrationSettings,
  storePolicyDefinitions,
  type StoreAdministrationSettings
} from "@/config/store-administration.config";
import { storeLocations, type StoreLocationConfig } from "@/config/locations.config";

export function SiteFooter({
  administration = defaultStoreAdministrationSettings,
  policyLinks = defaultPolicyLinks(),
  publicLocations = storeLocations.filter((location) => location.slug !== "warehouse")
}: {
  administration?: StoreAdministrationSettings;
  policyLinks?: Array<{ label: string; href: string }>;
  publicLocations?: StoreLocationConfig[];
} = {}) {

  return (
    <footer className="border-t border-border bg-surface" data-store-area="Layout" data-store-component="SiteFooter" data-store-section="layout.footer">
      <div className="container-shell homepage-wide-shell grid gap-10 py-12 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <p className="font-display text-xl font-semibold">{administration.business.storeName}</p>
          <p className="mt-3 max-w-sm text-sm text-secondary">{administration.business.storefrontTagline}</p>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-secondary">Locations</p>
          <div className="mt-4 space-y-3 text-sm">
            {publicLocations.map((location) => (
              <Link className="block hover:text-blue" href="/locations" key={location.id}>
                <span className="font-semibold">{location.name}</span>
                <span className="block text-secondary">{location.phone}</span>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-secondary">Policies</p>
          <div className="mt-4 grid gap-2 text-sm text-secondary">
            {policyLinks.map((link) => (
              <Link className="hover:text-primary" href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function defaultPolicyLinks() {
  const links = storePolicyDefinitions
    .filter((policy) => policy.footerVisible)
    .map((policy) => ({ label: policy.label, href: policy.route }));
  const returnsIndex = links.findIndex((link) => link.href === "/return-policy");
  links.splice(returnsIndex >= 0 ? returnsIndex + 1 : links.length, 0, { label: "Online Returns", href: "/returns" });
  return links;
}
