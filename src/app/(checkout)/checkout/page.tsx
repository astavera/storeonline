import { CheckoutPageTemplate } from "@/components/checkout/checkout-page-template";
import { readMappedOperationalStoreLocations } from "@/server/square/postgres-catalog-store";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const locations = await readMappedOperationalStoreLocations();
  return <CheckoutPageTemplate locations={locations} />;
}
