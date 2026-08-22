/** Renders the store-pickup and local-delivery balloon catalog gate. */

"use client";

import { ArrowLeft, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, CreditCard, LoaderCircle, MapPin, Phone, ShoppingBag, Sparkles, Store, Truck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { storeLocations } from "@/config/locations.config";
import type { BalloonDeliveryPostalEligibility } from "@/features/fulfillment/contracts/orderpro-local-delivery";
import type { OrderProPickupAvailability } from "@/features/fulfillment/contracts/orderpro-pickup";
import { earliestNewYorkDeliveryDate, latestNewYorkDeliveryDate } from "@/features/fulfillment/utils/new-york-delivery-date";

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
  { title: "Bouquets", collection: "bouquets", tone: "pink", imageUrl: "/images/balloons/bouquets-cutout-v1.png", imagePosition: "center", ariaLabel: "Shop balloon bouquets" },
  { title: "Shapes", collection: "mylar", tone: "cyan", imageUrl: "/images/balloons/mylar-star-v1.png", imagePosition: "center", ariaLabel: "Shop shape balloons" },
  { title: "Numbers", collection: "numbers", tone: "yellow", imageUrl: "/images/balloons/number-one-balloon-v1.png", imagePosition: "center", imageSize: "125%", ariaLabel: "Shop number balloons" }
];

const secondaryCatalogItems: BalloonCatalogItem[] = [
  { title: "Letters", collection: "letters", tone: "cyan", imageUrl: "/images/balloons/letter-a-balloon-v1.png", imagePosition: "center", ariaLabel: "Shop letter balloons" },
  { title: "Any Occasion", collection: "any-occasion", tone: "pink", imageUrl: "/images/balloons/any-occasion-balloons-v1.png", imagePosition: "center", ariaLabel: "Shop balloons for any occasion" },
  { title: "Arches", collection: "arches", tone: "blue", imageUrl: "/images/balloons/arches-transparent-v4.png", imagePosition: "center", ariaLabel: "Shop balloon arches and columns" }
];

const catalogItems = [...primaryCatalogItems, ...secondaryCatalogItems];
const pickupStores = storeLocations.filter((location) => location.pickupEnabled);
const deliverySupportStore = storeLocations.find((location) => location.slug === "86th-street")!;

