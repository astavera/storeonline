/**
 * Renders the pickup policy page and prepares its route-level data.
 */

import { ContentPageTemplate } from "@/components/templates/content-page-template";
import { getStorePolicyDefinition } from "@/config/store-administration.config";

export default function PickupPolicyPage() {
  const policy = getStorePolicyDefinition("pickup")!;
  return <ContentPageTemplate area="Policy" body={policy.defaultBody} sectionId="policy.pickup" title={policy.defaultTitle} />;
}
