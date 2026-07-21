"use client";

import { CalendarDays, CreditCard, MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { readCartItems, type StoredCartItem } from "@/components/commerce/add-to-cart-button";
import { LocalDeliveryQuotePanel } from "@/components/fulfillment/local-delivery-quote-panel";
import { Button } from "@/components/ui/button";
import type { LocalDeliveryAddress, LocalDeliverySelection } from "@/features/fulfillment/contracts/orderpro-local-delivery";
import { formatMoney } from "@/lib/utils";

type CartQuote = {
  itemCount: number;
  subtotalCents: number;
  estimatedTaxCents: number;
  totalCents: number;
  compatibleFulfillmentModes: Array<"pickup" | "local-delivery" | "shipping">;
  fulfillmentLabel: string;
  errors: string[];
  warnings: string[];
  locationId: string | null;
  locationName: string | null;
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

export function CheckoutClient({ locations, deliveryTestMode = false, localDeliveryCheckoutEnabled = false }: { locations: CheckoutLocation[]; deliveryTestMode?: boolean; localDeliveryCheckoutEnabled?: boolean }) {
  const [cartState, setCartState] = useState<{ hydrated: boolean; items: StoredCartItem[] }>({ hydrated: false, items: [] });
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [isCartQuoteLoading, setIsCartQuoteLoading] = useState(true);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [fulfillmentMode, setFulfillmentMode] = useState<"pickup" | "local-delivery" | "shipping">("pickup");
  const [localDeliverySelection, setLocalDeliverySelection] = useState<LocalDeliverySelection | null>(null);
  const [deliveryPrefill, setDeliveryPrefill] = useState<{ address?: LocalDeliveryAddress; postalCode?: string; requestedDate?: string } | null>(null);
  const [pickupSchedule, setPickupSchedule] = useState<{ requestedDate: string; slotId: string; slotLabel: string } | null>(null);
  const [message, setMessage] = useState<{ tone: "idle" | "success" | "error"; text: string }>({ tone: "idle", text: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idempotency = useRef<{ payload: string; key: string } | null>(null);
  const items = cartState.items;

  useEffect(() => {
    // Cart and balloon preferences live in browser storage and can only be synchronized after hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    setCartState({ hydrated: true, items: readCartItems() });
    const preference = readBalloonFulfillmentPreference();
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
            setPickupSchedule({ requestedDate: preference.requestedDate, slotId: preference.slotId, slotLabel: preference.slotLabel });
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
      body: JSON.stringify({ items, ...(locationId ? { locationId } : {}) })
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
          (mode: "pickup" | "local-delivery" | "shipping") => mode !== "local-delivery" || localDeliveryCheckoutEnabled
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
  }, [cartState.hydrated, items, localDeliveryCheckoutEnabled, locationId]);

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setMessage({ tone: "idle", text: "Checking your order details..." });

    try {
      const payload = {
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
        ...(fulfillmentMode === "pickup" && pickupSchedule ? { pickup: pickupSchedule } : {}),
        customer: {
          name: String(formData.get("name") ?? ""),
          email: String(formData.get("email") ?? ""),
          phone: String(formData.get("phone") ?? "")
        }
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

      setMessage({ tone: "success", text: "Your order details were checked. No order was placed and no payment was taken. Contact the store to complete your purchase." });
    } catch {
      setMessage({ tone: "error", text: "Checkout request failed. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!cartState.hydrated || isCartQuoteLoading) {
    return (
      <div className="surface-card p-6" role="status">
        <h2 className="font-display text-2xl font-semibold">Reviewing your cart</h2>
        <p className="mt-2 text-secondary">Checking current products, prices, and fulfillment options…</p>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="surface-card p-6" role="alert">
        <h2 className="font-display text-2xl font-semibold">We couldn’t review your cart</h2>
        <p className="mt-2 text-secondary">Refresh the page and try again.</p>
      </div>
    );
  }

  if (quote.itemCount === 0) {
    return (
      <div className="surface-card p-6">
        <h2 className="font-display text-2xl font-semibold">Your cart is empty</h2>
        <p className="mt-2 text-secondary">Add products before checkout.</p>
      </div>
    );
  }

  const availableFulfillmentModes = quote.compatibleFulfillmentModes.filter((mode) => mode !== "local-delivery" || localDeliveryCheckoutEnabled);
  const selectedLocation = locations.find((location) => location.id === locationId);
  const deliveryReady = fulfillmentMode !== "local-delivery" || Boolean(localDeliverySelection);
  const canSubmit = Boolean(selectedLocation) && deliveryReady && quote.errors.length === 0 && availableFulfillmentModes.includes(fulfillmentMode);
  const deliveryFeeCents = fulfillmentMode === "local-delivery" ? localDeliverySelection?.quote.feeCents ?? 0 : 0;
  const fulfillmentSummary = availableFulfillmentModes.includes(fulfillmentMode) ? fulfillmentLabels[fulfillmentMode] : "Not available";

  return (
    <form className="grid gap-6 lg:grid-cols-[1fr_380px]" onSubmit={submitCheckout}>
      <div className="space-y-6">
        <section className="surface-card p-6" data-store-area="Checkout" data-store-component="CheckoutCustomerInfoSection" data-store-section="checkout.customer-info" data-store-variant="form">
          <h2 className="font-display text-2xl font-semibold">Contact information</h2>
          <div className="mt-5 grid gap-4">
            <CheckoutField label="Name" name="name" placeholder="Full name" required />
            <CheckoutField label="Email" name="email" placeholder="you@example.com" required type="email" />
            <CheckoutField label="Phone" name="phone" placeholder="(212) 555-0100" required type="tel" />
          </div>
        </section>

        <section className="surface-card p-6" data-store-area="Checkout" data-store-component="CheckoutFulfillmentSection" data-store-section="checkout.fulfillment" data-store-variant="fulfillment-groups">
          <div className="flex items-center gap-2">
            <MapPin aria-hidden="true" size={18} />
            <h2 className="font-display text-2xl font-semibold">Fulfillment preference</h2>
          </div>
          {locations.length > 0 && fulfillmentMode !== "local-delivery" ? (
            <label className="mt-5 block text-sm font-semibold">
              Store fulfilling this order
              <select className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" onChange={(event) => { setLocationId(event.target.value); setPickupSchedule(null); }} value={locationId}>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name} — {location.address}</option>)}
              </select>
            </label>
          ) : locations.length === 0 ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">No Square-mapped fulfillment location is currently available.</p> : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {availableFulfillmentModes.map((mode) => (
              <label className={`rounded-md border p-3 text-sm font-semibold ${fulfillmentMode === mode ? "border-primary bg-surface-muted text-primary" : "border-border text-secondary"}`} key={mode}>
                <input checked={fulfillmentMode === mode} className="sr-only" name="fulfillmentMode" onChange={() => {
                  setFulfillmentMode(mode);
                  if (mode !== "local-delivery") setLocalDeliverySelection(null);
                }} type="radio" value={mode} />
                {fulfillmentLabels[mode]}
              </label>
            ))}
          </div>
          {fulfillmentMode === "pickup" && pickupSchedule ? (
            <div className="mt-4 flex items-start gap-3 rounded-md border border-border bg-surface-muted p-4">
              <CalendarDays aria-hidden="true" className="mt-0.5 shrink-0 text-primary" size={18} />
              <div>
                <p className="text-sm font-semibold text-primary">Pickup date and time</p>
                <p className="mt-1 text-sm text-secondary">{formatPickupDate(pickupSchedule.requestedDate)} · {pickupSchedule.slotLabel}</p>
              </div>
            </div>
          ) : null}
          {!localDeliveryCheckoutEnabled && quote.compatibleFulfillmentModes.includes("local-delivery") ? (
            <p className="mt-4 rounded-md border border-border bg-surface-muted p-3 text-sm text-secondary">Local delivery is being connected to OrderPRO and is not available at checkout yet.</p>
          ) : null}
          {quote.errors.length > 0 ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{quote.errors.join(" ")}</p> : null}
          {quote.warnings?.length > 0 ? <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{quote.warnings.join(" ")}</p> : null}
        </section>

        {fulfillmentMode === "local-delivery" ? (
          <LocalDeliveryQuotePanel
            context="checkout"
            initialAddress={deliveryPrefill?.address}
            initialPostalCode={deliveryPrefill?.postalCode}
            initialRequestedDate={deliveryPrefill?.requestedDate}
            onSelectionChange={(selection) => {
              setLocalDeliverySelection(selection);
              if (selection) setLocationId(selection.quote.selectedLocationId);
            }}
            testMode={deliveryTestMode}
          />
        ) : null}

        <section className="surface-card p-6" data-store-area="Checkout" data-store-component="CheckoutPaymentSection" data-store-section="checkout.payment" data-store-variant="square-web-payments">
          <div className="flex items-center gap-2">
            <CreditCard aria-hidden="true" size={18} />
            <h2 className="font-display text-2xl font-semibold">Payment</h2>
          </div>
          <p className="mt-3 text-secondary">Online payment is not available yet. You will not be charged when you submit this form.</p>
        </section>
      </div>

      <section className="surface-card h-fit p-6" data-store-area="Checkout" data-store-component="CheckoutOrderSummarySection" data-store-section="checkout.order-summary" data-store-variant="summary">
        <div className="flex items-center gap-2">
          <PackageCheck aria-hidden="true" size={18} />
          <h2 className="font-display text-2xl font-semibold">Order summary</h2>
        </div>
        <div className="mt-5 grid gap-3 text-sm">
          <SummaryRow label="Items" value={String(quote.itemCount)} />
          <SummaryRow label="Store" value={fulfillmentMode === "local-delivery" && !localDeliverySelection ? "Assigned after address check" : selectedLocation?.name ?? "Unavailable"} />
          <SummaryRow label="Subtotal" value={formatMoney(quote.subtotalCents)} />
          <SummaryRow label="Estimated tax" value={formatMoney(quote.estimatedTaxCents)} />
          <SummaryRow label="Fulfillment" value={fulfillmentSummary} />
          {fulfillmentMode === "pickup" && pickupSchedule ? <SummaryRow label="Pickup time" value={`${formatPickupDate(pickupSchedule.requestedDate)} · ${pickupSchedule.slotLabel}`} /> : null}
          {fulfillmentMode === "local-delivery" ? <SummaryRow label="Delivery fee" value={localDeliverySelection ? formatMoney(deliveryFeeCents) : "Check address"} /> : null}
          <div className="border-t border-border pt-3">
            <SummaryRow label="Estimated total" value={formatMoney(quote.totalCents + deliveryFeeCents)} strong />
          </div>
        </div>
        <Button className="mt-6 w-full gap-2" disabled={!canSubmit || isSubmitting} type="submit">
          <ShieldCheck aria-hidden="true" size={16} />
          {isSubmitting ? "Checking..." : "Check order details"}
        </Button>
        {message.text ? (
          <p className={`mt-4 rounded-md border p-3 text-sm ${message.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : message.tone === "success" ? "border-green-200 bg-green-50 text-green-900" : "border-border bg-surface-muted text-secondary"}`} role="status">
            {message.text}
          </p>
        ) : null}
      </section>
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

function CheckoutField({ label, name, type = "text", placeholder, required = false }: { label: string; name: string; type?: string; placeholder: string; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" name={name} placeholder={placeholder} required={required} type={type} />
    </label>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? "text-base font-semibold" : ""}`}>
      <span className="text-secondary">{label}</span>
      <span>{value}</span>
    </div>
  );
}
