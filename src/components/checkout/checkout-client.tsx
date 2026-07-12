"use client";

import { CreditCard, MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { readCartItems, type StoredCartItem } from "@/components/commerce/add-to-cart-button";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

type CartQuote = {
  itemCount: number;
  subtotalCents: number;
  estimatedTaxCents: number;
  totalCents: number;
  compatibleFulfillmentModes: Array<"pickup" | "local-delivery" | "shipping">;
  fulfillmentLabel: string;
  errors: string[];
};

const fulfillmentLabels = {
  pickup: "Pickup",
  "local-delivery": "Local delivery",
  shipping: "Shipping"
};

export function CheckoutClient() {
  const [items, setItems] = useState<StoredCartItem[]>([]);
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [fulfillmentMode, setFulfillmentMode] = useState<"pickup" | "local-delivery" | "shipping">("pickup");
  const [message, setMessage] = useState<{ tone: "idle" | "success" | "error"; text: string }>({ tone: "idle", text: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setItems(readCartItems());
  }, []);

  useEffect(() => {
    let ignore = false;

    fetch("/api/cart", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ items })
    })
      .then((response) => response.json())
      .then((result) => {
        if (ignore) {
          return;
        }

        const nextQuote = result.quote ?? null;
        setQuote(nextQuote);

        if (nextQuote?.compatibleFulfillmentModes?.length) {
          setFulfillmentMode(nextQuote.compatibleFulfillmentModes[0]);
        }
      })
      .catch(() => {
        if (!ignore) {
          setMessage({ tone: "error", text: "Checkout could not validate the cart." });
        }
      });

    return () => {
      ignore = true;
    };
  }, [items]);

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setMessage({ tone: "idle", text: "Validating checkout..." });

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          items,
          fulfillmentMode,
          customer: {
            name: String(formData.get("name") ?? ""),
            email: String(formData.get("email") ?? ""),
            phone: String(formData.get("phone") ?? "")
          }
        })
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setMessage({ tone: "error", text: Array.isArray(result.errors) ? result.errors.join(" ") : "Checkout is not available." });
        return;
      }

      setMessage({ tone: "success", text: "Checkout is validated and ready for Square payment." });
    } catch {
      setMessage({ tone: "error", text: "Checkout request failed. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!quote || quote.itemCount === 0) {
    return (
      <div className="surface-card p-6">
        <h2 className="font-display text-2xl font-semibold">Your cart is empty</h2>
        <p className="mt-2 text-secondary">Add products before checkout.</p>
      </div>
    );
  }

  const canSubmit = quote.errors.length === 0 && quote.compatibleFulfillmentModes.length > 0;

  return (
    <form className="grid gap-6 lg:grid-cols-[1fr_380px]" onSubmit={submitCheckout}>
      <div className="space-y-6">
        <section className="surface-card p-6" data-store-area="Checkout" data-store-component="CheckoutCustomerInfoSection" data-store-section="checkout.customer-info" data-store-variant="form">
          <h2 className="font-display text-2xl font-semibold">Customer</h2>
          <div className="mt-5 grid gap-4">
            <CheckoutField label="Name" name="name" placeholder="Full name" required />
            <CheckoutField label="Email" name="email" placeholder="you@example.com" required type="email" />
            <CheckoutField label="Phone" name="phone" placeholder="(212) 555-0100" required type="tel" />
          </div>
        </section>

        <section className="surface-card p-6" data-store-area="Checkout" data-store-component="CheckoutFulfillmentSection" data-store-section="checkout.fulfillment" data-store-variant="fulfillment-groups">
          <div className="flex items-center gap-2">
            <MapPin aria-hidden="true" size={18} />
            <h2 className="font-display text-2xl font-semibold">Fulfillment</h2>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {quote.compatibleFulfillmentModes.map((mode) => (
              <label className={`rounded-md border p-3 text-sm font-semibold ${fulfillmentMode === mode ? "border-primary bg-surface-muted text-primary" : "border-border text-secondary"}`} key={mode}>
                <input checked={fulfillmentMode === mode} className="sr-only" name="fulfillmentMode" onChange={() => setFulfillmentMode(mode)} type="radio" value={mode} />
                {fulfillmentLabels[mode]}
              </label>
            ))}
          </div>
          {quote.errors.length > 0 ? <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{quote.errors.join(" ")}</p> : null}
        </section>

        <section className="surface-card p-6" data-store-area="Checkout" data-store-component="CheckoutPaymentSection" data-store-section="checkout.payment" data-store-variant="square-web-payments">
          <div className="flex items-center gap-2">
            <CreditCard aria-hidden="true" size={18} />
            <h2 className="font-display text-2xl font-semibold">Payment</h2>
          </div>
          <p className="mt-3 text-secondary">Payment is tokenized through Square when credentials are configured. Raw card data is never collected by this site.</p>
        </section>
      </div>

      <section className="surface-card h-fit p-6" data-store-area="Checkout" data-store-component="CheckoutOrderSummarySection" data-store-section="checkout.order-summary" data-store-variant="summary">
        <div className="flex items-center gap-2">
          <PackageCheck aria-hidden="true" size={18} />
          <h2 className="font-display text-2xl font-semibold">Validated summary</h2>
        </div>
        <div className="mt-5 grid gap-3 text-sm">
          <SummaryRow label="Items" value={String(quote.itemCount)} />
          <SummaryRow label="Subtotal" value={formatMoney(quote.subtotalCents)} />
          <SummaryRow label="Estimated tax" value={formatMoney(quote.estimatedTaxCents)} />
          <SummaryRow label="Fulfillment" value={fulfillmentLabels[fulfillmentMode]} />
          <div className="border-t border-border pt-3">
            <SummaryRow label="Estimated total" value={formatMoney(quote.totalCents)} strong />
          </div>
        </div>
        <Button className="mt-6 w-full gap-2" disabled={!canSubmit || isSubmitting} type="submit">
          <ShieldCheck aria-hidden="true" size={16} />
          {isSubmitting ? "Validating..." : "Validate checkout"}
        </Button>
        {message.text ? (
          <p className={`mt-4 rounded-md border p-3 text-sm ${message.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : message.tone === "success" ? "border-green-200 bg-green-50 text-green-900" : "border-border bg-surface-muted text-secondary"}`} role="status">
            {message.text}
          </p>
        ) : null}
      </section>
    </form>
  );
}

function CheckoutField({ label, name, type = "text", placeholder, required = false }: { label: string; name: string; type?: string; placeholder: string; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-primary" name={name} placeholder={placeholder} required={required} type={type} />
    </label>
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
