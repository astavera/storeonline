/**
 * Renders the checkout client interface and its user interactions.
 */

"use client";

import { CalendarDays, ChevronDown, CreditCard, LockKeyhole, ShieldCheck, ShoppingBag } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { readCartItems, type StoredCartItem } from "@/components/commerce/add-to-cart-button";
import { SplitCheckoutClient } from "@/components/checkout/split-checkout-client";
import { LocalDeliveryQuotePanel } from "@/components/fulfillment/local-delivery-quote-panel";
import { PickupSchedulePanel } from "@/components/fulfillment/pickup-schedule-panel";
import { ShippingRatePanel, type ShippingSelection } from "@/components/fulfillment/shipping-rate-panel";
import { Button } from "@/components/ui/button";
import type { LocalDeliveryAddress, LocalDeliverySelection } from "@/features/fulfillment/contracts/orderpro-local-delivery";
import type { PickupTimingSelection } from "@/features/fulfillment/contracts/orderpro-pickup";
import { formatMoney } from "@/lib/utils";

type CartQuote = {
  lines: Array<{
    squareVariationId: string;
    quantity: number;
    name: string;
    imageUrl: string;
    unitPriceCents: number;
    lineTotalCents: number;
    checkoutGroup: "regular" | "balloons";
  }>;
  checkoutGroups: Array<{
    id: "regular" | "balloons";
    label: string;
    lines: Array<{ squareVariationId: string; quantity: number; name: string }>;
    itemCount: number;
    subtotalCents: number;
    estimatedTaxCents: number;
    totalCents: number;
    compatibleFulfillmentModes: Array<"pickup" | "local-delivery" | "shipping">;
  }>;
  itemCount: number;
  subtotalCents: number;
  estimatedTaxCents: number;
  taxEstimateIncluded?: boolean;
  totalCents: number;
  compatibleFulfillmentModes: Array<"pickup" | "local-delivery" | "shipping">;
  fulfillmentLabel: string;
  errors: string[];
  warnings: string[];
  locationId: string | null;
  locationName: string | null;
};

type ShippingTaxQuote = {
  id: string;
  token: string;
  provider: "stripe_tax";
  nexusDecision: "COLLECT" | "DO_NOT_COLLECT";
  jurisdiction: { country: "US"; state: string; county: string | null; city: string | null } | null;
  freightTaxable: boolean;
  subtotalCents: number;
  shippingCents: number;
  taxableMerchandiseCents: number;
  taxableShippingCents: number;
  merchandiseTaxCents: number;
  shippingTaxCents: number;
  totalTaxCents: number;
  totalCents: number;
  expiresAt: string;
};

export type CheckoutLocation = {
  id: string;
  name: string;
  address: string;
  pickupEnabled: boolean;
  localDeliveryEnabled: boolean;
  shippingFulfillmentEnabled: boolean;
};

const fulfillmentLabels = {
  pickup: "Pickup",
  "local-delivery": "Local delivery",
  shipping: "Shipping"
};

