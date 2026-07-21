import { CheckoutPageTemplate } from "@/components/checkout/checkout-page-template";
import { isOrderProLocalDeliveryCheckoutEnabled } from "@/server/orderpro/config";
import { isOrderProDeliveryTestMode } from "@/server/orderpro/orderpro-local-delivery-service";
import { readMappedOperationalStoreLocations } from "@/server/square/postgres-catalog-store";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const locations = await readMappedOperationalStoreLocations();
  const deliveryTestMode = isOrderProDeliveryTestMode();
  return <CheckoutPageTemplate deliveryTestMode={deliveryTestMode} localDeliveryCheckoutEnabled={deliveryTestMode || isOrderProLocalDeliveryCheckoutEnabled()} locations={locations} />;
}
