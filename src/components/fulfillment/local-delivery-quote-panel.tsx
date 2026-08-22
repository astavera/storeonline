/**
 * Renders the local delivery quote panel interface and its user interactions.
 */

"use client";

import { BadgeCheck, CalendarDays, Clock3, LoaderCircle, MapPin, Route, Store } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type {
  LocalDeliveryQuote,
  LocalDeliveryAddress,
  LocalDeliveryQuoteContext,
  LocalDeliverySelection
} from "@/features/fulfillment/contracts/orderpro-local-delivery";
import {
  earliestNewYorkDeliveryDate,
  isWithinNewYorkDeliveryWindow,
  latestNewYorkDeliveryDate
} from "@/features/fulfillment/utils/new-york-delivery-date";
import { formatMoney } from "@/lib/utils";

type LocalDeliveryQuotePanelProps = {
  context: LocalDeliveryQuoteContext;
  items: Array<{ squareVariationId: string; quantity: number }>;
  initialAddress?: LocalDeliveryAddress;
  initialPostalCode?: string;
  initialRequestedDate?: string;
  testMode?: boolean;
  onSelectionChange?: (selection: LocalDeliverySelection | null) => void;
  selectionName?: string;
};

const testAddresses = [
  { label: "500 E 80th St", line1: "500 E 80th St", postalCode: "10075" },
  { label: "599 E 85th St", line1: "599 E 85th St", postalCode: "10028" },
  { label: "316 E 82nd St", line1: "316 E 82nd St", postalCode: "10028" }
];

