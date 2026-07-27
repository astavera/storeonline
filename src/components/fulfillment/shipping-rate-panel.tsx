"use client";

import { PackageSearch, Truck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

export type ShippingSelection = {
  quoteToken: string;
  rateId: string;
  amountCents: number;
  carrier: string;
  serviceName: string;
  readyToShipDate: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: "US";
  };
};

type ShippingRate = Omit<ShippingSelection, "address"> & {
  currency: "USD";
  estimatedDays: number | null;
  durationTerms: string | null;
  expiresAt: string;
};

const emptyAddress = {
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US" as const
};

export function ShippingRatePanel({
  items,
  locationId,
  onSelectionChange
}: {
  items: Array<{ squareVariationId: string; quantity: number }>;
  locationId: string;
  onSelectionChange: (selection: ShippingSelection | null) => void;
}) {
  const [address, setAddress] = useState(emptyAddress);
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [selectedRateId, setSelectedRateId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function checkRates() {
    setIsLoading(true);
    setMessage("Checking OrderPRO availability and live carrier prices...");
    setRates([]);
    setSelectedRateId("");
    onSelectionChange(null);

    try {
      const response = await fetch("/api/shipping/rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items,
          locationId,
          address: {
            line1: address.line1,
            ...(address.line2.trim() ? { line2: address.line2 } : {}),
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            country: "US"
          }
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !Array.isArray(result.rates)) {
        setMessage(Array.isArray(result.errors) ? result.errors.join(" ") : "Live shipping rates are unavailable.");
        return;
      }
      setRates(result.rates);
      setMessage(result.rates.length > 0 ? "Select one live rate. No label is purchased until the order is packed." : "No rates are available.");
    } catch {
      setMessage("We couldn’t check shipping rates. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function selectRate(rate: ShippingRate) {
    setSelectedRateId(rate.rateId);
    onSelectionChange({
      quoteToken: rate.quoteToken,
      rateId: rate.rateId,
      amountCents: rate.amountCents,
      carrier: rate.carrier,
      serviceName: rate.serviceName,
      readyToShipDate: rate.readyToShipDate,
      address: {
        line1: address.line1.trim(),
        ...(address.line2.trim() ? { line2: address.line2.trim() } : {}),
        city: address.city.trim(),
        state: address.state.trim().toUpperCase(),
        postalCode: address.postalCode.trim(),
        country: "US"
      }
    });
  }

  function updateAddress(field: keyof typeof emptyAddress, value: string) {
    setAddress((current) => ({ ...current, [field]: value }));
    setRates([]);
    setSelectedRateId("");
    setMessage("");
    onSelectionChange(null);
  }

  return (
    <section className="surface-card p-6" data-store-area="Checkout" data-store-component="ShippingRatePanel" data-store-section="checkout.shipping" data-store-variant="shippo-live-rates">
      <div className="flex items-center gap-2">
        <Truck aria-hidden="true" size={18} />
        <h2 className="font-display text-2xl font-semibold">Shipping address and rate</h2>
      </div>
      <p className="mt-3 text-sm text-secondary">OrderPRO confirms where the items are located and when they reach WH01. Shippo then returns the live carrier price.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <ShippingField label="Street address" onChange={(value) => updateAddress("line1", value)} required value={address.line1} />
        <ShippingField label="Apt, suite, unit" onChange={(value) => updateAddress("line2", value)} value={address.line2} />
        <ShippingField label="City" onChange={(value) => updateAddress("city", value)} required value={address.city} />
        <ShippingField label="State" maxLength={2} onChange={(value) => updateAddress("state", value)} required value={address.state} />
        <ShippingField label="ZIP code" maxLength={10} onChange={(value) => updateAddress("postalCode", value)} required value={address.postalCode} />
      </div>

      <Button className="mt-5 gap-2" disabled={isLoading || !locationId} onClick={checkRates} type="button">
        <PackageSearch aria-hidden="true" size={16} />
        {isLoading ? "Checking rates..." : "Check shipping rates"}
      </Button>

      {message ? <p className="mt-4 rounded-md border border-border bg-surface-muted p-3 text-sm text-secondary" role="status">{message}</p> : null}

      {rates.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {rates.map((rate) => (
            <label className={`flex cursor-pointer items-start justify-between gap-4 rounded-md border p-4 ${selectedRateId === rate.rateId ? "border-primary bg-surface-muted" : "border-border"}`} key={rate.rateId}>
              <span className="flex items-start gap-3">
                <input checked={selectedRateId === rate.rateId} className="mt-1" name="shippingRate" onChange={() => selectRate(rate)} type="radio" value={rate.rateId} />
                <span>
                  <span className="block font-semibold">{rate.carrier} · {rate.serviceName}</span>
                  <span className="mt-1 block text-sm text-secondary">
                    Ready at WH01 {formatDate(rate.readyToShipDate)}
                    {rate.estimatedDays !== null ? ` · about ${rate.estimatedDays} carrier day${rate.estimatedDays === 1 ? "" : "s"} after handoff` : ""}
                  </span>
                </span>
              </span>
              <strong>{formatMoney(rate.amountCents)}</strong>
            </label>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ShippingField({ label, value, onChange, required = false, maxLength }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; maxLength?: number }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary"
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type="text"
        value={value}
      />
    </label>
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}
