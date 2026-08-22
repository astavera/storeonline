/**
 * Renders the privacy policy page and prepares its route-level data.
 */

import { ContentPageTemplate } from "@/components/templates/content-page-template";
import { getStorePolicyDefinition } from "@/config/store-administration.config";

export default function PrivacyPolicyPage() {
  const policy = getStorePolicyDefinition("privacy")!;
  return <ContentPageTemplate area="Policy" body={policy.defaultBody} sectionId="policy.privacy" title={policy.defaultTitle} />;
}