export function CheckoutClient({ locations, deliveryTestMode = false, localDeliveryCheckoutEnabled = false, shippingCheckoutEnabled = false, splitCheckoutEnabled = false, squareCheckoutEnabled = false, destinationTaxEnabled = false }: { locations: CheckoutLocation[]; deliveryTestMode?: boolean; localDeliveryCheckoutEnabled?: boolean; shippingCheckoutEnabled?: boolean; splitCheckoutEnabled?: boolean; squareCheckoutEnabled?: boolean; destinationTaxEnabled?: boolean }) {
  const [cartState, setCartState] = useState<{ hydrated: boolean; items: StoredCartItem[] }>({ hydrated: false, items: [] });
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [isCartQuoteLoading, setIsCartQuoteLoading] = useState(true);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [fulfillmentMode, setFulfillmentMode] = useState<"pickup" | "local-delivery" | "shipping">("pickup");
  const [localDeliverySelection, setLocalDeliverySelection] = useState<LocalDeliverySelection | null>(null);
  const [shippingSelection, setShippingSelection] = useState<ShippingSelection | null>(null);
  const [shippingTaxQuote, setShippingTaxQuote] = useState<ShippingTaxQuote | null>(null);
  const [shippingTaxStatus, setShippingTaxStatus] = useState<{ loading: boolean; error: string }>({ loading: false, error: "" });
  const [deliveryPrefill, setDeliveryPrefill] = useState<{ address?: LocalDeliveryAddress; postalCode?: string; requestedDate?: string } | null>(null);
  const [pickupSchedule, setPickupSchedule] = useState<PickupTimingSelection | null>(null);
  const [balloonPreference, setBalloonPreference] = useState<BalloonFulfillmentPreference | null>(null);
  const [message, setMessage] = useState<{ tone: "idle" | "success" | "error"; text: string }>({ tone: "idle", text: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idempotency = useRef<{ payload: string; key: string } | null>(null);
  const taxQuoteRequestSequence = useRef(0);
  const items = cartState.items;

  useEffect(() => {
    // Cart and balloon preferences live in browser storage and can only be synchronized after hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    setCartState({ hydrated: true, items: readCartItems() });
    const preference = readBalloonFulfillmentPreference();
    setBalloonPreference(preference);
    if (preference) {
      const preferredLocation = locations.find((location) => location.id === preference.locationId)
        ?? (preference.mode === "delivery" ? locations.find((location) => location.localDeliveryEnabled) : undefined);
      if (preferredLocation) {
        setLocationId(preferredLocation.id);
        if (preference.mode === "delivery" && preferredLocation.localDeliveryEnabled) {
          setFulfillmentMode("local-delivery");
          if (preference.address || preference.postalCode) {
            setDeliveryPrefill({ address: preference.address, postalCode: preference.postalCode, requestedDate: preference.requestedDate });
          }
        } else if (preference.mode === "pickup" && preferredLocation.pickupEnabled) {
          setFulfillmentMode("pickup");
          if (preference.requestedDate && preference.slotId && preference.slotLabel) {
            setPickupSchedule({ timing: "SCHEDULED", requestedDate: preference.requestedDate, slotId: preference.slotId, slotLabel: preference.slotLabel });
          }
        }
      }
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [locations]);

  useEffect(() => {
    if (!cartState.hydrated) return;
    let ignore = false;

    fetch("/api/cart", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ items })
    })
      .then((response) => response.json())
      .then((result) => {
        if (ignore) {
          return;
        }

        const nextQuote = result.quote ?? null;
        setQuote(nextQuote);
        setIsCartQuoteLoading(false);

        const availableModes = nextQuote?.compatibleFulfillmentModes?.filter(
          (mode: "pickup" | "local-delivery" | "shipping") =>
            (mode !== "local-delivery" || localDeliveryCheckoutEnabled)
            && (mode !== "shipping" || shippingCheckoutEnabled)
        );
        if (availableModes?.length) {
          setFulfillmentMode((current) => availableModes.includes(current) ? current : availableModes[0]);
        }
      })
      .catch(() => {
        if (!ignore) {
          setIsCartQuoteLoading(false);
          setMessage({ tone: "error", text: "We couldn’t review your cart. Refresh the page and try again." });
        }
      });

    return () => {
      ignore = true;
    };
  }, [cartState.hydrated, items, localDeliveryCheckoutEnabled, locationId, shippingCheckoutEnabled]);

  function handleShippingSelection(selection: ShippingSelection | null) {
    setShippingSelection(selection);
    setShippingTaxQuote(null);
    const requestSequence = ++taxQuoteRequestSequence.current;
    if (!selection) {
      setShippingTaxStatus({ loading: false, error: "" });
      return;
    }
    if (!destinationTaxEnabled) {
      setShippingTaxStatus({ loading: false, error: "" });
      return;
    }
    setShippingTaxStatus({ loading: true, error: "" });
    void requestShippingTaxQuote(selection, requestSequence);
  }

  async function requestShippingTaxQuote(selection: ShippingSelection, requestSequence: number) {
    try {
      const response = await fetch("/api/checkout/tax-quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, locationId, shipping: selection })
      });
      const result = await response.json();
      if (requestSequence !== taxQuoteRequestSequence.current) return;
      if (!response.ok || !result.ok || !result.taxQuote) {
        setShippingTaxStatus({
          loading: false,
          error: Array.isArray(result.errors) ? result.errors.join(" ") : "Estimated tax is unavailable."
        });
        return;
      }
      setShippingTaxQuote(result.taxQuote as ShippingTaxQuote);
      setShippingTaxStatus({ loading: false, error: "" });
    } catch {
      if (requestSequence !== taxQuoteRequestSequence.current) return;
      setShippingTaxStatus({ loading: false, error: "We couldnâ€™t calculate destination tax. Please check the rate again." });
    }
  }

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setMessage({ tone: "idle", text: "Preparing your secure Square checkout..." });

    try {
      const customer = {
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? "")
      };
      const fulfillment = {
        fulfillmentMode,
        locationId,
        ...(fulfillmentMode === "local-delivery" && localDeliverySelection ? {
          localDelivery: {
            quoteId: localDeliverySelection.quote.quoteId,
            slotId: localDeliverySelection.slotId,
            feeCents: localDeliverySelection.quote.feeCents,
            requestedDate: localDeliverySelection.quote.requestedDate,
            address: localDeliverySelection.quote.normalizedAddress
          }
        } : {}),
        ...(fulfillmentMode === "pickup" && pickupSchedule ? {
          pickup: pickupSchedule.timing === "ASAP"
            ? { timing: "ASAP" as const }
            : {
                timing: "SCHEDULED" as const,
                requestedDate: pickupSchedule.requestedDate,
                slotId: pickupSchedule.slotId,
                slotLabel: pickupSchedule.slotLabel
              }
        } : {}),
        ...(fulfillmentMode === "shipping" && shippingSelection ? { shipping: shippingSelection } : {})
      };
      const checkoutGroupId = quote?.checkoutGroups[0]?.id;
      if (splitCheckoutEnabled && !checkoutGroupId) throw new Error("Checkout fulfillment group is missing.");
      const payload = splitCheckoutEnabled ? {
        version: 2 as const,
        items,
        fulfillmentGroups: [{ id: checkoutGroupId!, ...fulfillment }],
        customer
      } : {
        items,
        fulfillmentMode,
        locationId,
        ...(fulfillmentMode === "local-delivery" && localDeliverySelection ? {
          localDelivery: {
            quoteId: localDeliverySelection.quote.quoteId,
            slotId: localDeliverySelection.slotId,
            feeCents: localDeliverySelection.quote.feeCents,
            requestedDate: localDeliverySelection.quote.requestedDate,
            address: localDeliverySelection.quote.normalizedAddress
          }
        } : {}),
        ...(fulfillmentMode === "pickup" && pickupSchedule?.timing === "SCHEDULED" ? {
          pickup: {
            requestedDate: pickupSchedule.requestedDate,
            slotId: pickupSchedule.slotId,
            slotLabel: pickupSchedule.slotLabel
          }
        } : {}),
        ...(fulfillmentMode === "shipping" && shippingSelection ? {
          shipping: shippingSelection,
          ...(shippingTaxQuote ? { taxQuoteToken: shippingTaxQuote.token } : {})
        } : {}),
        customer
      };
      const serializedPayload = JSON.stringify(payload);
      if (!idempotency.current || idempotency.current.payload !== serializedPayload) {
        idempotency.current = { payload: serializedPayload, key: crypto.randomUUID() };
      }
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotency.current.key
        },
        body: serializedPayload
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setMessage({ tone: "error", text: Array.isArray(result.errors) ? result.errors.join(" ") : "Checkout is not available." });
        return;
      }

      if (typeof result.checkoutUrl !== "string" || !result.checkoutUrl.startsWith("https://")) {
        setMessage({ tone: "error", text: "Square did not return a secure checkout page. Please try again." });
        return;
      }

      setMessage({ tone: "success", text: "Opening Square secure checkout..." });
      window.location.assign(result.checkoutUrl);
    } catch {
      setMessage({ tone: "error", text: "Checkout request failed. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!cartState.hydrated || isCartQuoteLoading) {
    return (
      <CheckoutStatus description="Checking current products, prices, and fulfillment options." role="status" title="Reviewing your cart" />
    );
  }

  if (!quote) {
    return (
      <CheckoutStatus
        action={<button className="min-h-11 rounded-pill bg-[var(--theme-action)] px-6 py-3 text-sm font-black text-[var(--theme-action-foreground)] transition hover:opacity-90" onClick={() => window.location.reload()} type="button">Try again</button>}
        description="Refresh the page and try again."
        role="alert"
        title="We couldn’t review your cart"
      />
    );
  }

  if (quote.itemCount === 0) {
    return (
      <CheckoutStatus
        action={<Link className="inline-flex min-h-11 items-center justify-center rounded-pill bg-[var(--theme-action)] px-6 py-3 text-sm font-black text-[var(--theme-action-foreground)] transition hover:opacity-90" href="/shop">Continue shopping</Link>}
        description="Add a product before starting checkout."
        title="Your cart is empty"
      />
    );
  }

  if (quote.checkoutGroups.length > 1) {
    return (
      <SplitCheckoutClient
        balloonPreference={balloonPreference}
        deliveryTestMode={deliveryTestMode}
        items={items}
        localDeliveryCheckoutEnabled={localDeliveryCheckoutEnabled}
        locations={locations}
        quote={quote}
        shippingCheckoutEnabled={shippingCheckoutEnabled}
        squareCheckoutEnabled={squareCheckoutEnabled && splitCheckoutEnabled}
      />
    );
  }

  const availableFulfillmentModes = quote.compatibleFulfillmentModes.filter((mode) =>
    (mode !== "local-delivery" || localDeliveryCheckoutEnabled)
    && (mode !== "shipping" || shippingCheckoutEnabled)
  );
  const selectedLocation = locations.find((location) => location.id === locationId);
  const singleGroup = quote.checkoutGroups[0];
  const isBalloonGroup = singleGroup?.id === "balloons";
  const deliveryReady = fulfillmentMode !== "local-delivery" || Boolean(localDeliverySelection);
  const shippingReady = fulfillmentMode !== "shipping" || Boolean(
    shippingSelection && (!destinationTaxEnabled || (shippingTaxQuote && !shippingTaxStatus.loading))
  );
  const pickupReady = fulfillmentMode !== "pickup" || Boolean(pickupSchedule);
  const canSubmit = squareCheckoutEnabled
    && Boolean(selectedLocation && locationSupportsMode(selectedLocation, fulfillmentMode))
    && deliveryReady
    && shippingReady
    && pickupReady
    && quote.errors.length === 0
    && availableFulfillmentModes.includes(fulfillmentMode);
  const deliveryFeeCents = fulfillmentMode === "local-delivery" ? localDeliverySelection?.quote.feeCents ?? 0 : 0;
  const shippingFeeCents = fulfillmentMode === "shipping" ? shippingSelection?.amountCents ?? 0 : 0;
  const estimatedTaxCents = fulfillmentMode === "shipping" && destinationTaxEnabled
    ? shippingTaxQuote?.totalTaxCents ?? 0
    : quote.estimatedTaxCents;
  const estimatedTotalCents = quote.subtotalCents + deliveryFeeCents + shippingFeeCents + estimatedTaxCents;
  const fulfillmentSummary = availableFulfillmentModes.includes(fulfillmentMode) ? fulfillmentLabels[fulfillmentMode] : "Not available";

  return (
    <form className="mx-auto grid w-full max-w-[1140px] lg:grid-cols-[minmax(0,700px)_440px]" onSubmit={submitCheckout}>
      <div className="min-w-0 px-5 pb-12 lg:px-12 lg:pb-16">
        <section className="py-8" data-store-area="Checkout" data-store-component="CheckoutCustomerInfoSection" data-store-section="checkout.customer-info" data-store-variant="form">
          <StepHeading title="Contact information" />
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <CheckoutField autoComplete="name" className="sm:col-span-2" label="Name" name="name" placeholder="Full name" required />
            <CheckoutField autoComplete="email" label="Email" name="email" placeholder="you@example.com" required type="email" />
            <CheckoutField autoComplete="tel" label="Phone" name="phone" placeholder="(212) 555-0100" required type="tel" />
          </div>
        </section>

        <section className="border-t border-[#dededb] py-8" data-store-area="Checkout" data-store-component="CheckoutFulfillmentSection" data-store-section="checkout.fulfillment" data-store-variant="fulfillment-groups">
          <StepHeading title="Fulfillment" />
          {locations.length > 0 && fulfillmentMode !== "local-delivery" ? (
            <label className="mt-6 block text-sm font-bold text-primary">
              Store fulfilling this order
              <select className="mt-2 min-h-12 w-full rounded-[3px] border border-[#cfcfcb] bg-white px-4 py-3 text-sm font-normal outline-none transition focus:border-blue focus:ring-1 focus:ring-blue" onChange={(event) => { setLocationId(event.target.value); setPickupSchedule(null); handleShippingSelection(null); }} value={locationId}>
                {locations.filter((location) => locationSupportsMode(location, fulfillmentMode)).map((location) => <option key={location.id} value={location.id}>{location.name} — {location.address}</option>)}
              </select>
            </label>
          ) : locations.length === 0 ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">No Square-mapped fulfillment location is currently available.</p> : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {availableFulfillmentModes.map((mode) => (
              <label className={`cursor-pointer rounded-[3px] border px-4 py-3.5 transition ${fulfillmentMode === mode ? "border-blue bg-blue/[0.04] text-primary ring-1 ring-blue" : "border-[#cfcfcb] text-secondary hover:border-primary"}`} key={mode}>
                <input aria-label={fulfillmentLabels[mode]} checked={fulfillmentMode === mode} className="sr-only" name="fulfillmentMode" onChange={() => {
                  setFulfillmentMode(mode);
                  const eligibleLocation = locations.find((location) => locationSupportsMode(location, mode));
                  if (eligibleLocation) setLocationId(eligibleLocation.id);
                  setPickupSchedule(null);
                  if (mode !== "local-delivery") setLocalDeliverySelection(null);
                  if (mode !== "shipping") handleShippingSelection(null);
                }} type="radio" value={mode} />
                <span className="flex items-center justify-between gap-3 text-sm font-black">
                  {fulfillmentLabels[mode]}
                  <span aria-hidden="true" className={`h-3 w-3 rounded-full border ${fulfillmentMode === mode ? "border-blue bg-blue" : "border-border"}`} />
                </span>
              </label>
            ))}
          </div>
          {fulfillmentMode === "pickup" && isBalloonGroup && pickupSchedule?.timing === "SCHEDULED" ? (
            <div className="mt-4 flex items-start gap-3 rounded-md border border-border bg-surface-muted p-4">
              <CalendarDays aria-hidden="true" className="mt-0.5 shrink-0 text-primary" size={18} />
              <div>
                <p className="text-sm font-semibold text-primary">Pickup date and time</p>
                <p className="mt-1 text-sm text-secondary">{formatPickupDate(pickupSchedule.requestedDate)} · {pickupSchedule.slotLabel}</p>
              </div>
            </div>
          ) : fulfillmentMode === "pickup" ? (
            <PickupSchedulePanel
              context={isBalloonGroup ? "balloons" : "regular"}
              items={items}
              key={`${isBalloonGroup ? "balloons" : "regular"}:${locationId}`}
              locationId={locationId}
              onSelectionChange={setPickupSchedule}
            />
          ) : null}
          {!localDeliveryCheckoutEnabled && quote.compatibleFulfillmentModes.includes("local-delivery") ? (
            <p className="mt-4 rounded-md border border-border bg-surface-muted p-3 text-sm text-secondary">Local delivery is being connected to OrderPRO and is not available at checkout yet.</p>
          ) : null}
          {!shippingCheckoutEnabled && quote.compatibleFulfillmentModes.includes("shipping") ? (
            <p className="mt-4 rounded-md border border-border bg-surface-muted p-3 text-sm text-secondary">Shipping is not available at checkout yet.</p>
          ) : null}
          {quote.errors.length > 0 ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{quote.errors.join(" ")}</p> : null}
          {quote.warnings?.length > 0 ? <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{quote.warnings.join(" ")}</p> : null}
        </section>

        {fulfillmentMode === "local-delivery" ? (
          <div className="border-t border-[#dededb] py-8">
            <LocalDeliveryQuotePanel
              context="checkout"
              items={items}
              initialAddress={deliveryPrefill?.address}
              initialPostalCode={deliveryPrefill?.postalCode}
              initialRequestedDate={deliveryPrefill?.requestedDate}
              onSelectionChange={(selection) => {
                setLocalDeliverySelection(selection);
                if (selection) setLocationId(selection.quote.selectedLocationId);
              }}
              testMode={deliveryTestMode}
            />
          </div>
        ) : null}

        {fulfillmentMode === "shipping" ? (
          <div className="border-t border-[#dededb] py-8">
            <ShippingRatePanel
              items={items}
              locationId={locationId}
              onSelectionChange={handleShippingSelection}
            />
          </div>
        ) : null}

        {fulfillmentMode === "shipping" && destinationTaxEnabled && shippingTaxStatus.loading ? (
          <p className="rounded-[3px] border border-[#cfcfcb] bg-[#fafaf8] p-3 text-sm text-[#4f554d]" role="status">Calculating destination tax with Stripe Tax…</p>
        ) : null}
        {fulfillmentMode === "shipping" && destinationTaxEnabled && shippingTaxStatus.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">{shippingTaxStatus.error}</p>
        ) : null}

        <section className="border-t border-[#dededb] py-8" data-store-area="Checkout" data-store-component="CheckoutPaymentSection" data-store-section="checkout.payment" data-store-variant="square-web-payments">
          <StepHeading title="Payment" />
          <div className="mt-5 flex items-center justify-between gap-4 rounded-[3px] border border-[#cfcfcb] bg-[#fafaf8] px-4 py-3.5 text-sm text-[#4f554d]">
            <span className="flex items-center gap-3"><CreditCard aria-hidden="true" size={18} />Secure payment with Square</span>
            <LockKeyhole aria-hidden="true" size={16} />
          </div>
          {!squareCheckoutEnabled ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Secure checkout is temporarily unavailable. Please contact the store to complete your purchase.</p> : null}
          <div className="mt-6 flex justify-end">
            <Button className="w-full gap-2 rounded-[3px] py-3.5 text-sm font-semibold sm:w-auto sm:min-w-56" disabled={!canSubmit || isSubmitting} type="submit">
              <ShieldCheck aria-hidden="true" size={16} />
              {isSubmitting ? "Opening Square..." : "Continue to Square"}
            </Button>
          </div>
          {message.text ? (
            <p className={`mt-4 rounded-md border p-3 text-sm ${message.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : message.tone === "success" ? "border-green-200 bg-green-50 text-green-900" : "border-border bg-surface-muted text-secondary"}`} role="status">
              {message.text}
            </p>
          ) : null}
        </section>
      </div>

      <details className="group order-first border-b border-[#dededb] bg-[#f7f7f5] lg:hidden">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 text-sm font-semibold">
          <span className="flex items-center gap-2">Order summary <ChevronDown aria-hidden="true" className="transition group-open:rotate-180" size={16} /></span>
          <span>{fulfillmentMode === "shipping" && destinationTaxEnabled && !shippingTaxQuote ? "Pending tax" : formatMoney(estimatedTotalCents)}</span>
        </summary>
        <div className="border-t border-[#dededb] px-5 py-6">
          <CheckoutSummary
            deliveryFeeCents={deliveryFeeCents}
            destinationTaxEnabled={destinationTaxEnabled}
            estimatedTaxCents={estimatedTaxCents}
            estimatedTotalCents={estimatedTotalCents}
            fulfillmentMode={fulfillmentMode}
            fulfillmentSummary={fulfillmentSummary}
            pickupSchedule={pickupSchedule}
            quote={quote}
            shippingFeeCents={shippingFeeCents}
            shippingSelection={shippingSelection}
            shippingTaxLoading={shippingTaxStatus.loading}
            shippingTaxQuoteAvailable={Boolean(shippingTaxQuote)}
          />
        </div>
      </details>

      <aside className="hidden min-h-full border-l border-[#dededb] bg-[#f7f7f5] px-10 py-8 lg:block" data-store-area="Checkout" data-store-component="CheckoutOrderSummarySection" data-store-section="checkout.order-summary" data-store-variant="summary">
        <div className="sticky top-8">
          <h2 className="text-lg font-semibold text-[#171b16]">Order summary</h2>
          <CheckoutSummary
            deliveryFeeCents={deliveryFeeCents}
            destinationTaxEnabled={destinationTaxEnabled}
            estimatedTaxCents={estimatedTaxCents}
            estimatedTotalCents={estimatedTotalCents}
            fulfillmentMode={fulfillmentMode}
            fulfillmentSummary={fulfillmentSummary}
            pickupSchedule={pickupSchedule}
            quote={quote}
            shippingFeeCents={shippingFeeCents}
            shippingSelection={shippingSelection}
            shippingTaxLoading={shippingTaxStatus.loading}
            shippingTaxQuoteAvailable={Boolean(shippingTaxQuote)}
          />
        </div>
      </aside>
    </form>
  );
}

