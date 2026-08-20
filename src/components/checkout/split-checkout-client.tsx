/** Renders a single-payment checkout with independent regular and balloon fulfillment groups. */

"use client";

import { ChevronDown, CreditCard, LockKeyhole, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";
import type { StoredCartItem } from "@/components/commerce/add-to-cart-button";
import type { CheckoutLocation } from "@/components/checkout/checkout-client";
import { LocalDeliveryQuotePanel } from "@/components/fulfillment/local-delivery-quote-panel";
import { PickupSchedulePanel } from "@/components/fulfillment/pickup-schedule-panel";
import { ShippingRatePanel, type ShippingSelection } from "@/components/fulfillment/shipping-rate-panel";
import { Button } from "@/components/ui/button";
import type { LocalDeliveryAddress, LocalDeliverySelection } from "@/features/fulfillment/contracts/orderpro-local-delivery";
import type { PickupTimingSelection } from "@/features/fulfillment/contracts/orderpro-pickup";
import { formatMoney } from "@/lib/utils";

type FulfillmentMode = "pickup" | "local-delivery" | "shipping";
type CheckoutGroupId = "regular" | "balloons";

type MixedCheckoutGroup = {
  id: CheckoutGroupId;
  label: string;
  itemCount: number;
  subtotalCents: number;
  estimatedTaxCents: number;
  compatibleFulfillmentModes: FulfillmentMode[];
  lines: Array<{ squareVariationId: string; quantity: number; name: string }>;
};

type MixedCartQuote = {
  lines: Array<{
    squareVariationId: string;
    quantity: number;
    name: string;
    imageUrl: string;
    lineTotalCents: number;
    checkoutGroup: CheckoutGroupId;
  }>;
  itemCount: number;
  subtotalCents: number;
  estimatedTaxCents: number;
  taxEstimateIncluded?: boolean;
  totalCents: number;
  errors: string[];
  warnings: string[];
  checkoutGroups: MixedCheckoutGroup[];
};

type BalloonPreference = {
  mode: "delivery" | "pickup";
  locationId?: string;
  postalCode?: string;
  address?: LocalDeliveryAddress;
  requestedDate?: string;
  slotId?: string;
  slotLabel?: string;
};

type GroupSelection = {
  mode: FulfillmentMode;
  locationId: string;
  pickup: PickupTimingSelection | null;
  localDelivery: LocalDeliverySelection | null;
  shipping: ShippingSelection | null;
};

const modeLabels: Record<FulfillmentMode, string> = {
  pickup: "Pickup",
  "local-delivery": "Local delivery",
  shipping: "Shipping"
};

export function SplitCheckoutClient({
  balloonPreference,
  deliveryTestMode,
  items,
  localDeliveryCheckoutEnabled,
  locations,
  quote,
  shippingCheckoutEnabled,
  squareCheckoutEnabled
}: {
  balloonPreference: BalloonPreference | null;
  deliveryTestMode: boolean;
  items: StoredCartItem[];
  localDeliveryCheckoutEnabled: boolean;
  locations: CheckoutLocation[];
  quote: MixedCartQuote;
  shippingCheckoutEnabled: boolean;
  squareCheckoutEnabled: boolean;
}) {
  const regularGroup = quote.checkoutGroups.find((group) => group.id === "regular")!;
  const balloonGroup = quote.checkoutGroups.find((group) => group.id === "balloons")!;
  const regularModes = enabledModes(regularGroup, localDeliveryCheckoutEnabled, shippingCheckoutEnabled);
  const balloonModes = enabledModes(balloonGroup, localDeliveryCheckoutEnabled, false);
  const preferredBalloonMode: FulfillmentMode = balloonPreference?.mode === "delivery" ? "local-delivery" : "pickup";
  const [regular, setRegular] = useState<GroupSelection>(() => initialGroupSelection(regularModes[0] ?? "pickup", locations));
  const [balloons, setBalloons] = useState<GroupSelection>(() => {
    const mode = balloonModes.includes(preferredBalloonMode) ? preferredBalloonMode : balloonModes[0] ?? "pickup";
    const selection = initialGroupSelection(mode, locations, balloonPreference?.locationId);
    if (mode === "pickup" && balloonPreference?.requestedDate && balloonPreference.slotId && balloonPreference.slotLabel) {
      selection.pickup = {
        timing: "SCHEDULED",
        requestedDate: balloonPreference.requestedDate,
        slotId: balloonPreference.slotId,
        slotLabel: balloonPreference.slotLabel
      };
    }
    return selection;
  });
  const [message, setMessage] = useState<{ tone: "idle" | "success" | "error"; text: string }>({ tone: "idle", text: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idempotency = useRef<{ payload: string; key: string } | null>(null);
  const regularItems = useMemo(() => groupItems(regularGroup, items), [items, regularGroup]);
  const balloonItems = useMemo(() => groupItems(balloonGroup, items), [balloonGroup, items]);
  const fulfillmentFees = (regular.localDelivery?.quote.feeCents ?? regular.shipping?.amountCents ?? 0)
    + (balloons.localDelivery?.quote.feeCents ?? balloons.shipping?.amountCents ?? 0);
  const ready = groupReady(regular, regularModes, locations)
    && groupReady(balloons, balloonModes, locations)
    && quote.errors.length === 0;

  function updateMode(id: CheckoutGroupId, mode: FulfillmentMode) {
    const setter = id === "regular" ? setRegular : setBalloons;
    setter(initialGroupSelection(mode, locations));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setMessage({ tone: "idle", text: "Preparing one secure Square payment for both fulfillment groups..." });
    try {
      const payload = {
        version: 2 as const,
        items,
        fulfillmentGroups: [
          groupPayload("regular", regular),
          groupPayload("balloons", balloons)
        ],
        customer: {
          name: String(formData.get("name") ?? ""),
          email: String(formData.get("email") ?? ""),
          phone: String(formData.get("phone") ?? "")
        }
      };
      const serialized = JSON.stringify(payload);
      if (!idempotency.current || idempotency.current.payload !== serialized) {
        idempotency.current = { payload: serialized, key: crypto.randomUUID() };
      }
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotency.current.key },
        body: serialized
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
      setMessage({ tone: "success", text: "Opening your combined Square payment..." });
      window.location.assign(result.checkoutUrl);
    } catch {
      setMessage({ tone: "error", text: "Checkout request failed. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mx-auto grid w-full max-w-[1140px] lg:grid-cols-[minmax(0,700px)_440px]" onSubmit={submit}>
      <div className="min-w-0 px-5 pb-12 lg:px-12 lg:pb-16">
        <section className="py-8">
          <StepHeading title="Contact information" />
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Field autoComplete="name" className="sm:col-span-2" label="Name" name="name" placeholder="Full name" required />
            <Field autoComplete="email" label="Email" name="email" placeholder="you@example.com" required type="email" />
            <Field autoComplete="tel" label="Phone" name="phone" placeholder="(212) 555-0100" required type="tel" />
          </div>
        </section>

        <section className="border-t border-[#dededb] py-8">
          <StepHeading title="Fulfillment" />
          <div className="mt-6 grid gap-6">
            <GroupEditor
              deliveryTestMode={deliveryTestMode}
              group={regularGroup}
              items={regularItems}
              locations={locations}
              modes={regularModes}
              onChange={setRegular}
              onModeChange={(mode) => updateMode("regular", mode)}
              selection={regular}
            />
            <GroupEditor
              balloonPreference={balloonPreference}
              deliveryTestMode={deliveryTestMode}
              group={balloonGroup}
              items={balloonItems}
              locations={locations}
              modes={balloonModes}
              onChange={setBalloons}
              onModeChange={(mode) => updateMode("balloons", mode)}
              selection={balloons}
            />
          </div>
          {quote.errors.length > 0 ? <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{quote.errors.join(" ")}</p> : null}
          {quote.warnings.length > 0 ? <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{quote.warnings.join(" ")}</p> : null}
        </section>

        <section className="border-t border-[#dededb] py-8">
          <StepHeading title="Payment" />
          <div className="mt-5 flex items-center justify-between gap-4 rounded-[3px] border border-[#cfcfcb] bg-[#fafaf8] px-4 py-3.5 text-sm text-[#4f554d]">
            <span className="flex items-center gap-3"><CreditCard aria-hidden="true" size={18} />One secure payment with Square</span>
            <LockKeyhole aria-hidden="true" size={16} />
          </div>
          {!squareCheckoutEnabled ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Secure checkout is temporarily unavailable.</p> : null}
          <div className="mt-6 flex justify-end">
            <Button className="w-full gap-2 rounded-[3px] py-3.5 text-sm font-semibold sm:w-auto sm:min-w-56" disabled={!squareCheckoutEnabled || !ready || isSubmitting} type="submit">
              <ShieldCheck aria-hidden="true" size={16} />
              {isSubmitting ? "Opening Square..." : "Pay combined total"}
            </Button>
          </div>
          {message.text ? <p className={`mt-4 rounded-md border p-3 text-sm ${message.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : message.tone === "success" ? "border-green-200 bg-green-50 text-green-900" : "border-border bg-surface-muted text-secondary"}`} role="status">{message.text}</p> : null}
        </section>
      </div>

      <details className="group order-first border-b border-[#dededb] bg-[#f7f7f5] lg:hidden">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 text-sm font-semibold">
          <span className="flex items-center gap-2">Order summary <ChevronDown aria-hidden="true" className="transition group-open:rotate-180" size={16} /></span>
          <span>{formatMoney(quote.totalCents + fulfillmentFees)}</span>
        </summary>
        <div className="border-t border-[#dededb] px-5 py-6">
          <SplitSummary balloons={balloons} fulfillmentFees={fulfillmentFees} quote={quote} regular={regular} />
        </div>
      </details>

      <aside className="hidden min-h-full border-l border-[#dededb] bg-[#f7f7f5] px-10 py-8 lg:block">
        <div className="sticky top-8">
          <h2 className="text-lg font-semibold text-[#171b16]">Order summary</h2>
          <SplitSummary balloons={balloons} fulfillmentFees={fulfillmentFees} quote={quote} regular={regular} />
        </div>
      </aside>
    </form>
  );
}

function GroupEditor({
  balloonPreference,
  deliveryTestMode,
  group,
  items,
  locations,
  modes,
  onChange,
  onModeChange,
  selection
}: {
  balloonPreference?: BalloonPreference | null;
  deliveryTestMode: boolean;
  group: MixedCheckoutGroup;
  items: StoredCartItem[];
  locations: CheckoutLocation[];
  modes: FulfillmentMode[];
  onChange: (selection: GroupSelection) => void;
  onModeChange: (mode: FulfillmentMode) => void;
  selection: GroupSelection;
}) {
  const lockedBalloonMode = group.id === "balloons" && Boolean(balloonPreference);
  const eligibleLocations = locations.filter((location) => locationSupports(location, selection.mode));
  return (
    <article className="rounded-[4px] border border-[#d4d4d0] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div><h3 className="text-lg font-semibold text-[#171b16]">{group.label}</h3><p className="mt-1 text-sm text-secondary">{group.itemCount} {group.itemCount === 1 ? "item" : "items"} · {formatMoney(group.subtotalCents)}</p></div>
        {lockedBalloonMode ? <Link className="text-sm text-blue underline underline-offset-4" href="/balloons">Change</Link> : null}
      </div>

      <div className={`mt-4 grid gap-3 ${modes.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {(lockedBalloonMode ? modes.filter((mode) => mode === selection.mode) : modes).map((mode) => (
          <label className={`cursor-pointer rounded-[3px] border px-4 py-3.5 text-sm font-semibold ${selection.mode === mode ? "border-blue bg-blue/[0.04] text-primary ring-1 ring-blue" : "border-[#cfcfcb] text-secondary"}`} key={mode}>
            <input checked={selection.mode === mode} className="sr-only" name={`${group.id}-fulfillment-mode`} onChange={() => onModeChange(mode)} type="radio" value={mode} />
            {modeLabels[mode]}
          </label>
        ))}
      </div>

      {selection.mode !== "local-delivery" ? (
        <label className="mt-4 block text-sm font-bold text-primary">
          Fulfilling location
          <select className="mt-2 min-h-12 w-full rounded-[3px] border border-[#cfcfcb] bg-white px-3 py-2 font-normal" onChange={(event) => onChange({ ...selection, locationId: event.target.value, pickup: selection.mode === "pickup" && group.id === "regular" ? { timing: "ASAP" } : null, shipping: null })} value={selection.locationId}>
            {eligibleLocations.map((location) => <option key={location.id} value={location.id}>{location.name} — {location.address}</option>)}
          </select>
        </label>
      ) : null}

      {selection.mode === "pickup" ? (
        group.id === "balloons" && selection.pickup?.timing === "SCHEDULED" ? (
          <p className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900"><strong>Scheduled pickup:</strong> {selection.pickup.requestedDate} · {selection.pickup.slotLabel}</p>
        ) : (
          <PickupSchedulePanel context={group.id} items={items} locationId={selection.locationId} onSelectionChange={(pickup) => onChange({ ...selection, pickup })} />
        )
      ) : null}

      {selection.mode === "local-delivery" ? (
        <div className="mt-5 border-t border-border pt-5">
          <LocalDeliveryQuotePanel
            context="checkout"
            items={items}
            initialAddress={group.id === "balloons" ? balloonPreference?.address : undefined}
            initialPostalCode={group.id === "balloons" ? balloonPreference?.postalCode : undefined}
            initialRequestedDate={group.id === "balloons" ? balloonPreference?.requestedDate : undefined}
            onSelectionChange={(localDelivery) => onChange({
              ...selection,
              localDelivery,
              ...(localDelivery ? { locationId: localDelivery.quote.selectedLocationId } : {})
            })}
            selectionName={group.id}
            testMode={deliveryTestMode}
          />
        </div>
      ) : null}

      {selection.mode === "shipping" ? (
        <div className="mt-5 border-t border-border pt-5">
          <ShippingRatePanel items={items} locationId={selection.locationId} onSelectionChange={(shipping) => onChange({ ...selection, shipping })} />
        </div>
      ) : null}
    </article>
  );
}

function enabledModes(group: MixedCheckoutGroup, deliveryEnabled: boolean, shippingEnabled: boolean) {
  return group.compatibleFulfillmentModes.filter((mode) =>
    (mode !== "local-delivery" || deliveryEnabled)
    && (mode !== "shipping" || shippingEnabled)
    && (group.id !== "balloons" || mode !== "shipping")
  );
}

function initialGroupSelection(mode: FulfillmentMode, locations: CheckoutLocation[], preferredLocationId?: string): GroupSelection {
  const preferred = locations.find((location) => location.id === preferredLocationId && locationSupports(location, mode));
  const location = preferred ?? locations.find((candidate) => locationSupports(candidate, mode)) ?? locations[0];
  return {
    mode,
    locationId: location?.id ?? "",
    pickup: mode === "pickup" ? { timing: "ASAP" } : null,
    localDelivery: null,
    shipping: null
  };
}

function locationSupports(location: CheckoutLocation, mode: FulfillmentMode) {
  if (mode === "pickup") return location.pickupEnabled;
  if (mode === "local-delivery") return location.localDeliveryEnabled;
  return location.shippingFulfillmentEnabled;
}

function groupReady(selection: GroupSelection, modes: FulfillmentMode[], locations: CheckoutLocation[]) {
  if (!modes.includes(selection.mode)) return false;
  if (!locations.some((location) => location.id === selection.locationId && locationSupports(location, selection.mode))) return false;
  if (selection.mode === "pickup") return Boolean(selection.pickup);
  if (selection.mode === "local-delivery") return Boolean(selection.localDelivery);
  return Boolean(selection.shipping);
}

function groupItems(group: MixedCheckoutGroup, items: StoredCartItem[]) {
  const ids = new Set(group.lines.map((line) => line.squareVariationId));
  return items.filter((item) => ids.has(item.squareVariationId));
}

function groupPayload(id: CheckoutGroupId, selection: GroupSelection) {
  return {
    id,
    fulfillmentMode: selection.mode,
    locationId: selection.locationId,
    ...(selection.mode === "pickup" && selection.pickup ? {
      pickup: selection.pickup.timing === "ASAP" ? { timing: "ASAP" as const } : {
        timing: "SCHEDULED" as const,
        requestedDate: selection.pickup.requestedDate,
        slotId: selection.pickup.slotId,
        slotLabel: selection.pickup.slotLabel
      }
    } : {}),
    ...(selection.mode === "local-delivery" && selection.localDelivery ? {
      localDelivery: {
        quoteId: selection.localDelivery.quote.quoteId,
        slotId: selection.localDelivery.slotId,
        feeCents: selection.localDelivery.quote.feeCents,
        requestedDate: selection.localDelivery.quote.requestedDate,
        address: selection.localDelivery.quote.normalizedAddress
      }
    } : {}),
    ...(selection.mode === "shipping" && selection.shipping ? { shipping: selection.shipping } : {})
  };
}

function StepHeading({ title }: { title: string }) {
  return <h2 className="text-xl font-semibold tracking-[-0.01em] text-[#171b16]">{title}</h2>;
}

function Field({ autoComplete, className = "", label, name, placeholder, required = false, type = "text" }: { autoComplete?: string; className?: string; label: string; name: string; placeholder: string; required?: boolean; type?: string }) {
  return <label className={`block text-sm font-bold text-primary ${className}`}>{label}<input autoComplete={autoComplete} className="mt-2 min-h-12 w-full rounded-[3px] border border-[#cfcfcb] bg-white px-4 py-3 font-normal outline-none focus:border-blue focus:ring-1 focus:ring-blue" name={name} placeholder={placeholder} required={required} type={type} /></label>;
}

function SummaryRow({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  return <div className={`flex items-start justify-between gap-4 ${strong ? "text-base font-black text-primary" : ""}`}><span className="text-secondary">{label}</span><span className="text-right">{value}</span></div>;
}

function SplitSummary({
  balloons,
  fulfillmentFees,
  quote,
  regular
}: {
  balloons: GroupSelection;
  fulfillmentFees: number;
  quote: MixedCartQuote;
  regular: GroupSelection;
}) {
  return (
    <div className="mt-5">
      <div className="grid gap-4 border-b border-[#dededb] pb-5">
        {quote.lines.map((line) => {
          const selection = line.checkoutGroup === "balloons" ? balloons : regular;
          return (
            <div className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3" key={line.squareVariationId}>
              <div className="relative grid h-14 w-14 place-items-center rounded-[4px] border border-[#d7d7d3] bg-white p-1.5">
                <Image alt="" className="h-full w-full object-contain" height={48} src={line.imageUrl} unoptimized width={48} />
                <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-[#737771] px-1 text-[11px] font-semibold text-white">{line.quantity}</span>
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium leading-5 text-[#242823]">{line.name}</p>
                <p className="mt-0.5 text-xs text-[#70756e]">{selectionLabel(selection)}</p>
              </div>
              <span className="text-sm text-[#242823]">{formatMoney(line.lineTotalCents)}</span>
            </div>
          );
        })}
      </div>
      <div className="grid gap-3 border-b border-[#dededb] py-5 text-sm">
        <SummaryRow label="Subtotal" value={formatMoney(quote.subtotalCents)} />
        <SummaryRow label={quote.taxEstimateIncluded === false ? "Tax" : "Estimated tax"} value={quote.taxEstimateIncluded === false ? "Calculated by Square" : formatMoney(quote.estimatedTaxCents)} />
        {fulfillmentFees > 0 ? <SummaryRow label="Shipping and delivery" value={formatMoney(fulfillmentFees)} /> : null}
      </div>
      <div className="pt-5">
        <SummaryRow label="Total" strong value={formatMoney(quote.totalCents + fulfillmentFees)} />
      </div>
    </div>
  );
}

function selectionLabel(selection: GroupSelection) {
  if (selection.mode !== "pickup") return modeLabels[selection.mode];
  if (!selection.pickup || selection.pickup.timing === "ASAP") return "Pickup · ASAP";
  return `Pickup · ${selection.pickup.slotLabel}`;
}
