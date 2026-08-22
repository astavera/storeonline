/**
 * Renders the add to cart button interface and its user interactions.
 */

"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export type StoredCartItem = {
  squareVariationId: string;
  quantity: number;
  source?: "storefront" | "balloons";
};

const cartStorageKey = "modern-state-cart";

export function AddToCartButton({
  squareVariationId,
  label = "Add to cart",
  showQuantitySelector = false,
  maxQuantity = null,
  disabled = false,
  disabledReason = "This item is not currently available to add to cart."
}: {
  squareVariationId: string;
  label?: string;
  showQuantitySelector?: boolean;
  maxQuantity?: number | null;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [message, setMessage] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [quantityControlVisible, setQuantityControlVisible] = useState(false);
  const quantityLimit = normalizeQuantityLimit(maxQuantity);
  const isProductionDemo = process.env.NODE_ENV === "production" && isDemoVariationId(squareVariationId);
  const isDisabled = disabled || isProductionDemo || quantityLimit === 0;
  const effectiveDisabledReason = isProductionDemo
    ? "This demo item is not available."
    : quantityLimit === 0
      ? "Out of stock"
      : disabledReason;

  function addToCart() {
    if (isDisabled) return;
    const items = readCartItems();
    const existingItem = items.find((item) => item.squareVariationId === squareVariationId);
    const currentQuantity = existingItem?.quantity ?? 0;
    if (currentQuantity >= quantityLimit) {
      setQuantity(currentQuantity);
      setQuantityControlVisible(showQuantitySelector && currentQuantity > 0);
      setMessage(quantityLimitMessage(quantityLimit));
      return;
    }
    const nextQuantity = Math.min(currentQuantity + 1, quantityLimit);

    if (existingItem) {
      existingItem.quantity = nextQuantity;
    } else {
      items.push({ squareVariationId, quantity: nextQuantity, source: "storefront" });
    }

    writeCartItems(items);
    window.dispatchEvent(new CustomEvent("modern-state-cart-updated"));
    setQuantity(nextQuantity);
    setQuantityControlVisible(showQuantitySelector);
    setMessage("Added");
    window.setTimeout(() => setMessage(""), 1600);
  }

  function changeCartQuantity(delta: -1 | 1) {
    if (isDisabled) return;
    const items = readCartItems();
    const existingItem = items.find((item) => item.squareVariationId === squareVariationId);
    const currentQuantity = existingItem?.quantity ?? quantity;
    if (delta === 1 && currentQuantity >= quantityLimit) {
      setMessage(quantityLimitMessage(quantityLimit));
      return;
    }
    const nextQuantity = Math.min(Math.max(currentQuantity + delta, 0), quantityLimit);
    const nextItems = nextQuantity === 0
      ? items.filter((item) => item.squareVariationId !== squareVariationId)
      : items;

    if (nextQuantity > 0) {
      if (existingItem) existingItem.quantity = nextQuantity;
      else nextItems.push({ squareVariationId, quantity: nextQuantity, source: "storefront" });
    }

    writeCartItems(nextItems);
    window.dispatchEvent(new CustomEvent("modern-state-cart-updated"));
    setQuantity(nextQuantity);
    setQuantityControlVisible(nextQuantity > 0);
    setMessage(nextQuantity > 0 ? `${nextQuantity} in cart` : "Removed from cart");
    window.setTimeout(() => setMessage(""), 1600);
  }

  return (
    <div>
      {showQuantitySelector && quantityControlVisible ? (
        <div
          aria-label="Quantity in cart"
          className="add-to-cart-stepper product-card-quantity-selector flex min-h-11 w-full items-center justify-between rounded-pill bg-blue px-1 text-white"
          role="group"
        >
          <button
            aria-label="Decrease quantity in cart"
            className="product-card-quantity-control grid min-h-11 w-11 place-items-center rounded-full bg-transparent p-0 text-white transition hover:bg-white/15 disabled:opacity-35"
            disabled={isDisabled}
            onClick={() => changeCartQuantity(-1)}
            type="button"
          >
            <Minus aria-hidden="true" size={15} />
          </button>
          <span aria-label={`${quantity} in cart`} className="min-w-8 text-center text-sm font-black">
            {quantity}
          </span>
          <button
            aria-label="Increase quantity in cart"
            className="product-card-quantity-control grid min-h-11 w-11 place-items-center rounded-full bg-transparent p-0 text-white transition hover:bg-white/15 disabled:opacity-35"
            disabled={isDisabled || quantity >= quantityLimit}
            onClick={() => changeCartQuantity(1)}
            type="button"
          >
            <Plus aria-hidden="true" size={15} />
          </button>
        </div>
      ) : (
        <Button className="add-to-cart-submit w-full gap-2 rounded-pill bg-blue py-3 font-black text-white hover:bg-blue/90 disabled:bg-blue disabled:text-white disabled:opacity-45" disabled={isDisabled} onClick={addToCart} title={isDisabled ? effectiveDisabledReason : undefined} type="button">
          <ShoppingCart aria-hidden="true" size={16} />
          {isDisabled ? effectiveDisabledReason : message || label}
        </Button>
      )}
      <span className="sr-only" role="status">
        {message}
      </span>
    </div>
  );
}

export function readCartItems(): StoredCartItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(cartStorageKey) ?? "[]");

    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalizedItems = parsed
      .map((item) => ({
        squareVariationId: String(item.squareVariationId ?? ""),
        quantity: Number(item.quantity),
        ...(item.source === "balloons" || item.source === "storefront" ? { source: item.source } : {})
      }))
      .filter((item) => item.squareVariationId && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99);
    const cartItems = process.env.NODE_ENV === "production"
      ? normalizedItems.filter((item) => !isDemoVariationId(item.squareVariationId))
      : normalizedItems;

    if (cartItems.length !== normalizedItems.length) {
      window.localStorage.setItem(cartStorageKey, JSON.stringify(cartItems));
    }

    return cartItems;
  } catch {
    return [];
  }
}

export function writeCartItems(items: StoredCartItem[]) {
  window.localStorage.setItem(cartStorageKey, JSON.stringify(items));
}

export function clearCartItems() {
  window.localStorage.removeItem(cartStorageKey);
  window.dispatchEvent(new CustomEvent("modern-state-cart-updated"));
}

function isDemoVariationId(squareVariationId: string) {
  return squareVariationId.startsWith("seed-");
}

function normalizeQuantityLimit(maxQuantity: number | null) {
  if (maxQuantity === null || !Number.isFinite(maxQuantity)) return 99;
  return Math.max(0, Math.min(99, Math.floor(maxQuantity)));
}

function quantityLimitMessage(quantityLimit: number) {
  return quantityLimit === 1 ? "Only 1 is available." : `Only ${quantityLimit} are available.`;
}