type BalloonFulfillmentPreference = {
  version: 1;
  mode: "delivery" | "pickup";
  locationId?: string;
  postalCode?: string;
  address?: LocalDeliveryAddress;
  requestedDate?: string;
  slotId?: string;
  slotLabel?: string;
};

function readBalloonFulfillmentPreference(): BalloonFulfillmentPreference | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem("modern-state-balloon-fulfillment") ?? "null") as Partial<BalloonFulfillmentPreference> | null;
    if (!value || value.version !== 1 || (value.mode !== "delivery" && value.mode !== "pickup") || (value.mode === "pickup" && typeof value.locationId !== "string")) {
      return null;
    }

    const address = value.address;
    const validAddress = address
      && typeof address.line1 === "string"
      && typeof address.city === "string"
      && typeof address.state === "string"
      && typeof address.postalCode === "string"
      && address.country === "US"
      ? address
      : undefined;

    return {
      version: 1,
      mode: value.mode,
      ...(typeof value.locationId === "string" ? { locationId: value.locationId } : {}),
      ...(typeof value.postalCode === "string" && /^\d{5}$/.test(value.postalCode) ? { postalCode: value.postalCode } : {}),
      ...(validAddress ? { address: validAddress } : {}),
      ...(typeof value.requestedDate === "string" ? { requestedDate: value.requestedDate } : {}),
      ...(typeof value.slotId === "string" ? { slotId: value.slotId } : {}),
      ...(typeof value.slotLabel === "string" ? { slotLabel: value.slotLabel } : {})
    };
  } catch {
    return null;
  }
}

function formatPickupDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function CheckoutStatus({ action, description, role, title }: { action?: ReactNode; description: string; role?: "alert" | "status"; title: string }) {
  return (
    <section className="border-y border-border py-10 md:flex md:items-center md:justify-between md:gap-10 md:py-12" role={role}>
      <div className="max-w-2xl">
        <ShoppingBag aria-hidden="true" className="text-secondary" size={24} strokeWidth={1.75} />
        <h2 className="mt-4 font-display text-3xl font-black tracking-[-0.03em] text-primary">{title}</h2>
        <p className="mt-3 text-base leading-7 text-secondary">{description}</p>
      </div>
      {action ? <div className="mt-7 shrink-0 md:mt-0">{action}</div> : null}
    </section>
  );
}

function StepHeading({ title }: { title: string }) {
  return <h2 className="text-xl font-semibold tracking-[-0.01em] text-[#171b16]">{title}</h2>;
}

function CheckoutField({ autoComplete, className = "", label, name, type = "text", placeholder, required = false }: { autoComplete?: string; className?: string; label: string; name: string; type?: string; placeholder: string; required?: boolean }) {
  return (
    <label className={`block text-sm font-bold text-primary ${className}`}>
      {label}
      <input autoComplete={autoComplete} className="mt-2 min-h-12 w-full rounded-[3px] border border-[#cfcfcb] bg-white px-4 py-3 text-sm font-normal outline-none transition focus:border-blue focus:ring-1 focus:ring-blue" name={name} placeholder={placeholder} required={required} type={type} />
    </label>
  );
}

