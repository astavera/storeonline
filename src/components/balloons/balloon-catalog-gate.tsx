"use client";

import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  MapPin,
  Store,
  Truck,
  X
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { storeLocations } from "@/config/locations.config";
import type { BalloonDeliveryPostalEligibility } from "@/features/fulfillment/contracts/orderpro-local-delivery";
import type { OrderProPickupAvailability } from "@/features/fulfillment/contracts/orderpro-pickup";
import {
  earliestNewYorkDeliveryDate,
  latestNewYorkDeliveryDate
} from "@/features/fulfillment/utils/new-york-delivery-date";

type FulfillmentMode = "delivery" | "pickup";

type BalloonCatalogItem = {
  title: string;
  collection: string;
  tone: "yellow" | "cyan" | "pink" | "blue";
  imageUrl: string;
  imagePosition: string;
  imageSize?: string;
  ariaLabel: string;
};

const primaryCatalogItems: BalloonCatalogItem[] = [
  { title: "Latex", collection: "latex", tone: "yellow", imageUrl: "/images/balloons/latex-bouquet-v1.png", imagePosition: "center", ariaLabel: "Shop latex balloons" },
  { title: "Mylar", collection: "mylar", tone: "cyan", imageUrl: "/images/balloons/mylar-star-v1.png", imagePosition: "center", ariaLabel: "Shop mylar balloons" },
  { title: "Bouquets", collection: "bouquets", tone: "pink", imageUrl: "/images/balloons/bouquets-cutout-v1.png", imagePosition: "center", ariaLabel: "Shop balloon bouquets" },
  { title: "Arches", collection: "arches", tone: "blue", imageUrl: "/images/balloons/arches-transparent-v4.png", imagePosition: "center", ariaLabel: "Shop balloon arches and columns" }
];

const secondaryCatalogItems: BalloonCatalogItem[] = [
  { title: "Numbers", collection: "numbers", tone: "yellow", imageUrl: "/images/balloons/number-one-balloon-v1.png", imagePosition: "center", imageSize: "125%", ariaLabel: "Shop number balloons" },
  { title: "Letters", collection: "letters", tone: "cyan", imageUrl: "/images/balloons/letter-a-balloon-v1.png", imagePosition: "center", ariaLabel: "Shop letter balloons" },
  { title: "Any Occasion", collection: "any-occasion", tone: "pink", imageUrl: "/images/balloons/any-occasion-balloons-v1.png", imagePosition: "center", ariaLabel: "Shop balloons for any occasion" }
];

const catalogItems = [...primaryCatalogItems, ...secondaryCatalogItems];
const pickupStores = storeLocations.filter((location) => location.pickupEnabled);