export function BalloonCatalogGate({ initialCollection, previewMode = false }: { initialCollection?: string; previewMode?: boolean }) {
  const router = useRouter();
  const [isGuideOpen, setIsGuideOpen] = useState(false);
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
  const openedGuideRef = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const guideCloseButtonRef = useRef<HTMLButtonElement>(null);
  const guideTriggerRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (previewMode || initialCollection || openedGuideRef.current) return;
    openedGuideRef.current = true;
    setIsGuideOpen(true);
  }, [initialCollection, previewMode]);

  useEffect(() => {
    if (previewMode) return;
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
  }, [initialCollection, previewMode]);

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
    if (!isGuideOpen && !selectedItem) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (isGuideOpen) guideCloseButtonRef.current?.focus();
    else closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (isGuideOpen) closeGuide();
      else closeGate();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isGuideOpen, selectedItem]);

  function openGuide(trigger: HTMLButtonElement) {
    guideTriggerRef.current = trigger;
    setIsGuideOpen(true);
  }

  function closeGuide() {
    setIsGuideOpen(false);
    window.setTimeout(() => guideTriggerRef.current?.focus(), 0);
  }

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
      const eligibility = result.eligibility ?? unavailablePostalEligibility();
      if (eligibility.eligible && Date.parse(eligibility.expiresAt) > Date.now()) {
        continueToCatalog(eligibility);
        return;
      }
      setPostalEligibility(eligibility.eligible ? unavailablePostalEligibility() : eligibility);
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

  function continueToCatalog(deliveryApproval?: BalloonDeliveryPostalEligibility) {
    if (!selectedItem || !mode) return;
    const params = new URLSearchParams({ collection: selectedItem.collection, fulfillment: mode });

    if (mode === "delivery") {
      const approval = deliveryApproval ?? postalEligibility;
      if (!approval?.eligible || Date.parse(approval.expiresAt) <= Date.now()) return;
      window.sessionStorage.setItem("modern-state-balloon-fulfillment", JSON.stringify({
        version: 1,
        mode,
        postalCode: approval.postalCode,
        approvalId: approval.approvalId,
        expiresAt: approval.expiresAt
      }));
      params.set("postalCode", approval.postalCode);
    }

    if (mode === "pickup") {
      const store = pickupStores.find((location) => location.id === pickupStoreId);
      const slot = pickupAvailability?.available
        ? pickupAvailability.availableSlots.find((candidate) => candidate.id === pickupSlotId)
        : undefined;
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
      <CatalogNavigation ariaLabel="Shop balloons by type" items={primaryCatalogItems} onSelect={(item, trigger) => { if (!previewMode) openGate(item, trigger); }} />
      <CatalogNavigation ariaLabel="Shop more balloon collections" className="balloons-hero-links--secondary" items={secondaryCatalogItems} onSelect={(item, trigger) => { if (!previewMode) openGate(item, trigger); }} />
      <div className="balloons-order-guide-trigger-wrap">
        <button aria-disabled={previewMode} className="balloons-order-guide-trigger" onClick={(event) => { if (!previewMode) openGuide(event.currentTarget); }} type="button">
          <CircleHelp aria-hidden="true" size={18} /> How balloon ordering works
        </button>
      </div>

      {isGuideOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="balloons-gate-backdrop" onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeGuide();
            }}>
              <section aria-labelledby="balloons-order-guide-title" aria-modal="true" className="balloons-gate-modal balloons-order-guide" role="dialog">
                <button aria-label="Close balloon ordering guide" className="balloons-gate-modal__close" onClick={closeGuide} ref={guideCloseButtonRef} type="button">
                  <X aria-hidden="true" size={18} strokeWidth={2} />
                </button>

                <header className="balloons-order-guide__header">
                  <h2 id="balloons-order-guide-title">Ordering balloons is easy</h2>
                  <p>Four quick steps and you&apos;re ready to celebrate.</p>
                </header>

                <ol className="balloons-order-guide__steps">
                  <GuideStep icon={<Sparkles aria-hidden="true" size={20} />} number="1" title="Pick your balloons">
                    Choose the style you like.
                  </GuideStep>
                  <GuideStep icon={<Truck aria-hidden="true" size={20} />} number="2" title="Delivery or pickup">
                    Enter your ZIP, or choose a store and pickup time.
                  </GuideStep>
                  <GuideStep icon={<ShoppingBag aria-hidden="true" size={20} />} number="3" title="Add to your cart">
                    Choose the quantity and any extras.
                  </GuideStep>
                  <GuideStep icon={<CreditCard aria-hidden="true" size={20} />} number="4" title="Checkout">
                    Review your order and pay.
                  </GuideStep>
                </ol>

                <div className="balloons-order-guide__footer">
                  <button className="balloons-gate-primary" onClick={closeGuide} type="button">Start shopping <ChevronRight aria-hidden="true" size={18} /></button>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}

      {selectedItem && typeof document !== "undefined"
        ? createPortal(
            <div className="balloons-gate-backdrop" onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeGate();
            }}>
              <section
                aria-label={mode === "delivery" ? "Local delivery" : mode === "pickup" ? "Store pickup" : "Choose fulfillment"}
                aria-modal="true"
                className={`balloons-gate-modal${mode ? ` balloons-gate-modal--active balloons-gate-modal--${mode}` : " balloons-gate-modal--compact"}`}
                role="dialog"
              >
                {mode ? (
                  <div className="balloons-gate-modal__toolbar">
                    <button className="balloons-gate-back" onClick={() => {
                      setMode(mode === "delivery" ? "pickup" : "delivery");
                      if (mode === "delivery") resetPostalEligibility();
                    }} type="button">
                      <ArrowLeft aria-hidden="true" size={16} />
                      {mode === "delivery" ? "Change to pickup" : "Change to local delivery"}
                    </button>
                    <button aria-label="Close fulfillment selection" className="balloons-gate-modal__close" onClick={closeGate} ref={closeButtonRef} type="button">
                      <X aria-hidden="true" size={18} strokeWidth={2.25} />
                    </button>
                  </div>
                ) : (
                  <button aria-label="Close fulfillment selection" className="balloons-gate-modal__close" onClick={closeGate} ref={closeButtonRef} type="button">
                    <X aria-hidden="true" size={18} strokeWidth={2.25} />
                  </button>
                )}

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
                    <form className="balloons-gate-form" onSubmit={checkDeliveryPostalCode}>
                      <PanelIntro icon="delivery" title={`Local delivery for ${selectedItem.title} balloons`} />
                      <div className="balloons-gate-form__postal">
                        <GateField
                          autoComplete="postal-code"
                          inputMode="numeric"
                          label="ZIP code"
                          maxLength={5}
                          onChange={(value) => { setPostalCode(value.replace(/\D/g, "").slice(0, 5)); resetPostalEligibility(); }}
                          pattern="[0-9]{5}"
                          placeholder=""
                          value={postalCode}
                        />
                      </div>
                      {postalEligibility && !postalEligibility.eligible ? (
                        <div className="balloons-gate-error" role="alert">
                          <strong>Sorry, we don&apos;t currently deliver to this area.</strong>
                          <span>We may still be able to help. Contact our store:</span>
                          <a className="balloons-gate-error__phone" href={`tel:${deliverySupportStore.phone.replace(/\D/g, "")}`}>{deliverySupportStore.phone}</a>
                          <a className="balloons-gate-call-action" href={`tel:${deliverySupportStore.phone.replace(/\D/g, "")}`}><Phone aria-hidden="true" size={17} /> Call our store</a>
                        </div>
                      ) : null}
                      <button className="balloons-gate-primary balloons-gate-primary--postal" disabled={isChecking || postalCode.length !== 5} type="submit">
                        {isChecking ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> : <MapPin aria-hidden="true" size={18} />}
                        {isChecking ? "Checking..." : "Check delivery"}
                      </button>
                    </form>
                  </div>
                ) : null}

                {mode === "pickup" ? (
                  <div className="balloons-gate-panel">
                    <PanelIntro icon="pickup" title="Choose your pickup store">This store determines product availability and pickup timing.</PanelIntro>
                    <div aria-label="Pickup store" className="balloons-gate-stores" role="radiogroup">
                      {pickupStores.map((store) => {
                        const selected = store.id === pickupStoreId;
                        return (
                          <button aria-checked={selected} className="balloons-gate-store" data-selected={selected} key={store.id} onClick={() => { setPickupStoreId(store.id); setPickupSlotId(""); setPickupAvailability(null); }} role="radio" type="button">
                            <span aria-hidden="true" className="balloons-gate-store__radio" />
                            <span><strong>{store.name}</strong><small>{shortPickupAddress(store.address)}</small></span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="balloons-gate-pickup-schedule">
                      <FulfillmentDateField onChange={(value) => { setRequestedDate(value); setPickupSlotId(""); setPickupAvailability(null); }} value={requestedDate} />
                      <OrderProSlotPicker
                        date={requestedDate}
                        errorMessage={pickupAvailability && !pickupAvailability.available ? pickupAvailability.message : undefined}
                        isLoading={isPickupSlotsLoading}
                        onSelect={setPickupSlotId}
                        selectedSlotId={pickupSlotId}
                        slots={pickupAvailability?.available ? pickupAvailability.availableSlots : []}
                      />
                    </div>
                    <button className="balloons-gate-primary balloons-gate-primary--full" disabled={isPickupSlotsLoading || !pickupSlotId} onClick={() => continueToCatalog()} type="button">Shop {selectedItem.title} balloons <ChevronRight aria-hidden="true" size={18} /></button>
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

function CatalogNavigation({ items, ariaLabel, className, onSelect }: { items: BalloonCatalogItem[]; ariaLabel: string; className?: string; onSelect: (item: BalloonCatalogItem, trigger: HTMLButtonElement) => void }) {
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

function GuideStep({ children, icon, number, title }: { children: string; icon: ReactNode; number: string; title: string }) {
  return (
    <li>
      <span className="balloons-order-guide__step-number">{number}</span>
      <span className="balloons-order-guide__step-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </li>
  );
}

function PanelIntro({ icon, title, children }: { icon: FulfillmentMode; title: string; children?: string }) {
  return <div className="balloons-gate-panel__intro"><span>{icon === "delivery" ? <MapPin aria-hidden="true" size={20} /> : <Store aria-hidden="true" size={20} />}</span><div><h3>{title}</h3>{children ? <p>{children}</p> : null}</div></div>;
}

function GateField({ label, placeholder, value, onChange, inputMode, maxLength, autoComplete, pattern }: { label: string; placeholder: string; value: string; onChange: (value: string) => void; inputMode?: "numeric"; maxLength?: number; autoComplete?: string; pattern?: string }) {
  return <label className="balloons-gate-field"><span className="balloons-gate-field__label">{label}</span><input autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} pattern={pattern} placeholder={placeholder} required value={value} /></label>;
}

function FulfillmentDateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(value.slice(0, 7));
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const minDate = earliestNewYorkDeliveryDate();
  const maxDate = latestNewYorkDeliveryDate();
  const previousMonth = shiftCalendarMonth(visibleMonth, -1);
  const nextMonth = shiftCalendarMonth(visibleMonth, 1);

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  function openDatePicker() {
    setVisibleMonth(value.slice(0, 7));
    setIsOpen(true);
  }

  function closeDatePicker() {
    setIsOpen(false);
    buttonRef.current?.focus();
  }

  function chooseDate(date: string) {
    onChange(date);
    closeDatePicker();
  }

  return (
    <div className="balloons-gate-date">
      <span className="balloons-gate-date__heading">Pickup date</span>
      <button aria-expanded={isOpen} aria-haspopup="dialog" aria-label={`Choose pickup date, currently ${formatDeliveryDate(value)}`} className="balloons-gate-date__control" onClick={openDatePicker} ref={buttonRef} type="button">
        <CalendarDays aria-hidden="true" size={17} />
        <strong>{formatDeliveryDate(value)}</strong>
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="balloons-date-picker-backdrop" onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeDatePicker();
            }}>
              <section aria-label="Choose pickup date" aria-modal="true" className="balloons-date-picker-dialog" role="dialog">
                <div className="balloons-gate-calendar">
                  <div className="balloons-gate-calendar__header">
                    <button aria-label="Previous month" disabled={!calendarMonthOverlapsWindow(previousMonth, minDate, maxDate)} onClick={() => setVisibleMonth(previousMonth)} type="button"><ChevronLeft aria-hidden="true" size={17} /></button>
                    <strong>{formatCalendarMonth(visibleMonth)}</strong>
                    <button aria-label="Next month" className="balloons-gate-calendar__next" disabled={!calendarMonthOverlapsWindow(nextMonth, minDate, maxDate)} onClick={() => setVisibleMonth(nextMonth)} type="button"><ChevronRight aria-hidden="true" size={17} /></button>
                    <button aria-label="Close pickup date calendar" className="balloons-gate-calendar__close" onClick={closeDatePicker} ref={closeRef} type="button"><X aria-hidden="true" size={17} /></button>
                  </div>
                  <div aria-hidden="true" className="balloons-gate-calendar__weekdays">
                    {shortWeekdays.map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}
                  </div>
                  <div className="balloons-gate-calendar__days">
                    {calendarDaysForMonth(visibleMonth).map((day) => {
                      const unavailable = day.date < minDate || day.date > maxDate;
                      return (
                        <button
                          aria-label={formatCalendarDayLabel(day.date)}
                          aria-pressed={day.date === value}
                          data-outside-month={day.outsideMonth}
                          data-selected={day.date === value}
                          disabled={unavailable}
                          key={day.date}
                          onClick={() => chooseDate(day.date)}
                          type="button"
                        >
                          {day.day}
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

function OrderProSlotPicker({ date, errorMessage, isLoading, onSelect, selectedSlotId, slots }: {
  date: string;
  errorMessage?: string;
  isLoading: boolean;
  onSelect: (slotId: string) => void;
  selectedSlotId: string;
  slots: Array<{ id: string; label: string }>;
}) {
  return (
    <fieldset className="balloons-gate-slots">
      <legend><Clock3 aria-hidden="true" size={16} /> Pickup time</legend>
      <div>
        {slots.map((slot) => (
          <button aria-pressed={selectedSlotId === slot.id} data-selected={selectedSlotId === slot.id} key={slot.id} onClick={() => onSelect(slot.id)} type="button">{slot.label}</button>
        ))}
        {isLoading ? <p className="balloons-gate-slots__status"><LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> Loading times from OrderPro...</p> : null}
        {!isLoading && errorMessage ? <p className="balloons-gate-slots__status balloons-gate-slots__status--error">{errorMessage}</p> : null}
        {!isLoading && !errorMessage && slots.length === 0 ? <p className="balloons-gate-slots__status">Available times from OrderPro will appear here for {formatDeliveryDate(date)}.</p> : null}
      </div>
    </fieldset>
  );
}

function formatDeliveryDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

const shortWeekdays = ["S", "M", "T", "W", "T", "F", "S"];

function calendarDaysForMonth(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, index - firstWeekday + 1));
    const isoDate = date.toISOString().slice(0, 10);
    return { date: isoDate, day: date.getUTCDate(), outsideMonth: isoDate.slice(0, 7) !== monthValue };
  });
}

function shiftCalendarMonth(monthValue: string, offset: number) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}

function calendarMonthOverlapsWindow(monthValue: string, minDate: string, maxDate: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const firstDate = `${monthValue}-01`;
  const lastDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return lastDate >= minDate && firstDate <= maxDate;
}

function formatCalendarMonth(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatCalendarDayLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", weekday: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function shortPickupAddress(value: string) {
  return value
    .replace(/\bEast\b/, "E")
    .replace(/\bStreet\b/, "St")
    .replace(/\bAvenue\b/, "Ave")
    .replace("Ave.,", "Ave,");
}

function unavailablePostalEligibility(): BalloonDeliveryPostalEligibility {
  return { eligible: false, source: "MOCK", reasonCode: "ORDERPRO_UNAVAILABLE", message: "We could not ask OrderPro about this ZIP code. Please try again or choose pickup." };
}

function unavailablePickupSlots(): OrderProPickupAvailability {
  return { available: false, source: "MOCK", reasonCode: "ORDERPRO_UNAVAILABLE", message: "We could not load pickup times from OrderPro. Please try again." };
}
