/**
 * Renders the cart client interface and its user interactions.
 */

"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { clearCartItems, readCartItems, writeCartItems, type StoredCartItem } from "@/components/commerce/add-to-cart-button";
import { formatMoney } from "@/lib/utils";

type CartQuoteLine = {
  squareVariationId: string;
  slug: string;
  name: string;
  department: string;
  imageUrl: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
};

type CartQuote = {
  lines: CartQuoteLine[];
  itemCount: number;
  subtotalCents: number;
  estimatedTaxCents: number;
  taxEstimateIncluded?: boolean;
  totalCents: number;
  compatibleFulfillmentModes: string[];
  fulfillmentLabel: string;
  errors: string[];
};

const emptyQuote: CartQuote = {
  lines: [],
  itemCount: 0,
  subtotalCents: 0,
  estimatedTaxCents: 0,
  totalCents: 0,
  compatibleFulfillmentModes: [],
  fulfillmentLabel: "",
  errors: []
};

export function CartClient({ mode = "cart" }: { mode?: "cart" | "summary" }) {
  const [items, setItems] = useState<StoredCartItem[]>([]);
  const [quote, setQuote] = useState<CartQuote>(emptyQuote);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [requestFailed, setRequestFailed] = useState(false);
  const canCheckout = quote.lines.length > 0 && quote.errors.length === 0;

  useEffect(() => {
    setItems(readCartItems());
    setIsHydrated(true);

    function handleCartUpdate() {
      setItems(readCartItems());
    }

    window.addEventListener("modern-state-cart-updated", handleCartUpdate);
    window.addEventListener("storage", handleCartUpdate);

    return () => {
      window.removeEventListener("modern-state-cart-updated", handleCartUpdate);
      window.removeEventListener("storage", handleCartUpdate);
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    let ignore = false;
    setIsLoading(true);
    setRequestFailed(false);

    fetch("/api/cart", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ items })
    })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (!ignore) {
          const errors = Array.isArray(result.errors) ? result.errors.filter((error: unknown): error is string => typeof error === "string") : [];
          setQuote(result.quote ?? { ...emptyQuote, errors });
          setRequestFailed(!response.ok && !result.quote);
        }
      })
      .catch(() => {
        if (!ignore) {
          setRequestFailed(true);
          setQuote({ ...emptyQuote, errors: ["We couldn’t update your cart. Refresh the page and try again."] });
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [isHydrated, items]);

  function updateQuantity(squareVariationId: string, quantity: number) {
    const nextItems = items
      .map((item) => (item.squareVariationId === squareVariationId ? { ...item, quantity: Math.max(0, Math.min(99, quantity)) } : item))
      .filter((item) => item.quantity > 0);
    writeCartItems(nextItems);
    setItems(nextItems);
    window.dispatchEvent(new CustomEvent("modern-state-cart-updated"));
  }

  function removeUnavailableItems() {
    clearCartItems();
    setItems([]);
  }

  if (!isHydrated || isLoading) {
    return (
      <CartStatus
        description="Confirming current products, prices, and availability."
        role="status"
        title="Reviewing your cart"
      />
    );
  }

  if (items.length === 0) {
    return <EmptyCartStatus />;
  }

  if (requestFailed) {
    return (
      <CartStatus
        action={<button className="min-h-11 rounded-pill bg-[var(--theme-action)] px-6 py-3 text-sm font-black text-[var(--theme-action-foreground)] transition hover:opacity-90" onClick={() => window.location.reload()} type="button">Try again</button>}
        description={quote.errors.join(" ") || "Refresh the page and try again."}
        role="alert"
        title="We couldn’t review your cart"
      />
    );
  }

  if (quote.lines.length === 0) {
    return (
      <CartStatus
        action={<button className="min-h-11 rounded-pill bg-[var(--theme-action)] px-6 py-3 text-sm font-black text-[var(--theme-action-foreground)] transition hover:opacity-90" onClick={removeUnavailableItems} type="button">Remove unavailable items</button>}
        description={quote.errors.join(" ") || "Remove these saved items before adding current products."}
        role="alert"
        title="These items are no longer available"
      />
    );
  }

  return (
    <div className={mode === "summary" ? "grid gap-4" : "grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-14"}>
      {mode === "cart" ? (
        <section aria-label="Cart items">
          {quote.lines.map((line) => (
            <article className="grid grid-cols-[92px_minmax(0,1fr)] gap-4 border-t border-border py-5 last:border-b sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-5 sm:py-6" key={line.squareVariationId}>
              <Link className="block self-start overflow-hidden border border-border bg-surface-muted" href={`/products/${line.slug}`}>
                <Image alt={line.name} className="aspect-square h-auto w-full object-contain" height={120} src={line.imageUrl} unoptimized width={120} />
              </Link>
              <div className="flex min-w-0 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-black leading-tight text-primary sm:text-xl">
                      <Link className="transition hover:text-blue" href={`/products/${line.slug}`}>{line.name}</Link>
                    </h2>
                    <p className="mt-2 text-xs text-secondary">{formatMoney(line.unitPriceCents)} each</p>
                  </div>
                  <p className="shrink-0 font-black text-primary">{formatMoney(line.lineTotalCents)}</p>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 sm:mt-auto sm:pt-5">
                  <div aria-label={`Quantity for ${line.name}`} className="inline-flex min-h-10 items-center rounded-pill border border-border bg-surface" role="group">
                    <button aria-label={`Decrease ${line.name} quantity`} className="grid h-10 w-10 place-items-center rounded-full transition hover:bg-surface-muted" onClick={() => updateQuantity(line.squareVariationId, line.quantity - 1)} type="button">
                      <Minus aria-hidden="true" size={15} />
                    </button>
                    <span aria-label={`${line.quantity} items`} className="w-8 text-center text-sm font-black">{line.quantity}</span>
                    <button aria-label={`Increase ${line.name} quantity`} className="grid h-10 w-10 place-items-center rounded-full transition hover:bg-surface-muted disabled:opacity-40" disabled={line.quantity >= 99} onClick={() => updateQuantity(line.squareVariationId, line.quantity + 1)} type="button">
                      <Plus aria-hidden="true" size={15} />
                    </button>
                  </div>
                  <button className="inline-flex min-h-10 items-center gap-2 px-2 text-sm font-bold text-secondary transition hover:text-primary" onClick={() => updateQuantity(line.squareVariationId, 0)} type="button">
                    <Trash2 aria-hidden="true" size={15} />
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <CartSummary canCheckout={canCheckout} quote={quote} />
    </div>
  );
}

function EmptyCartStatus() {
  return (
    <section
      className="flex min-h-[30rem] flex-col items-center justify-center border-y border-[#edf0f4] bg-white px-5 py-14 text-center sm:min-h-[36rem] sm:py-20"
      data-cart-empty-state
    >
      <Image
        alt="Sad empty shopping basket"
        className="h-auto w-[13.5rem] max-w-[72vw] object-contain sm:w-[16rem]"
        height={320}
        priority
        src="/images/empty-cart-sad-basket.png"
        width={320}
      />
      <h2 className="-mt-2 font-display text-[1.75rem] font-black tracking-[-0.035em] text-primary sm:text-4xl">
        Your cart is empty!
      </h2>
      <p className="mt-3 max-w-md text-base leading-7 text-secondary sm:text-lg">
        Looks like you haven’t added anything to your cart yet.
      </p>
      <Link
        className="mt-7 inline-flex min-h-11 items-center justify-center rounded-pill bg-[var(--theme-action)] px-7 py-3 text-sm font-black text-[var(--theme-action-foreground)] transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--theme-action)]"
        href="/shop"
      >
        Continue shopping
      </Link>
    </section>
  );
}

function CartStatus({ action, description, role, title }: { action?: ReactNode; description: string; role?: "alert" | "status"; title: string }) {
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

function CartSummary({ canCheckout, quote }: { canCheckout: boolean; quote: CartQuote }) {
  return (
    <section className="h-fit border-y border-border py-6 lg:sticky lg:top-28" data-store-area="Cart" data-store-component="CartOrderSummarySection" data-store-section="cart.order-summary" data-store-variant="summary">
      <h2 className="font-display text-2xl font-black tracking-[-0.02em] text-primary">Order summary</h2>
      <div className="mt-6 grid gap-4 text-sm">
        <SummaryRow label="Items" value={String(quote.itemCount)} />
        <SummaryRow label="Subtotal" value={formatMoney(quote.subtotalCents)} />
        <SummaryRow label={quote.taxEstimateIncluded === false ? "Tax" : "Estimated tax"} value={quote.taxEstimateIncluded === false ? "Calculated at checkout" : formatMoney(quote.estimatedTaxCents)} />
        <SummaryRow label="Fulfillment" value={quote.fulfillmentLabel || "Choose on the next step"} />
        <div className="mt-1 border-t border-border pt-4">
          <SummaryRow label="Estimated total" value={formatMoney(quote.totalCents)} strong />
        </div>
      </div>
      {quote.errors.length > 0 ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{quote.errors.join(" ")}</p> : null}
      <Link aria-disabled={!canCheckout} className={`mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-pill px-5 py-3 text-sm font-black transition ${canCheckout ? "bg-[var(--theme-action)] text-[var(--theme-action-foreground)] hover:opacity-90" : "pointer-events-none border border-border bg-surface-muted text-secondary"}`} href="/checkout">
        Review order details
      </Link>
      <Link className="mt-3 inline-flex min-h-10 w-full items-center justify-center text-sm font-bold text-secondary transition hover:text-primary" href="/shop">Continue shopping</Link>
    </section>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${strong ? "text-base font-black text-primary" : ""}`}>
      <span className="text-secondary">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
