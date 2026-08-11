/**
 * Renders the privacy policy page and prepares its route-level data.
 */

import { ContentPageTemplate } from "@/components/templates/content-page-template";

export default function PrivacyPolicyPage() {
  return <ContentPageTemplate area="Policy" body="Customer data, order data, and operational PII will be minimized, role-scoped, and protected by secure session controls." sectionId="policy.privacy" title="Privacy Policy" />;
}
