"use client";

import {
  BadgeCheck,
  ChevronRight,
  Clock3,
  Minus,
  PackageOpen,
  Plus,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  X
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  readCartItems,
  writeCartItems,
  type StoredCartItem
} from "@/components/commerce/add-to-cart-button";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";

type BalloonFulfillmentMode = "pickup" | "local-delivery";

export type LatexBalloonAddOnCatalog = {
  hiFloat?: StorefrontProduct;
  weights: StorefrontProduct[];
};

export type BalloonOrderCollection = {
  slug: string;
  title: string;
  description: string;
};

type BalloonOrderExperienceProps = {
  addOns?: LatexBalloonAddOnCatalog;
  collection: BalloonOrderCollection;
  fulfillment?: BalloonFulfillmentMode;
  location?: string;
  requestedDate?: string;
  slotLabel?: string;
  products: StorefrontProduct[];
};

type LatexOrderExperienceProps = Omit<BalloonOrderExperienceProps, "collection"> & {
  addOns: LatexBalloonAddOnCatalog;
};

const finishFilters = ["All", "Classic", "Neon", "Pastel", "Pearl", "Metallic"] as const;
type FinishFilter = (typeof finishFilters)[number];

const latexCollection: BalloonOrderCollection = {
  slug: "latex",
  title: "Latex Balloons",
  description: "Choose a color, quantity, and finishing touches for your balloons."
};

const noAddOns: LatexBalloonAddOnCatalog = { weights: [] };

export function LatexOrderExperience(props: LatexOrderExperienceProps) {
  return <BalloonOrderExperience {...props} collection={latexCollection} />;
}

