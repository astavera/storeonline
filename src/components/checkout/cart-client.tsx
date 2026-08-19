/**
 * Renders the cart client interface and its user interactions.
 */

"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { clearCartItems, readCartItems, writeCartItems, type StoredCartItem } from "@/components/commerce/add-to-cart-button";
import { Button } from "@/components/ui/button";
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
    return (
      <CartStatus
        action={<Link className="inline-flex min-h-11 items-center justify-center rounded-pill bg-[var(--theme-action)] px-6 py-3 text-sm font-black text-[var(--theme-action-foreground)] transition hover:opacity-90" href="/shop">Continue shopping</Link>}
        description="Choose something from the online catalog when you’re ready."
        title="Your cart is empty"
      />
    );
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
    <div className={mode === "summary" ? "grid gap-4" : "grid gap-6 lg:grid-cols-[1fr_360px]"}>
      {mode === "cart" ? (
        <div className="grid gap-4">
          {quote.lines.map((line) => (
            <article className="surface-card grid gap-4 p-4 sm:grid-cols-[120px_minmax(0,1fr)]" key={line.squareVariationId}>
              <Link className="block overflow-hidden rounded-md bg-surface-muted" href={`/products/${line.slug}`}>
                <Image alt={line.name} className="aspect-square h-full w-full object-cover" height={120} src={line.imageUrl} unoptimized width={120} />
              </Link>
              <div className="grid gap-3">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">{line.department}</p>
                    <h2 className="mt-1 font-display text-xl font-semibold">
                      <Link className="hover:text-blue" href={`/products/${line.slug}`}>
                        {line.name}
                      </Link>
                    </h2>
                  </div>
                  <p className="font-semibold">{formatMoney(line.lineTotalCents)}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center rounded-md border border-border bg-surface">
                    <Button className="h-9 w-9 px-0" onClick={() => updateQuantity(line.squareVariationId, line.quantity - 1)} title="Decrease quantity" type="button" variant="quiet">
                      <Minus aria-hidden="true" size={15} />
                    </Button>
                    <span className="w-10 text-center text-sm font-semibold">{line.quantity}</span>
                    <Button className="h-9 w-9 px-0" onClick={() => updateQuantity(line.squareVariationId, line.quantity + 1)} title="Increase quantity" type="button" variant="quiet">
                      <Plus aria-hidden="true" size={15} />
                    </Button>
                  </div>
                  <Button className="h-9 gap-2 px-3" onClick={() => updateQuantity(line.squareVariationId, 0)} type="button" variant="quiet">
                    <Trash2 aria-hidden="true" size={15} />
                    Remove
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <CartSummary canCheckout={canCheckout} quote={quote} />
    </div>
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
    <section className="surface-card h-fit p-6" data-store-area="Cart" data-store-component="CartOrderSummarySection" data-store-section="cart.order-summary" data-store-variant="summary">
      <h2 className="font-display text-2xl font-semibold">Order summary</h2>
      <div className="mt-5 grid gap-3 text-sm">
        <SummaryRow label="Items" value={String(quote.itemCount)} />
        <SummaryRow label="Subtotal" value={formatMoney(quote.subtotalCents)} />
        <SummaryRow label={quote.taxEstimateIncluded === false ? "Tax" : "Estimated tax"} value={quote.taxEstimateIncluded === false ? "Calculated at checkout" : formatMoney(quote.estimatedTaxCents)} />
        <SummaryRow label="Fulfillment" value={quote.fulfillmentLabel || "Choose on the next step"} />
        <div className="border-t border-border pt-3">
          <SummaryRow label="Estimated total before delivery or shipping" value={formatMoney(quote.totalCents)} strong />
        </div>
      </div>
      {quote.errors.length > 0 ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{quote.errors.join(" ")}</p> : null}
      <Link className={`mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold ${canCheckout ? "bg-[var(--theme-action)] text-[var(--theme-action-foreground)]" : "pointer-events-none border border-border bg-surface-muted text-secondary"}`} href="/checkout">
        Review order details
      </Link>
    </section>
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
