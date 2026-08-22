/** Renders ASAP or scheduled pickup selection for one checkout fulfillment group. */

"use client";

import { CalendarDays, Clock3, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  OrderProPickupAvailability,
  PickupTimingSelection
} from "@/features/fulfillment/contracts/orderpro-pickup";
import {
  currentNewYorkDate,
  earliestNewYorkDeliveryDate,
  latestNewYorkDeliveryDate
} from "@/features/fulfillment/utils/new-york-delivery-date";

export function PickupSchedulePanel({
  context,
  items,
  locationId,
  onSelectionChange
}: {
  context: "regular" | "balloons";
  items: Array<{ squareVariationId: string; quantity: number }>;
  locationId: string;
  onSelectionChange: (selection: PickupTimingSelection | null) => void;
}) {
  const scheduledOnly = context === "balloons";
  const [timing, setTiming] = useState<"ASAP" | "SCHEDULED">(scheduledOnly ? "SCHEDULED" : "ASAP");
  const [requestedDate, setRequestedDate] = useState(() => scheduledOnly ? earliestNewYorkDeliveryDate() : currentNewYorkDate());
  const [availability, setAvailability] = useState<OrderProPickupAvailability | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const requestVersion = useRef(0);
  const initialNotificationSent = useRef(false);

  useEffect(() => {
    if (initialNotificationSent.current) return;
    initialNotificationSent.current = true;
    onSelectionChange(scheduledOnly ? null : { timing: "ASAP" });
  }, [onSelectionChange, scheduledOnly]);

  function chooseTiming(value: "ASAP" | "SCHEDULED") {
    requestVersion.current += 1;
    setTiming(value);
    setAvailability(null);
    setSelectedSlotId("");
    onSelectionChange(value === "ASAP" ? { timing: "ASAP" } : null);
  }

  async function loadSlots() {
    const version = ++requestVersion.current;
    setIsLoading(true);
    setAvailability(null);
    setSelectedSlotId("");
    onSelectionChange(null);
    try {
      const response = await fetch("/api/fulfillment/pickup-slots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          context,
          locationId,
          requestedDate,
          cartLines: items.map(({ squareVariationId, quantity }) => ({
            squareVariationId,
            quantity
          }))
        })
      });
      const result = await response.json() as { availability?: OrderProPickupAvailability };
      if (version !== requestVersion.current) return;
      setAvailability(result.availability ?? unavailable());
    } catch {
      if (version === requestVersion.current) setAvailability(unavailable());
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }

  function selectSlot(slotId: string) {
    if (!availability?.available) return;
    const slot = availability.availableSlots.find((candidate) => candidate.id === slotId);
    if (!slot) return;
    setSelectedSlotId(slotId);
    onSelectionChange({
      timing: "SCHEDULED",
      requestedDate,
      slotId: slot.id,
      slotLabel: slot.label,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt
    });
  }

  return (
    <section className="mt-5 rounded-[3px] border border-[#d4d4d0] bg-[#fafaf8] p-4">
      <div className="flex items-center gap-3">
        <Clock3 aria-hidden="true" className="shrink-0" size={18} />
        <h3 className="font-semibold text-primary">Pickup timing</h3>
      </div>

      {!scheduledOnly ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(["ASAP", "SCHEDULED"] as const).map((value) => (
            <label className={`cursor-pointer rounded-md border p-3 text-sm font-bold ${timing === value ? "border-blue bg-surface text-primary ring-1 ring-blue" : "border-border text-secondary"}`} key={value}>
              <input checked={timing === value} className="sr-only" name={`${context}-pickup-timing`} onChange={() => chooseTiming(value)} type="radio" value={value} />
              {value === "ASAP" ? "ASAP" : "Schedule (2+ hours)"}
            </label>
          ))}
        </div>
      ) : null}

      {timing === "SCHEDULED" ? (
        <div className="mt-4">
          <label className="block text-sm font-bold text-primary">
            Pickup date
            <input
              className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 font-normal"
              max={latestNewYorkDeliveryDate()}
              min={scheduledOnly ? earliestNewYorkDeliveryDate() : currentNewYorkDate()}
              onChange={(event) => {
                requestVersion.current += 1;
                setRequestedDate(event.target.value);
                setAvailability(null);
                setSelectedSlotId("");
                onSelectionChange(null);
              }}
              type="date"
              value={requestedDate}
            />
          </label>
          <Button className="mt-3 gap-2" disabled={!locationId || isLoading} onClick={() => { void loadSlots(); }} type="button">
            {isLoading ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <CalendarDays aria-hidden="true" size={16} />}
            {isLoading ? "Checking times..." : "Show pickup times"}
          </Button>
          {availability?.available ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {availability.availableSlots.map((slot) => (
                <label className={`cursor-pointer rounded-md border p-3 text-sm font-bold ${selectedSlotId === slot.id ? "border-blue bg-surface text-primary ring-1 ring-blue" : "border-border bg-surface text-secondary"}`} key={slot.id}>
                  <input checked={selectedSlotId === slot.id} className="sr-only" name={`${context}-pickup-slot`} onChange={() => selectSlot(slot.id)} type="radio" value={slot.id} />
                  {slot.label}
                </label>
              ))}
            </div>
          ) : availability ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">{availability.message}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function unavailable(): OrderProPickupAvailability {
  return {
    available: false,
    source: "MOCK",
    reasonCode: "ORDERPRO_UNAVAILABLE",
    message: "We could not load pickup times. Please try again."
  };
}
