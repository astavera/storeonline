/**
 * Renders the security page and prepares its route-level data.
 */

import { ContentPageTemplate } from "@/components/templates/content-page-template";

export default function SecurityPage() {
  return <ContentPageTemplate area="Policy" body="Square tokens stay server-side. Raw card data is never collected or stored by the website." sectionId="policy.security" title="Security" />;
}
