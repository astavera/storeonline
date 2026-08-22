/**
 * Renders the local delivery policy page and prepares its route-level data.
 */

import { ContentPageTemplate } from "@/components/templates/content-page-template";
import { getStorePolicyDefinition } from "@/config/store-administration.config";

export default function LocalDeliveryPolicyPage() {
  const policy = getStorePolicyDefinition("local-delivery")!;
  return <ContentPageTemplate area="Policy" body={policy.defaultBody} sectionId="policy.local-delivery" title={policy.defaultTitle} />;
}
