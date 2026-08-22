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
    <main data-cart-page>
      <SectionFrame area="Cart" className="py-8 md:py-12" component="CartDrawerSection" sectionId="cart.drawer" variant="page">
        <div className="container-shell" data-cart-page-shell>
          <header className="border-b border-border pb-6 md:pb-8" data-cart-page-header>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-blue">Your order</p>
            <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.03em] text-primary md:text-5xl">Cart</h1>
            <p className="mt-3 max-w-2xl text-secondary">Review your items and update quantities before moving to checkout.</p>
          </header>
          <div className="mt-8" data-cart-page-content>
            <CartClient />
          </div>
        </div>
      </SectionFrame>
    </main>
  );
}
