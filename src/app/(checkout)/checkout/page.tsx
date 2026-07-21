import { CheckoutPageTemplate } from "@/components/checkout/checkout-page-template";
import { isOrderProDeliveryTestMode } from "@/server/orderpro/orderpro-local-delivery-service";
import { readMappedOperationalStoreLocations } from "@/server/square/postgres-catalog-store";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const locations = await readMappedOperationalStoreLocations();
  return <CheckoutPageTemplate deliveryTestMode={isOrderProDeliveryTestMode()} locations={locations} />;
}
