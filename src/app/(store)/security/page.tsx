/**
 * Renders the security page and prepares its route-level data.
 */

import { ContentPageTemplate } from "@/components/templates/content-page-template";
import { getStorePolicyDefinition } from "@/config/store-administration.config";

export default function SecurityPage() {
  const policy = getStorePolicyDefinition("security")!;
  return <ContentPageTemplate area="Policy" body={policy.defaultBody} sectionId="policy.security" title={policy.defaultTitle} />;
}
