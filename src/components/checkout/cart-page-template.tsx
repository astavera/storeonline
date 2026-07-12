/*
STORE AREA: Cart
SECTION: Cart Template
SECTION ID: cart.drawer, cart.order-summary
CUSTOMER-FACING: Yes
ADMIN-EDITABLE: No
WHAT THIS CONTROLS: Cart shell, client cart state, validated order summary, and accessible empty-cart states.
SAFE TO EDIT: Presentation and customer-facing cart layout.
DO NOT EDIT HERE: Cart price trust, inventory revalidation, payment tokens, or fulfillment locking.
RELATED FILES: src/app/(checkout)/cart/page.tsx, src/config/store-section-registry.ts
BUSINESS LOGIC FILES: src/server/checkout/cart-service.ts
*/

import { SectionFrame } from "../sections/section-frame";
import { CartClient } from "./cart-client";

export function CartPageTemplate() {
  return (
    <main>
      <SectionFrame area="Cart" className="py-16" component="CartDrawerSection" sectionId="cart.drawer" variant="page">
        <div className="container-shell">
          <h1 className="font-display text-4xl font-semibold">Cart</h1>
          <p className="mt-3 max-w-2xl text-secondary">Review quantities, fulfillment compatibility, estimated tax, and server-validated totals before checkout.</p>
          <div className="mt-8">
            <CartClient />
          </div>
        </div>
      </SectionFrame>
    </main>
  );
}