export function BalloonOrderExperience({ addOns = noAddOns, collection, fulfillment = "pickup", location, products, requestedDate, slotLabel }: BalloonOrderExperienceProps) {
  const isLatex = collection.slug === "latex";
  const [selectedFinish, setSelectedFinish] = useState<FinishFilter>("All");
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [includeHiFloat, setIncludeHiFloat] = useState(false);
  const [selectedWeightId, setSelectedWeightId] = useState<string | null>(null);
  const [storedItems, setStoredItems] = useState<StoredCartItem[]>([]);
  const [addedMessage, setAddedMessage] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const purchasableProducts = useMemo(
    () => products.filter((product) => product.priceAvailable !== false && product.inventoryStatus !== "out-of-stock"),
    [products]
  );
  const filteredProducts = useMemo(
    () => !isLatex || selectedFinish === "All"
      ? purchasableProducts
      : purchasableProducts.filter((product) => productFinish(product.name) === selectedFinish),
    [isLatex, purchasableProducts, selectedFinish]
  );
  const productByVariationId = useMemo(
    () => new Map([...products, ...(addOns.hiFloat ? [addOns.hiFloat] : []), ...addOns.weights].map((product) => [product.squareVariationId, product])),
    [addOns, products]
  );
  const orderLines = useMemo(
    () => storedItems.flatMap((item) => {
      const product = productByVariationId.get(item.squareVariationId);
      return product ? [{ product, quantity: item.quantity }] : [];
    }),
    [productByVariationId, storedItems]
  );
  const orderSubtotal = orderLines.reduce((total, line) => total + line.product.priceCents * line.quantity, 0);
  const orderQuantity = orderLines.reduce((total, line) => total + line.quantity, 0);
  const selectedWeight = addOns.weights.find((weight) => weight.squareVariationId === selectedWeightId);
  const selectedTotal = selectedProduct
    ? selectedProduct.priceCents * quantity
      + (includeHiFloat && addOns.hiFloat ? addOns.hiFloat.priceCents * quantity : 0)
      + (selectedWeight?.priceCents ?? 0)
    : 0;

  useEffect(() => {
    const relevantIds = new Set(productByVariationId.keys());

    function refreshOrder() {
      setStoredItems(readCartItems().filter((item) => relevantIds.has(item.squareVariationId)));
    }

    refreshOrder();
    window.addEventListener("modern-state-cart-updated", refreshOrder);
    window.addEventListener("storage", refreshOrder);
    return () => {
      window.removeEventListener("modern-state-cart-updated", refreshOrder);
      window.removeEventListener("storage", refreshOrder);
    };
  }, [productByVariationId]);

  useEffect(() => {
    if (!selectedProduct) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedProduct(null);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedProduct]);

  function openProduct(product: StorefrontProduct) {
    setSelectedProduct(product);
    setQuantity(1);
    setIncludeHiFloat(false);
    setSelectedWeightId(null);
  }

  function addToOrder() {
    if (!selectedProduct) return;

    const nextItems = [...readCartItems()];
    mergeCartItem(nextItems, selectedProduct.squareVariationId, quantity);
    if (includeHiFloat && addOns.hiFloat) mergeCartItem(nextItems, addOns.hiFloat.squareVariationId, quantity);
    if (selectedWeight) mergeCartItem(nextItems, selectedWeight.squareVariationId, 1);
    writeCartItems(nextItems);
    window.dispatchEvent(new CustomEvent("modern-state-cart-updated"));
    setAddedMessage(`${quantity} ${quantity === 1 ? "item" : "items"} added to your order.`);
    window.setTimeout(() => setAddedMessage(""), 2500);
    setSelectedProduct(null);
  }

  function updateOrderItem(squareVariationId: string, quantity: number) {
    const nextItems = readCartItems()
      .map((item) => item.squareVariationId === squareVariationId ? { ...item, quantity: Math.max(0, Math.min(99, quantity)) } : item)
      .filter((item) => item.quantity > 0);
    writeCartItems(nextItems);
    window.dispatchEvent(new CustomEvent("modern-state-cart-updated"));
  }

  const fulfillmentLabel = fulfillment === "local-delivery" ? "Local delivery" : "Pickup";

  return (
    <div className="mx-auto w-[calc(100%_-_2rem)] max-w-[1480px] pb-24 lg:pb-8">
      <header className="mb-4 rounded-md border border-border bg-surface-muted px-5 py-4">
        <h1 className="font-display text-2xl font-black text-primary">{collection.title}</h1>
      </header>

      <section aria-label="Current fulfillment" className="mb-7 flex flex-col gap-4 rounded-xl border border-border bg-surface px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-cyan text-blue">
            {fulfillment === "local-delivery" ? <Truck aria-hidden="true" size={20} /> : <Store aria-hidden="true" size={20} />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-blue">{fulfillmentLabel}</p>
            <p className="truncate font-black text-primary">{formatLocationName(location, fulfillment)}</p>
            <p className="flex items-center gap-1 text-sm text-secondary"><Clock3 aria-hidden="true" size={14} /> {formatFulfillmentTiming(requestedDate, slotLabel)}</p>
          </div>
        </div>
        <Link className="inline-flex min-h-11 items-center justify-center rounded-pill border border-border px-5 text-sm font-black text-primary hover:bg-surface-muted" href="/balloons">Change</Link>
      </section>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_350px]">
        <section aria-labelledby="balloon-products-title">
          <div className="mb-5">
            <p className="text-sm font-black text-blue">Build your order</p>
            <h2 className="mt-1 font-display text-3xl font-black text-primary" id="balloon-products-title">Choose your balloons</h2>
            <p className="mt-2 max-w-2xl text-secondary">{isLatex ? "Select a color, choose the quantity, and add finishing touches." : collection.description} Prices are supplied by Square and confirmed again before payment.</p>
          </div>

          {purchasableProducts.length > 0 ? (
            <>
              {isLatex ? (
                <div className="mb-5 flex gap-2 overflow-x-auto pb-2" aria-label="Filter Latex balloons by finish">
                  {finishFilters.map((finish) => (
                    <button aria-pressed={selectedFinish === finish} className={selectedFinish === finish ? "shrink-0 rounded-pill bg-primary px-4 py-2 text-sm font-black text-white" : "shrink-0 rounded-pill border border-border bg-surface px-4 py-2 text-sm font-black text-secondary hover:bg-surface-muted"} key={finish} onClick={() => setSelectedFinish(finish)} type="button">
                      {finish}
                    </button>
                  ))}
                </div>
              ) : null}

              {filteredProducts.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredProducts.map((product) => (
                    <article className="group overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-card" key={product.squareVariationId}>
                      <button className="block w-full text-left" onClick={() => openProduct(product)} type="button">
                        <span className="block aspect-[4/3] bg-white p-5">
                          <Image alt={product.name} className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]" height={360} src={product.imageUrl || "/images/product-fallback.svg"} unoptimized width={480} />
                        </span>
                        <span className="block p-4">
                          <span className="text-xs font-black uppercase tracking-[0.12em] text-blue">{isLatex ? `${productFinish(product.name)} finish` : product.department}</span>
                          <span className="mt-1 block min-h-12 font-display text-lg font-black leading-snug text-primary">{displayProductName(product.name, isLatex)}</span>
                          <span className="mt-2 block line-clamp-2 min-h-10 text-sm text-secondary">{isLatex ? "11-inch Latex balloon" : product.shortDescription || collection.title}</span>
                          <span className="mt-4 flex items-center justify-between gap-3">
                            <strong className="text-lg text-primary">{formatMoney(product.priceCents)} each</strong>
                            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-white" aria-hidden="true"><Plus size={18} /></span>
                          </span>
                        </span>
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-border bg-surface-muted p-6 text-center text-secondary">No balloons match this finish yet.</p>
              )}
            </>
          ) : (
            <CatalogUnavailable collectionTitle={collection.title} />
          )}
        </section>

        <aside className="surface-card hidden p-5 lg:sticky lg:top-28 lg:block" id="balloon-order-summary">
          <OrderSummary isLatex={isLatex} lines={orderLines} onUpdate={updateOrderItem} subtotal={orderSubtotal} />
        </aside>
      </div>

      {orderQuantity > 0 ? (
        <button className="fixed inset-x-4 bottom-4 z-30 flex min-h-14 items-center justify-between rounded-pill bg-primary px-5 font-black text-white shadow-card lg:hidden" onClick={() => document.getElementById("balloon-mobile-order")?.scrollIntoView({ behavior: "smooth" })} type="button">
          <span className="flex items-center gap-2"><ShoppingBag aria-hidden="true" size={19} /> View order · {orderQuantity}</span>
          <span>{formatMoney(orderSubtotal)}</span>
        </button>
      ) : null}

      <section className="mt-8 surface-card p-5 lg:hidden" id="balloon-mobile-order">
        <OrderSummary isLatex={isLatex} lines={orderLines} onUpdate={updateOrderItem} subtotal={orderSubtotal} />
      </section>

      <span className="sr-only" role="status">{addedMessage}</span>

      {selectedProduct ? (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-primary/45 backdrop-blur-[2px] sm:p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedProduct(null);
        }}>
          <section aria-labelledby="balloon-customizer-title" aria-modal="true" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-surface shadow-card sm:h-full sm:max-h-none sm:max-w-[520px] sm:rounded-2xl" role="dialog">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-blue">Customize</p>
                <h2 className="font-display text-xl font-black text-primary" id="balloon-customizer-title">{displayProductName(selectedProduct.name, isLatex)}</h2>
              </div>
              <button aria-label="Close customizer" className="grid h-10 w-10 place-items-center rounded-full border border-border" onClick={() => setSelectedProduct(null)} ref={closeButtonRef} type="button"><X aria-hidden="true" size={20} /></button>
            </div>

            <div className="p-5">
              <div className="mb-6 grid grid-cols-[110px_minmax(0,1fr)] gap-4 rounded-xl bg-surface-muted p-4">
                <Image alt="" aria-hidden="true" className="h-28 w-full object-contain" height={112} src={selectedProduct.imageUrl || "/images/product-fallback.svg"} unoptimized width={112} />
                <div className="self-center">
                  <p className="text-sm font-black text-blue">{isLatex ? `${productFinish(selectedProduct.name)} · 11 inch` : selectedProduct.department}</p>
                  <p className="mt-1 text-sm text-secondary">Square item: {selectedProduct.name}</p>
                  <p className="mt-2 text-lg font-black text-primary">{formatMoney(selectedProduct.priceCents)} each</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-y border-border py-4">
                <div>
                  <p className="font-black text-primary">How many balloons?</p>
                  <p className="text-sm text-secondary">Add between 1 and 99.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button aria-label="Decrease quantity" className="grid h-10 w-10 place-items-center rounded-full border border-border disabled:opacity-40" disabled={quantity === 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))} type="button"><Minus aria-hidden="true" size={17} /></button>
                  <strong className="min-w-7 text-center">{quantity}</strong>
                  <button aria-label="Increase quantity" className="grid h-10 w-10 place-items-center rounded-full border border-border" onClick={() => setQuantity((value) => Math.min(99, value + 1))} type="button"><Plus aria-hidden="true" size={17} /></button>
                </div>
              </div>

              {addOns.hiFloat ? (
                <fieldset className="mt-6 border-0 p-0">
                  <legend className="font-display text-lg font-black text-primary">Float longer</legend>
                  <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl border border-border p-4">
                    <input checked={includeHiFloat} className="h-5 w-5 accent-[var(--color-primary)]" onChange={(event) => setIncludeHiFloat(event.target.checked)} type="checkbox" />
                    <span className="min-w-0 flex-1"><strong className="block text-primary">Hi-Float treatment</strong><small className="text-secondary">Applied to every balloon in this selection.</small></span>
                    <strong>+{formatMoney(addOns.hiFloat.priceCents)} each</strong>
                  </label>
                </fieldset>
              ) : null}

              {addOns.weights.length > 0 ? (
                <fieldset className="mt-6 border-0 p-0">
                  <legend className="font-display text-lg font-black text-primary">Add a balloon weight</legend>
                  <p className="mt-1 text-sm text-secondary">Optional · one weight for this selection</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {addOns.weights.map((weight) => {
                      const selected = selectedWeightId === weight.squareVariationId;
                      return (
                        <button aria-pressed={selected} className={`flex min-h-20 items-center gap-3 rounded-xl border p-3 text-left ${selected ? "border-primary bg-surface-muted" : "border-border bg-surface"}`} key={weight.squareVariationId} onClick={() => setSelectedWeightId(selected ? null : weight.squareVariationId)} type="button">
                          <Image alt="" aria-hidden="true" className="h-12 w-12 shrink-0 object-contain" height={48} src={weight.imageUrl || "/images/product-fallback.svg"} unoptimized width={48} />
                          <span><strong className="block text-sm text-primary">{displayWeightName(weight.name)}</strong><small className="text-secondary">+{formatMoney(weight.priceCents)}</small></span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}
            </div>

            <div className="sticky bottom-0 border-t border-border bg-surface p-4">
              <button className="flex min-h-14 w-full items-center justify-between rounded-pill bg-primary px-5 font-black text-white" onClick={addToOrder} type="button">
                <span>Add to order</span>
                <span>{formatMoney(selectedTotal)}</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function CatalogUnavailable({ collectionTitle }: { collectionTitle: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
      <PackageOpen aria-hidden="true" className="mx-auto text-secondary" size={42} />
      <h3 className="mt-4 font-display text-2xl font-black text-primary">{collectionTitle} ordering is temporarily unavailable</h3>
      <p className="mx-auto mt-2 max-w-lg text-secondary">We are refreshing product availability for this location. Choose another fulfillment location or try again shortly.</p>
      <Link className="mt-5 inline-flex min-h-11 items-center justify-center rounded-pill border border-border px-5 text-sm font-black text-primary" href="/balloons">Change fulfillment</Link>
    </div>
  );
}

function OrderSummary({ isLatex, lines, onUpdate, subtotal }: { isLatex: boolean; lines: Array<{ product: StorefrontProduct; quantity: number }>; onUpdate: (id: string, quantity: number) => void; subtotal: number }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <ShoppingBag aria-hidden="true" size={20} />
        <h2 className="font-display text-xl font-black text-primary">Your order</h2>
      </div>
      {lines.length === 0 ? (
        <div className="py-10 text-center">
          <PackageOpen aria-hidden="true" className="mx-auto text-secondary" size={38} />
          <p className="mt-3 font-black text-primary">Your order is empty</p>
          <p className="mt-1 text-sm text-secondary">Choose a balloon to get started.</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4">
          {lines.map(({ product, quantity }) => (
            <div className="border-b border-border pb-4" key={product.squareVariationId}>
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-black text-primary">{displayOrderLineName(product.name, isLatex)}</p>
                  <p className="mt-1 text-sm text-secondary">{formatMoney(product.priceCents)} each</p>
                </div>
                <strong>{formatMoney(product.priceCents * quantity)}</strong>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="inline-flex items-center rounded-pill border border-border">
                  <button aria-label={`Decrease ${product.name}`} className="grid h-8 w-8 place-items-center" onClick={() => onUpdate(product.squareVariationId, quantity - 1)} type="button"><Minus aria-hidden="true" size={14} /></button>
                  <span className="min-w-7 text-center text-sm font-black">{quantity}</span>
                  <button aria-label={`Increase ${product.name}`} className="grid h-8 w-8 place-items-center" onClick={() => onUpdate(product.squareVariationId, quantity + 1)} type="button"><Plus aria-hidden="true" size={14} /></button>
                </div>
                <button aria-label={`Remove ${product.name}`} className="inline-flex items-center gap-1 text-xs font-black text-secondary hover:text-primary" onClick={() => onUpdate(product.squareVariationId, 0)} type="button"><Trash2 aria-hidden="true" size={14} /> Remove</button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between text-lg font-black text-primary"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
          <p className="flex items-start gap-2 text-xs text-secondary"><BadgeCheck aria-hidden="true" className="mt-0.5 shrink-0" size={15} /> Prices and availability are revalidated before payment.</p>
          <Link className="flex min-h-12 w-full items-center justify-center gap-2 rounded-pill bg-primary px-4 font-black text-white" href="/cart">Review cart <ChevronRight aria-hidden="true" size={18} /></Link>
        </div>
      )}
    </div>
  );
}

function mergeCartItem(items: StoredCartItem[], squareVariationId: string, quantity: number) {
  const existing = items.find((item) => item.squareVariationId === squareVariationId);
  if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
  else items.push({ squareVariationId, quantity: Math.min(99, quantity) });
}

function productFinish(name: string): Exclude<FinishFilter, "All"> {
  if (/\bneon\b/i.test(name)) return "Neon";
  if (/\bpastel\b/i.test(name)) return "Pastel";
  if (/\bpearl/i.test(name)) return "Pearl";
  if (/\b(metallic|reflex|chrome)\b/i.test(name)) return "Metallic";
  return "Classic";
}

function displayLatexName(name: string) {
  return name
    .replace(/^11["”]?\s*/i, "")
    .replace(/\s+Latex Balloons?$/i, "")
    .replace(/^Deluxe\s+/i, "")
    .trim();
}

function displayProductName(name: string, isLatex: boolean) {
  return isLatex ? displayLatexName(name) : name.trim();
}

function displayWeightName(name: string) {
  return name.replace(/^Balloon Weights?\s*/i, "").replace(/^Holographic\s+/i, "Holographic ").trim() || "Balloon weight";
}

function displayOrderLineName(name: string, isLatex: boolean) {
  if (/hi-float/i.test(name)) return "Hi-Float treatment";
  if (/balloon weight/i.test(name)) return displayWeightName(name) + " weight";
  return displayProductName(name, isLatex);
}

function formatLocationName(location: string | undefined, fulfillment: BalloonFulfillmentMode) {
  if (!location) return fulfillment === "local-delivery" ? "Store assigned at checkout" : "Store selection saved";
  if (["3rd-avenue", "third-avenue", "location-third-avenue"].includes(location)) return "3rd Avenue Store";
  if (["86th-street", "location-86th-street"].includes(location)) return "86th Street Store";
  return location.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatFulfillmentTiming(requestedDate?: string, slotLabel?: string) {
  if (!requestedDate || !slotLabel) return "Choose your time during checkout";
  const [year, month, day] = requestedDate.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return slotLabel;
  const date = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
  return `${date} · ${slotLabel}`;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
