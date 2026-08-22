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

import { LockKeyhole } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CheckoutClient, type CheckoutLocation } from "./checkout-client";

export function CheckoutPageTemplate({ locations, deliveryTestMode = false, localDeliveryCheckoutEnabled = false, shippingCheckoutEnabled = false, splitCheckoutEnabled = false, squareCheckoutEnabled = false, destinationTaxEnabled = false }: { locations: CheckoutLocation[]; deliveryTestMode?: boolean; localDeliveryCheckoutEnabled?: boolean; shippingCheckoutEnabled?: boolean; splitCheckoutEnabled?: boolean; squareCheckoutEnabled?: boolean; destinationTaxEnabled?: boolean }) {
  return (
    <main className="min-h-screen bg-white lg:bg-[linear-gradient(to_right,#ffffff_0%,#ffffff_61%,#f7f7f5_61%,#f7f7f5_100%)]" data-checkout-focus-page>
      <div aria-hidden="true" className="h-1.5 bg-[url('/assets/modern_state_top_stripe_1920x34.svg?v=20260709')] bg-[length:100%_100%] bg-no-repeat" />
      <header className="border-b border-[#dededb] bg-white">
        <div className="mx-auto flex min-h-20 w-full max-w-[1140px] items-center justify-between px-5 lg:px-12">
          <Link aria-label="Modern State home" href="/">
            <Image alt="Modern State" className="h-auto w-[138px] object-contain sm:w-[170px]" height={42} priority src="/images/modern-state-logo-original.png" width={170} />
          </Link>
          <div className="flex items-center gap-2 text-sm text-[#4f554d]">
            <LockKeyhole aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>Secure checkout</span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1140px] lg:grid-cols-[minmax(0,700px)_440px]">
        <div className="border-b border-[#dededb] px-5 py-7 lg:border-b-0 lg:px-12 lg:pb-8 lg:pt-10">
          <nav aria-label="Checkout progress" className="flex flex-wrap items-center gap-2 text-xs text-[#666b64] sm:text-sm">
            <Link className="hover:text-black hover:underline" href="/cart">Cart</Link>
            <span aria-hidden="true">›</span>
            <span aria-current="step" className="text-black">Information</span>
            <span aria-hidden="true">›</span>
            <span>Fulfillment</span>
            <span aria-hidden="true">›</span>
            <span>Payment</span>
          </nav>
          <div className="mt-5 flex items-center justify-between gap-5">
            <h1 className="text-2xl font-semibold tracking-[-0.015em] text-[#171b16]">Secure checkout</h1>
            <Link className="text-sm text-[#4f554d] underline underline-offset-4 hover:text-black" href="/cart">Back to cart</Link>
          </div>
        </div>
        <div aria-hidden="true" className="hidden border-l border-[#dededb] bg-[#f7f7f5] lg:block" />
      </div>

      <CheckoutClient
        deliveryTestMode={deliveryTestMode}
        destinationTaxEnabled={destinationTaxEnabled}
        localDeliveryCheckoutEnabled={localDeliveryCheckoutEnabled}
        locations={locations}
        shippingCheckoutEnabled={shippingCheckoutEnabled}
        splitCheckoutEnabled={splitCheckoutEnabled}
        squareCheckoutEnabled={squareCheckoutEnabled}
      />

      <footer className="border-t border-[#dededb] bg-white">
        <nav aria-label="Checkout policies" className="mx-auto flex min-h-20 w-full max-w-[1140px] flex-wrap items-center gap-x-6 gap-y-2 px-5 text-xs text-[#4f554d] lg:px-12">
          <Link className="underline underline-offset-4" href="/return-policy">Return policy</Link>
          <Link className="underline underline-offset-4" href="/privacy-policy">Privacy policy</Link>
          <Link className="underline underline-offset-4" href="/terms">Terms</Link>
        </nav>
      </footer>
    </main>
  );
}
