/**
 * Renders the checkout page and prepares its route-level data.
 */

import { CheckoutPageTemplate } from "@/components/checkout/checkout-page-template";
import { isOrderProLocalDeliveryCheckoutEnabled } from "@/server/orderpro/config";
import { isOrderProDeliveryTestMode } from "@/server/orderpro/orderpro-local-delivery-service";
import { readMappedOperationalStoreLocations } from "@/server/square/postgres-catalog-store";
import { isSquareHostedCheckoutEnabled } from "@/server/square/hosted-checkout";
import { getShippingPilotVariationIds, isOrderProShippingCheckoutEnabled } from "@/server/shipping/shipping-service";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const locations = await readMappedOperationalStoreLocations();
  const deliveryTestMode = isOrderProDeliveryTestMode();
  return <CheckoutPageTemplate
    deliveryTestMode={deliveryTestMode}
    localDeliveryCheckoutEnabled={deliveryTestMode || isOrderProLocalDeliveryCheckoutEnabled()}
    locations={locations}
    shippingCheckoutEnabled={isOrderProShippingCheckoutEnabled()}
    shippingPilotVariationIds={getShippingPilotVariationIds()}
    squareCheckoutEnabled={isSquareHostedCheckoutEnabled()}
  />;
}
