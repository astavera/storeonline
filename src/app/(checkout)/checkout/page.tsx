import { CheckoutPageTemplate } from "@/components/checkout/checkout-page-template";
import { isOrderProLocalDeliveryCheckoutEnabled } from "@/server/orderpro/config";

export default function CheckoutPage() {
  return <CheckoutPageTemplate localDeliveryCheckoutEnabled={isOrderProLocalDeliveryCheckoutEnabled()} />;
}
