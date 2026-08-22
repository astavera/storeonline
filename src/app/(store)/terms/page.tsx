/**
 * Renders the terms page and prepares its route-level data.
 */

import { ContentPageTemplate } from "@/components/templates/content-page-template";
import { getStorePolicyDefinition } from "@/config/store-administration.config";

export default function TermsPage() {
  const policy = getStorePolicyDefinition("terms")!;
  return <ContentPageTemplate area="Policy" body={policy.defaultBody} sectionId="policy.terms" title={policy.defaultTitle} />;
}
