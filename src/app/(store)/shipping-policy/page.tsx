/**
 * Renders the shipping policy page and prepares its route-level data.
 */

import { ContentPageTemplate } from "@/components/templates/content-page-template";

export default function ShippingPolicyPage() {
  return <ContentPageTemplate area="Policy" body="Shipping is available for eligible products. Available methods, timing, and cost are shown before purchase." sectionId="policy.shipping" title="Shipping Policy" />;
}
