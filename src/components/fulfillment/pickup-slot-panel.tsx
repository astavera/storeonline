/** Renders authoritative Pickup date and slot selection for the general checkout. */

"use client";

import { CalendarDays, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { OrderProPickupAvailability } from
  "@/features/fulfillment/contracts/orderpro-pickup";
import {
  earliestNewYorkDeliveryDate,
  latestNewYorkDeliveryDate
} from "@/features/fulfillment/utils/new-york-delivery-date";

export type PickupSelection = {
  quoteId: string;
  requestedDate: string;
  slotId: string;
  slotLabel: string;
  startsAt: string;
  endsAt: string;
};

type Props = {
  locationId: string;
  items: Array<{ squareVariationId: string; quantity: number }>;
  initialRequestedDate?: string;
  initialSlotId?: string;
  onSelectionChange(selection: PickupSelection | null): void;
};

export function PickupSlotPanel({
  locationId,
  items,
  initialRequestedDate,
  initialSlotId,
  onSelectionChange
}: Props) {
  const [requestedDate, setRequestedDate] = useState(
    initialRequestedDate ?? earliestNewYorkDeliveryDate()
  );
  const [availability, setAvailability] = useState<OrderProPickupAvailability | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [quoteExpired, setQuoteExpired] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    const controller = new AbortController();
    // A store/date/cart change invalidates prior evidence immediately.
    /* eslint-disable react-hooks/set-state-in-effect */
    setAvailability(null);
    setSelectedSlotId("");
    setQuoteExpired(false);
    setLoading(true);
    onSelectionChange(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    void fetch("/api/fulfillment/pickup-slots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locationId, requestedDate, items }),
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        const result = await response.json() as { availability?: OrderProPickupAvailability };
        if (version !== requestVersion.current) return;
        const next = result.availability ?? unavailable();
        setAvailability(next);
        if (
          next.available && next.quoteId && initialSlotId &&
          next.availableSlots.some((slot) => slot.id === initialSlotId)
        ) {
          const slot = next.availableSlots.find((candidate) => candidate.id === initialSlotId)!;
          setSelectedSlotId(slot.id);
          onSelectionChange({
            quoteId: next.quoteId,
            requestedDate,
            slotId: slot.id,
            slotLabel: slot.label,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt
          });
        }
      })
      .catch((error: unknown) => {
        if (version === requestVersion.current && !(error instanceof DOMException && error.name === "AbortError")) {
          setAvailability(unavailable());
        }
      })
      .finally(() => {
        if (version === requestVersion.current) setLoading(false);
      });

    return () => {
      controller.abort();
      if (version === requestVersion.current) requestVersion.current += 1;
    };
  }, [initialSlotId, items, locationId, onSelectionChange, requestedDate]);

  useEffect(() => {
    if (!availability?.available) return;
    const delay = Math.min(
      2_147_483_647,
      Math.max(0, Date.parse(availability.expiresAt) - Date.now())
    );
    const timeout = window.setTimeout(() => {
      setQuoteExpired(true);
      setSelectedSlotId("");
      onSelectionChange(null);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [availability, onSelectionChange]);

  function select(slotId: string) {
    if (!availability?.available || !availability.quoteId) return;
    const slot = availability.availableSlots.find((candidate) => candidate.id === slotId);
    if (!slot || quoteExpired) {
      setSelectedSlotId("");
      onSelectionChange(null);
      return;
    }
    setSelectedSlotId(slot.id);
    onSelectionChange({
      quoteId: availability.quoteId,
      requestedDate,
      slotId: slot.id,
      slotLabel: slot.label,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt
    });
  }

  return (
    <section className="mt-4 rounded-md border border-border bg-surface-muted p-4" data-store-component="PickupSlotPanel">
      <div className="flex items-center gap-2">
        <CalendarDays aria-hidden="true" className="text-primary" size={18} />
        <h3 className="font-semibold">Choose a pickup date and time</h3>
      </div>
      <label className="mt-4 block text-sm font-semibold">
        Pickup date
        <input
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary"
          max={latestNewYorkDeliveryDate()}
          min={earliestNewYorkDeliveryDate()}
          onChange={(event) => setRequestedDate(event.target.value)}
          required
          type="date"
          value={requestedDate}
        />
      </label>
      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-secondary" role="status">
          <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
          Checking current Pickup capacity and inventory...
        </p>
      ) : availability?.available && availability.availableSlots.length > 0 ? (
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Available times</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {availability.availableSlots.map((slot) => (
              <label
                className={`rounded-md border bg-surface p-3 text-sm font-semibold ${selectedSlotId === slot.id ? "border-primary text-primary" : "border-border text-secondary"}`}
                key={slot.id}
              >
                <input
                  checked={selectedSlotId === slot.id}
                  className="sr-only"
                  name="pickup-slot"
                  onChange={() => select(slot.id)}
                  type="radio"
                  value={slot.id}
                />
                {slot.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
          {availability?.available
            ? "No Pickup times remain for this date. Choose another date."
            : availability?.message ?? "Pickup times are unavailable. Try again."}
        </p>
      )}
    </section>
  );
}

function unavailable(): OrderProPickupAvailability {
  return {
    available: false,
    source: "ORDERPRO",
    reasonCode: "ORDERPRO_UNAVAILABLE",
    message: "We could not load Pickup times. Try again."
  };
}
