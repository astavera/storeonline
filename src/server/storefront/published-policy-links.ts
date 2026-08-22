/**
 * Resolves footer-visible policy links from published CMS versions.
 */

import "server-only";

import { storePolicyDefinitions } from "@/config/store-administration.config";
import { readStorePolicyFields } from "@/lib/cms/store-policy-document";
import { readPublishedStorefrontCmsDocument } from "@/server/storefront/published-cms-document";

export async function readPublishedPolicyLinks() {
  const policies = await Promise.all(storePolicyDefinitions.map(async (definition) => {
    try {
      const document = await readPublishedStorefrontCmsDocument({ entityType: "policy", entityId: definition.id });
      if (!document) {
        return definition.footerVisible ? { label: definition.label, href: definition.route } : null;
      }
      const fields = readStorePolicyFields(document, definition);
      return fields.footerVisible ? { label: fields.title, href: definition.route } : null;
    } catch {
      return definition.footerVisible ? { label: definition.label, href: definition.route } : null;
    }
  }));

  const links = policies.filter((policy): policy is { label: string; href: string } => Boolean(policy));
  const returnsIndex = links.findIndex((link) => link.href === "/return-policy");
  links.splice(returnsIndex >= 0 ? returnsIndex + 1 : links.length, 0, { label: "Online Returns", href: "/returns" });
  return links;
}