export function BalloonCatalogGate({ initialCollection }: { initialCollection?: string }) {
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<BalloonCatalogItem | null>(null);
  const [mode, setMode] = useState<FulfillmentMode | null>(null);
  const [pickupStoreId, setPickupStoreId] = useState(pickupStores[0]?.id ?? "");
  const [pickupSlotId, setPickupSlotId] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [requestedDate, setRequestedDate] = useState(earliestNewYorkDeliveryDate);
  const [postalEligibility, setPostalEligibility] = useState<BalloonDeliveryPostalEligibility | null>(null);
  const [pickupAvailability, setPickupAvailability] = useState<OrderProPickupAvailability | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPickupSlotsLoading, setIsPickupSlotsLoading] = useState(false);
  const deliveryRequestVersionRef = useRef(0);
  const pickupRequestVersionRef = useRef(0);
  const openedInitialCollectionRef = useRef<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const item = catalogItems.find((candidate) => candidate.collection === initialCollection);
    if (!item || openedInitialCollectionRef.current === item.collection) return;

    openedInitialCollectionRef.current = item.collection;
    deliveryRequestVersionRef.current += 1;
    triggerRef.current = null;
    setSelectedItem(item);
    setMode(null);
    setPickupSlotId("");
    setPickupAvailability(null);
    setPostalEligibility(null);
    setIsChecking(false);
  }, [initialCollection]);

  useEffect(() => {
    if (mode !== "pickup" || !pickupStoreId || !requestedDate) return;

    const requestVersion = ++pickupRequestVersionRef.current;
    async function loadPickupSlots() {
      setIsPickupSlotsLoading(true);
      try {
        const response = await fetch("/api/fulfillment/pickup-slots", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locationId: pickupStoreId, requestedDate })
        });
        const result = await response.json() as { availability?: OrderProPickupAvailability };
        if (requestVersion !== pickupRequestVersionRef.current) return;
        setPickupAvailability(result.availability ?? unavailablePickupSlots());
      } catch {
        if (requestVersion !== pickupRequestVersionRef.current) return;
        setPickupAvailability(unavailablePickupSlots());
      } finally {
        if (requestVersion === pickupRequestVersionRef.current) setIsPickupSlotsLoading(false);
      }
    }

    void loadPickupSlots();
    return () => {
      if (requestVersion === pickupRequestVersionRef.current) pickupRequestVersionRef.current += 1;
    };
  }, [mode, pickupStoreId, requestedDate]);

  useEffect(() => {
    if (!selectedItem) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeGate();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedItem]);

  function openGate(item: BalloonCatalogItem, trigger: HTMLButtonElement) {
    deliveryRequestVersionRef.current += 1;
    triggerRef.current = trigger;
    setSelectedItem(item);
    setMode(null);
    setPickupSlotId("");
    setPickupAvailability(null);
    setPostalEligibility(null);
    setIsChecking(false);
  }

  function closeGate() {
    deliveryRequestVersionRef.current += 1;
    setSelectedItem(null);
    setMode(null);
    pickupRequestVersionRef.current += 1;
    setPickupAvailability(null);
    setPostalEligibility(null);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  async function checkDeliveryPostalCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestVersion = ++deliveryRequestVersionRef.current;
    setIsChecking(true);
    setPostalEligibility(null);

    try {
      const response = await fetch("/api/fulfillment/local-delivery-postal-eligibility", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postalCode })
      });
      const result = await response.json() as { eligibility?: BalloonDeliveryPostalEligibility };
      if (requestVersion !== deliveryRequestVersionRef.current) return;
      setPostalEligibility(result.eligibility ?? unavailablePostalEligibility());
    } catch {
      if (requestVersion !== deliveryRequestVersionRef.current) return;
      setPostalEligibility(unavailablePostalEligibility());
    } finally {
      if (requestVersion === deliveryRequestVersionRef.current) setIsChecking(false);
    }
  }

  function resetPostalEligibility() {
    deliveryRequestVersionRef.current += 1;
    setIsChecking(false);
    setPostalEligibility(null);
  }

  function continueToCatalog() {
    if (!selectedItem || !mode) return;

    const params = new URLSearchParams({ collection: selectedItem.collection, fulfillment: mode });

    if (mode === "delivery") {
      if (!postalEligibility?.eligible || Date.parse(postalEligibility.expiresAt) <= Date.now()) return;
      window.sessionStorage.setItem("modern-state-balloon-fulfillment", JSON.stringify({
        version: 1,
        mode,
        postalCode: postalEligibility.postalCode,
        approvalId: postalEligibility.approvalId,
        expiresAt: postalEligibility.expiresAt
      }));
    }

    if (mode === "pickup") {
      const store = pickupStores.find((location) => location.id === pickupStoreId);
      const slot = pickupAvailability?.available ? pickupAvailability.availableSlots.find((candidate) => candidate.id === pickupSlotId) : undefined;
      if (!store || !slot) return;

      window.sessionStorage.setItem("modern-state-balloon-fulfillment", JSON.stringify({
        version: 1,
        mode,
        locationId: store.id,
        locationSlug: store.slug,
        locationName: store.name,
        requestedDate,
        slotId: slot.id,
        slotLabel: slot.label
      }));
      params.set("location", store.slug);
      params.set("pickupDate", requestedDate);
      params.set("pickupSlot", slot.id);
      params.set("pickupSlotLabel", slot.label);
    }

    router.push(`/shop?${params.toString()}`);
  }

  return (
    <>
      <CatalogNavigation ariaLabel="Shop balloons by type" items={primaryCatalogItems} onSelect={openGate} />
      <CatalogNavigation ariaLabel="Shop more balloon collections" className="balloons-hero-links--secondary" items={secondaryCatalogItems} onSelect={openGate} />

      {selectedItem && typeof document !== "undefined"
        ? createPortal(
            <div className="balloons-gate-backdrop" onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeGate();
            }}>
              <section
                aria-label={mode ? undefined : "Choose fulfillment"}
                aria-labelledby={mode ? "balloons-gate-title" : undefined}
                aria-modal="true"
                className={`balloons-gate-modal${mode ? "" : " balloons-gate-modal--compact"}`}
                role="dialog"
              >
                <button aria-label="Close fulfillment selection" className="balloons-gate-modal__close" onClick={closeGate} ref={closeButtonRef} type="button">
                  <X aria-hidden="true" size={21} />
                </button>

                {mode ? (
                  <div className="balloons-gate-modal__header">
                    <span aria-hidden="true" className="balloons-gate-modal__product" style={{ backgroundImage: `url(${selectedItem.imageUrl})` }} />
                    <div>
                      <p className="balloons-eyebrow">Shopping {selectedItem.title}</p>
                      <h2 id="balloons-gate-title">{mode === "delivery" ? "Local delivery" : "Store pickup"}</h2>
                    </div>
                  </div>
                ) : null}

                {!mode ? (
                  <div className="balloons-gate-choices">
                    <button className="balloons-gate-choice" onClick={() => setMode("delivery")} type="button">
                      <span className="balloons-gate-choice__icon"><Truck aria-hidden="true" size={25} /></span>
                      <strong>Local delivery</strong>
                    </button>
                    <button className="balloons-gate-choice" onClick={() => setMode("pickup")} type="button">
                      <span className="balloons-gate-choice__icon"><Store aria-hidden="true" size={25} /></span>
                      <strong>Store pickup</strong>
                    </button>
                  </div>
                ) : null}

                {mode === "delivery" ? (
                  <div className="balloons-gate-panel">
                    <button className="balloons-gate-back" onClick={() => { setMode("pickup"); resetPostalEligibility(); }} type="button"><ArrowLeft aria-hidden="true" size={16} /> Change to pickup</button>

                    {postalEligibility?.eligible ? (
                      <div className="balloons-gate-success" role="status">
                        <span><BadgeCheck aria-hidden="true" size={26} /></span>
                        <div>
                          <p className="balloons-eyebrow">Approved by OrderPro</p>
                          <h3>Local delivery is available for ZIP {postalEligibility.postalCode}.</h3>
                          <div className="balloons-gate-success__details">
                            <span><MapPin aria-hidden="true" size={16} /> ZIP {postalEligibility.postalCode}</span>
                            <span><BadgeCheck aria-hidden="true" size={16} /> Eligibility confirmed</span>
                          </div>
                          <button className="balloons-gate-primary" onClick={continueToCatalog} type="button">Continue to {selectedItem.title} order <ChevronRight aria-hidden="true" size={18} /></button>
                          <p className="balloons-gate-fine-print">We will collect the full address and ask OrderPro to confirm the store, delivery fee, and time during checkout.</p>
                        </div>
                      </div>
                    ) : (
                      <form className="balloons-gate-form" onSubmit={checkDeliveryPostalCode}>
                        <PanelIntro icon="delivery" title="Check your ZIP code">Enter your 5-digit ZIP code. OrderPro will confirm whether you can continue with local delivery.</PanelIntro>
                        <div className="balloons-gate-form__postal">
                          <GateField
                            autoComplete="postal-code"
                            inputMode="numeric"
                            label="ZIP code"
                            maxLength={5}
                            onChange={(value) => { setPostalCode(value.replace(/\D/g, "").slice(0, 5)); resetPostalEligibility(); }}
                            pattern="[0-9]{5}"
                            placeholder="10075"
                            value={postalCode}
                          />
                        </div>
                        {postalEligibility && !postalEligibility.eligible ? <p className="balloons-gate-error" role="alert">{postalEligibility.message}</p> : null}
                        <button className="balloons-gate-primary balloons-gate-primary--postal" disabled={isChecking || postalCode.length !== 5} type="submit">
                          {isChecking ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> : <MapPin aria-hidden="true" size={18} />}
                          {isChecking ? "Checking with OrderPro..." : "Check ZIP code"}
                        </button>
                      </form>
                    )}
                  </div>
                ) : null}

                {mode === "pickup" ? (
                  <div className="balloons-gate-panel">
                    <button className="balloons-gate-back" onClick={() => setMode("delivery")} type="button"><ArrowLeft aria-hidden="true" size={16} /> Change to local delivery</button>
                    <PanelIntro icon="pickup" title="Choose your pickup store">We’ll use this location to show product availability.</PanelIntro>
                    <div className="balloons-gate-stores" role="radiogroup" aria-label="Pickup store">
                      {pickupStores.map((store) => {
                        const selected = store.id === pickupStoreId;
                        return (
                          <button aria-checked={selected} className="balloons-gate-store" data-selected={selected} key={store.id} onClick={() => { setPickupStoreId(store.id); setPickupSlotId(""); setPickupAvailability(null); }} role="radio" type="button">
                            <span className="balloons-gate-store__radio" aria-hidden="true" />
                            <span><strong>{store.name}</strong><small>{store.address}</small><small>{store.locality}</small></span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="balloons-gate-pickup-schedule">
                      <FulfillmentDateField label="Pickup date" onChange={(value) => { setRequestedDate(value); setPickupSlotId(""); setPickupAvailability(null); }} value={requestedDate} />
                      <OrderProSlotPicker
                        date={requestedDate}
                        errorMessage={pickupAvailability && !pickupAvailability.available ? pickupAvailability.message : undefined}
                        isLoading={isPickupSlotsLoading}
                        onSelect={setPickupSlotId}
                        selectedSlotId={pickupSlotId}
                        slots={pickupAvailability?.available ? pickupAvailability.availableSlots : []}
                        title="Pickup time"
                      />
                    </div>
                    <button className="balloons-gate-primary balloons-gate-primary--full" disabled={isPickupSlotsLoading || !pickupSlotId} onClick={continueToCatalog} type="button">Shop {selectedItem.title} balloons <ChevronRight aria-hidden="true" size={18} /></button>
                  </div>
                ) : null}
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function CatalogNavigation({ items, ariaLabel, className, onSelect }: { items: BalloonCatalogItem[]; ariaLabel: string; className?: string; onSelect: (item: BalloonCatalogItem, trigger: HTMLButtonElement) => void; }) {
  return (
    <nav aria-label={ariaLabel} className={`balloons-hero-links ${className ?? ""}`.trim()}>
      {items.map((item) => (
        <button aria-label={item.ariaLabel} className={`balloons-hero-link balloons-hero-link--${item.tone}`} key={item.collection} onClick={(event) => onSelect(item, event.currentTarget)} type="button">
          <span aria-hidden="true" className="balloons-hero-link__media balloons-hero-link__media--cutout" style={{ backgroundImage: `url(${item.imageUrl})`, backgroundPosition: item.imagePosition, ...(item.imageSize ? { backgroundSize: item.imageSize } : {}) }} />
          <span className="balloons-hero-link__label">{item.title}</span>
        </button>
      ))}
    </nav>
  );
}

function PanelIntro({ icon, title, children }: { icon: FulfillmentMode; title: string; children: string }) {
  return (
    <div className="balloons-gate-panel__intro">
      <span>{icon === "delivery" ? <MapPin aria-hidden="true" size={20} /> : <Store aria-hidden="true" size={20} />}</span>
      <div><h3>{title}</h3><p>{children}</p></div>
    </div>
  );
}

function GateField({ label, placeholder, value, onChange, required = true, inputMode, maxLength, autoComplete, pattern }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; required?: boolean; inputMode?: "numeric"; maxLength?: number; autoComplete?: string; pattern?: string; }) {
  return (
    <label className="balloons-gate-field">{label}<input autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} pattern={pattern} placeholder={placeholder} required={required} value={value} /></label>
  );
}

function OrderProSlotPicker({ date, emptyMessage, errorMessage, isLoading = false, onSelect, selectedSlotId, slots, title }: {
  date: string;
  emptyMessage?: string;
  errorMessage?: string;
  isLoading?: boolean;
  onSelect: (slotId: string) => void;
  selectedSlotId: string;
  slots: Array<{ id: string; label: string }>;
  title: string;
}) {
  return (
    <fieldset className="balloons-gate-slots">
      <legend><Clock3 aria-hidden="true" size={16} /> {title}</legend>
      <div>
        {slots.map((slot) => (
          <button aria-pressed={selectedSlotId === slot.id} data-selected={selectedSlotId === slot.id} key={slot.id} onClick={() => onSelect(slot.id)} type="button">{slot.label}</button>
        ))}
        {isLoading ? <p className="balloons-gate-slots__status"><LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> Loading times from OrderPro…</p> : null}
        {!isLoading && errorMessage ? <p className="balloons-gate-slots__status balloons-gate-slots__status--error">{errorMessage}</p> : null}
        {!isLoading && !errorMessage && slots.length === 0 ? (
          <div className="balloons-gate-slots__preview">
            <div aria-hidden="true">
              {[0, 1, 2].map((slot) => <span key={slot}><i /><i /></span>)}
            </div>
            <p>{emptyMessage ?? `Available times from OrderPro will appear here for ${formatDeliveryDate(date, false)}.`}</p>
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}

function FulfillmentDateField({ value, onChange, label = "Delivery date" }: { value: string; onChange: (value: string) => void; label?: string }) {
  const minDate = earliestNewYorkDeliveryDate();
  const maxDate = latestNewYorkDeliveryDate();
  const calendarId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedDayRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStartIso(value));
  const calendarDays = buildCalendarDays(visibleMonth);
  const canShowPreviousMonth = visibleMonth.slice(0, 7) > minDate.slice(0, 7);
  const canShowNextMonth = visibleMonth.slice(0, 7) < maxDate.slice(0, 7);

  useEffect(() => {
    if (!isOpen) return;

    const animationFrame = window.requestAnimationFrame(() => selectedDayRef.current?.focus());
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen]);

  return (
    <div className="balloons-gate-date">
      <span className="balloons-gate-date__heading">{label}</span>
      <button
        aria-controls={calendarId}
        aria-expanded={isOpen}
        aria-label={`${label}, ${formatDeliveryDate(value, true)}`}
        className="balloons-gate-date__control"
        onClick={() => {
          setVisibleMonth(monthStartIso(value));
          setIsOpen((current) => !current);
        }}
        ref={triggerRef}
        type="button"
      >
        <CalendarDays aria-hidden="true" size={19} />
        <strong>{formatDeliveryDate(value, true)}</strong>
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="balloons-date-picker-backdrop" onMouseDown={(event) => {
              if (event.target !== event.currentTarget) return;
              setIsOpen(false);
              triggerRef.current?.focus();
            }}>
              <section aria-label={`Choose ${label.toLowerCase()}`} aria-modal="true" className="balloons-date-picker-dialog" role="dialog">
                <div aria-label={`${formatCalendarMonth(visibleMonth)} calendar`} className="balloons-gate-calendar" id={calendarId} role="group">
                  <div className="balloons-gate-calendar__header">
                    <button aria-label="Previous month" disabled={!canShowPreviousMonth} onClick={() => setVisibleMonth((month) => shiftIsoMonth(month, -1))} type="button">
                      <ChevronLeft aria-hidden="true" size={18} />
                    </button>
                    <strong>{formatCalendarMonth(visibleMonth)}</strong>
                    <button aria-label="Next month" disabled={!canShowNextMonth} onClick={() => setVisibleMonth((month) => shiftIsoMonth(month, 1))} type="button">
                      <ChevronRight aria-hidden="true" size={18} />
                    </button>
                  </div>
                  <div aria-hidden="true" className="balloons-gate-calendar__weekdays">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => <span key={weekday}>{weekday}</span>)}
                  </div>
                  <div className="balloons-gate-calendar__days">
                    {calendarDays.map((day) => {
                      const isSelected = day.value === value;
                      const isDisabled = day.value < minDate || day.value > maxDate;
                      return (
                        <button
                          aria-label={formatCalendarDay(day.value)}
                          aria-pressed={isSelected}
                          data-outside-month={!day.inVisibleMonth}
                          data-selected={isSelected}
                          disabled={isDisabled}
                          key={day.value}
                          onClick={() => {
                            onChange(day.value);
                            setIsOpen(false);
                            triggerRef.current?.focus();
                          }}
                          ref={isSelected ? selectedDayRef : undefined}
                          type="button"
                        >
                          {day.dayNumber}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function shiftIsoDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function monthStartIso(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function shiftIsoMonth(value: string, months: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return date.toISOString().slice(0, 10);
}

function buildCalendarDays(visibleMonth: string) {
  const [year, month] = visibleMonth.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const gridStart = shiftIsoDate(visibleMonth, -monthStart.getUTCDay());

  return Array.from({ length: 42 }, (_, index) => {
    const value = shiftIsoDate(gridStart, index);
    return {
      value,
      dayNumber: Number(value.slice(8, 10)),
      inVisibleMonth: value.slice(0, 7) === visibleMonth.slice(0, 7)
    };
  });
}

function formatCalendarMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatCalendarDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDeliveryDate(value: string, includeWeekday: boolean) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    ...(includeWeekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function unavailablePostalEligibility(): BalloonDeliveryPostalEligibility {
  return { eligible: false, source: "MOCK", reasonCode: "ORDERPRO_UNAVAILABLE", message: "We could not ask OrderPro about this ZIP code. Please try again or choose pickup." };
}

function unavailablePickupSlots(): OrderProPickupAvailability {
  return { available: false, source: "MOCK", reasonCode: "ORDERPRO_UNAVAILABLE", message: "We could not load pickup times from OrderPro. Please try again." };
}
