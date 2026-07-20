/*
STORE AREA: Checkout
SECTION: Checkout Template
SECTION ID: checkout.*
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: No
WHAT THIS CONTROLS: Secure checkout layout, customer form, fulfillment grouping, and Square readiness messaging.
SAFE TO EDIT: Layout and accessible checkout presentation.
DO NOT EDIT HERE: Raw card fields, payment token storage, Square secrets, price validation, or slot locks.
RELATED FILES: src/app/(checkout)/checkout/page.tsx, src/config/store-section-registry.ts
BUSINESS LOGIC FILES: src/server/checkout/checkout-service.ts, src/server/square/client.ts, src/server/fulfillment/fulfillment-router.ts
*/

import { SectionFrame } from "../sections/section-frame";
import { CheckoutClient } from "./checkout-client";

export function CheckoutPageTemplate({ localDeliveryCheckoutEnabled }: { localDeliveryCheckoutEnabled: boolean }) {
  return (
    <main>
      <SectionFrame area="Checkout" className="py-16" component="CheckoutCustomerInfoSection" sectionId="checkout.customer-info" variant="form">
        <div className="container-shell">
          <h1 className="font-display text-4xl font-semibold">Secure checkout</h1>
          <p className="mt-3 max-w-2xl text-secondary">Cart contents, prices, fulfillment compatibility, and totals are validated before payment.</p>
          <div className="mt-8">
            <CheckoutClient localDeliveryCheckoutEnabled={localDeliveryCheckoutEnabled} />
          </div>
        </div>
      </SectionFrame>
    </main>
  );
}