export function LocalDeliveryQuotePanel({
  context,
  items,
  initialAddress,
  initialPostalCode,
  initialRequestedDate,
  testMode = false,
  onSelectionChange,
  selectionName
}: LocalDeliveryQuotePanelProps) {
  const [line1, setLine1] = useState(initialAddress?.line1 ?? "");
  const [line2, setLine2] = useState(initialAddress?.line2 ?? "");
  const [postalCode, setPostalCode] = useState(initialAddress?.postalCode ?? initialPostalCode ?? "");
  const [requestedDate, setRequestedDate] = useState(() => validInitialDate(initialRequestedDate));
  const [quote, setQuote] = useState<LocalDeliveryQuote | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const requestVersionRef = useRef(0);
  const isEmbeddedInCheckout = context === "checkout";
  const AddressContainer = isEmbeddedInCheckout ? "div" : "form";

  useEffect(() => {
    // Prevent delivery actions from firing before React has attached client handlers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsHydrated(true);
  }, []);

  function resetQuote() {
    requestVersionRef.current += 1;
    setIsLoading(false);
    setQuote(null);
    setSelectedSlotId("");
    onSelectionChange?.(null);
  }

  function applyTestAddress(address: (typeof testAddresses)[number]) {
    setLine1(address.line1);
    setPostalCode(address.postalCode);
    resetQuote();
  }

  async function checkAddress(event?: FormEvent<HTMLElement>) {
    event?.preventDefault();
    const requestVersion = ++requestVersionRef.current;
    setIsLoading(true);
    setQuote(null);
    setSelectedSlotId("");
    onSelectionChange?.(null);

    try {
      const response = await fetch("/api/fulfillment/local-delivery-quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          context,
          cartLines: items.map(({ squareVariationId, quantity }) => ({
            squareVariationId,
            quantity
          })),
          address: {
            line1,
            ...(line2.trim() ? { line2 } : {}),
            city: "New York",
            state: "NY",
            postalCode,
            country: "US"
          },
          requestedDate
        })
      });
      const result = await response.json() as { quote?: LocalDeliveryQuote };
      if (requestVersion !== requestVersionRef.current) return;
      setQuote(result.quote ?? {
        eligible: false,
        source: "MOCK",
        reasonCode: "ORDERPRO_UNAVAILABLE",
        message: "We could not check local delivery. Please try again."
      });
    } catch {
      if (requestVersion !== requestVersionRef.current) return;
      setQuote({
        eligible: false,
        source: "MOCK",
        reasonCode: "ORDERPRO_UNAVAILABLE",
        message: "We could not check local delivery. Please try again."
      });
    } finally {
      if (requestVersion === requestVersionRef.current) setIsLoading(false);
    }
  }

  function selectSlot(slotId: string) {
    setSelectedSlotId(slotId);
    if (quote?.eligible) {
      onSelectionChange?.({ quote, slotId });
    }
  }

  return (
    <section className={isEmbeddedInCheckout ? "p-0" : "surface-card p-6"} data-store-component="LocalDeliveryQuotePanel" data-store-variant={context}>
      <div className="flex items-center gap-3">
        <span className={isEmbeddedInCheckout ? "text-secondary" : "rounded-md bg-surface-muted p-2 text-primary"}><MapPin aria-hidden="true" size={20} /></span>
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-primary">Delivery address</h2>
      </div>

      {testMode ? (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">OrderPro test mode</p>
          <p className="mt-1">Quotes and slots are simulated. Try one of the verified addresses:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {testAddresses.map((address) => (
              <button
                className="rounded-md border border-amber-300 bg-white px-3 py-2 font-semibold transition hover:border-amber-500"
                key={address.line1}
                onClick={() => applyTestAddress(address)}
                type="button"
              >
                Use {address.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <AddressContainer className="mt-5 grid gap-4" onSubmit={isEmbeddedInCheckout ? undefined : checkAddress}>
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <DeliveryField
            label="Street address"
            name="deliveryLine1"
            onChange={(value) => { setLine1(value); resetQuote(); }}
            placeholder="500 E 80th St"
            value={line1}
          />
          <DeliveryField
            label="Apt / suite"
            name="deliveryLine2"
            onChange={(value) => { setLine2(value); resetQuote(); }}
            placeholder="Optional"
            required={false}
            value={line2}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <DeliveryField
            inputMode="numeric"
            label="ZIP code"
            maxLength={5}
            name="deliveryPostalCode"
            onChange={(value) => { setPostalCode(value.replace(/\D/g, "").slice(0, 5)); resetQuote(); }}
            placeholder="10075"
            value={postalCode}
          />
          <label className="block text-sm font-semibold">
            Delivery date
            <input
              className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary"
              max={latestNewYorkDeliveryDate()}
              min={earliestNewYorkDeliveryDate()}
              name="deliveryDate"
              onChange={(event) => { setRequestedDate(event.target.value); resetQuote(); }}
              required
              type="date"
              value={requestedDate}
            />
          </label>
        </div>
        <Button
          className="w-full sm:w-fit"
          disabled={!isHydrated || isLoading}
          onClick={isEmbeddedInCheckout ? () => { void checkAddress(); } : undefined}
          type={isEmbeddedInCheckout ? "button" : "submit"}
        >
          {isLoading ? <LoaderCircle aria-hidden="true" className="mr-2 animate-spin" size={16} /> : <MapPin aria-hidden="true" className="mr-2" size={16} />}
          {isLoading ? "Checking address..." : "Check delivery"}
        </Button>
      </AddressContainer>

      {quote?.eligible ? (
        <div className="mt-6 border-t border-border pt-6" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-green-800">
              <BadgeCheck aria-hidden="true" size={20} />
              <p className="font-semibold">Delivery is available</p>
            </div>
            {quote.source === "MOCK" ? <span className="rounded-pill bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Test quote</span> : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <QuoteMetric icon={Store} label="Fulfilling store" value={quote.selectedLocationName} />
            <QuoteMetric icon={Route} label="Walking route" value={`${quote.walkingDistanceFeet.toLocaleString("en-US")} ft`} />
            <QuoteMetric icon={Clock3} label="Estimated round trip" value={`About ${quote.estimatedRoundTripMinutes} min`} />
            <QuoteMetric icon={BadgeCheck} label="Delivery fee" value={formatMoney(quote.feeCents, quote.currency)} />
          </div>

          <fieldset className="mt-6">
            <legend className="flex items-center gap-2 font-semibold"><CalendarDays aria-hidden="true" size={18} />Available times for {formatSlotDate(requestedDate)}</legend>
            {quote.availableSlots.length > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {quote.availableSlots.map((slot) => (
                <label className={`rounded-md border p-3 text-sm font-semibold ${selectedSlotId === slot.id ? "border-primary bg-surface-muted text-primary" : "border-border text-secondary"}`} key={slot.id}>
                  <input
                    checked={selectedSlotId === slot.id}
                    className="sr-only"
                    name={`${selectionName ?? context}-delivery-slot`}
                    onChange={() => selectSlot(slot.id)}
                    type="radio"
                    value={slot.id}
                  />
                  {slot.label}
                </label>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed border-border bg-surface-muted p-4">
                <div aria-hidden="true" className="grid gap-3 sm:grid-cols-3">
                  {[0, 1, 2].map((slot) => (
                    <span className="grid min-h-12 content-center gap-2 rounded-md border border-dashed border-border bg-surface px-3" key={slot}>
                      <i className="block h-1.5 rounded-pill bg-primary/10" />
                      <i className="block h-1.5 w-3/5 rounded-pill bg-primary/10" />
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-center text-xs text-secondary">Available times from OrderPro will appear here for this date.</p>
              </div>
            )}
          </fieldset>
          <p className="mt-4 text-xs text-secondary">Quote expires in 15 minutes. The address, fee, inventory, and slot will be revalidated before payment.</p>
        </div>
      ) : quote ? (
        <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">{quote.message}</p>
      ) : null}
    </section>
  );
}

function formatSlotDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function DeliveryField({
  label,
  name,
  placeholder,
  value,
  onChange,
  required = true,
  inputMode,
  maxLength
}: {
  label: string;
  name: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  inputMode?: "numeric";
  maxLength?: number;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary"
        inputMode={inputMode}
        maxLength={maxLength}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        value={value}
      />
    </label>
  );
}

function QuoteMetric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Store;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-surface-muted p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-secondary"><Icon aria-hidden="true" size={14} />{label}</div>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function validInitialDate(value?: string) {
  return value && isWithinNewYorkDeliveryWindow(value) ? value : earliestNewYorkDeliveryDate();
}
