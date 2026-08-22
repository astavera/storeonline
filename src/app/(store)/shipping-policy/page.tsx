/**
 * Renders the shipping policy page and prepares its route-level data.
 */

import { ContentPageTemplate } from "@/components/templates/content-page-template";
import { getStorePolicyDefinition } from "@/config/store-administration.config";

export default function ShippingPolicyPage() {
  const policy = getStorePolicyDefinition("shipping")!;
  return <ContentPageTemplate area="Policy" body={policy.defaultBody} sectionId="policy.shipping" title={policy.defaultTitle} />;
}
