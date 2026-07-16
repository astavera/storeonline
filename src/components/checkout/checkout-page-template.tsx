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
import { CheckoutClient, type CheckoutLocation } from "./checkout-client";

export function CheckoutPageTemplate({ locations }: { locations: CheckoutLocation[] }) {
  return (
    <main>
      <SectionFrame area="Checkout" className="py-16" component="CheckoutCustomerInfoSection" sectionId="checkout.customer-info" variant="form">
        <div className="container-shell">
          <h1 className="font-display text-4xl font-semibold">Review your order</h1>
          <p className="mt-3 max-w-3xl text-secondary">Review your contact details and fulfillment preference. Submitting this form checks the order details only—it does not place an order or charge you.</p>
          <div className="mt-8">
            <CheckoutClient locations={locations} />
          </div>
        </div>
      </SectionFrame>
    </main>
  );
}
