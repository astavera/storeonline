/**
 * Renders the order confirmation id page and prepares its route-level data.
 */

import { ContentPageTemplate } from "@/components/templates/content-page-template";

export default async function OrderConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContentPageTemplate area="Checkout" body={`Order ${id} will display payment, fulfillment, and status details after webhook confirmation.`} sectionId="checkout.confirmation" title="Order confirmation" />;
}