function locationSupportsMode(location: CheckoutLocation, mode: keyof typeof fulfillmentLabels) {
  if (mode === "pickup") return location.pickupEnabled;
  if (mode === "local-delivery") return location.localDeliveryEnabled;
  return location.shippingFulfillmentEnabled;
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${strong ? "text-base font-black text-primary" : ""}`}>
      <span className="text-secondary">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function CheckoutSummary({
  deliveryFeeCents,
  destinationTaxEnabled,
  estimatedTaxCents,
  estimatedTotalCents,
  fulfillmentMode,
  fulfillmentSummary,
  pickupSchedule,
  quote,
  shippingFeeCents,
  shippingSelection,
  shippingTaxLoading,
  shippingTaxQuoteAvailable
}: {
  deliveryFeeCents: number;
  destinationTaxEnabled: boolean;
  estimatedTaxCents: number;
  estimatedTotalCents: number;
  fulfillmentMode: keyof typeof fulfillmentLabels;
  fulfillmentSummary: string;
  pickupSchedule: PickupTimingSelection | null;
  quote: CartQuote;
  shippingFeeCents: number;
  shippingSelection: ShippingSelection | null;
  shippingTaxLoading: boolean;
  shippingTaxQuoteAvailable: boolean;
}) {
  return (
    <div className="mt-5">
      <div className="grid gap-4 border-b border-[#dededb] pb-5">
        {quote.lines.map((line) => (
          <div className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3" key={line.squareVariationId}>
            <div className="relative grid h-14 w-14 place-items-center rounded-[4px] border border-[#d7d7d3] bg-white p-1.5">
              <Image alt="" className="h-full w-full object-contain" height={48} src={line.imageUrl} unoptimized width={48} />
              <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-[#737771] px-1 text-[11px] font-semibold text-white">{line.quantity}</span>
            </div>
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-medium leading-5 text-[#242823]">{line.name}</p>
              <p className="mt-0.5 text-xs text-[#70756e]">{line.checkoutGroup === "balloons" ? "Balloons" : fulfillmentSummary}</p>
            </div>
            <span className="text-sm text-[#242823]">{formatMoney(line.lineTotalCents)}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-3 border-b border-[#dededb] py-5 text-sm">
        <SummaryRow label="Subtotal" value={formatMoney(quote.subtotalCents)} />
        <SummaryRow
          label={fulfillmentMode === "shipping" && destinationTaxEnabled ? "Estimated tax" : quote.taxEstimateIncluded === false ? "Tax" : "Estimated tax"}
          value={fulfillmentMode === "shipping" && destinationTaxEnabled
            ? shippingTaxQuoteAvailable
              ? formatMoney(estimatedTaxCents)
              : shippingTaxLoading ? "Calculating…" : "Select a rate"
            : quote.taxEstimateIncluded === false ? "Calculated by Square" : formatMoney(quote.estimatedTaxCents)}
        />
        {fulfillmentMode === "pickup" && pickupSchedule ? <SummaryRow label="Pickup" value={pickupSchedule.timing === "ASAP" ? "ASAP" : `${formatPickupDate(pickupSchedule.requestedDate)} · ${pickupSchedule.slotLabel}`} /> : null}
        {fulfillmentMode === "local-delivery" ? <SummaryRow label="Delivery" value={deliveryFeeCents > 0 ? formatMoney(deliveryFeeCents) : "Pending"} /> : null}
        {fulfillmentMode === "shipping" ? <SummaryRow label="Shipping" value={shippingSelection ? `${shippingSelection.carrier} · ${formatMoney(shippingFeeCents)}` : "Pending"} /> : null}
      </div>
      <div className="pt-5">
        <SummaryRow label="Total" value={fulfillmentMode === "shipping" && destinationTaxEnabled && !shippingTaxQuoteAvailable ? "Pending tax" : formatMoney(estimatedTotalCents)} strong />
      </div>
    </div>
  );
}
