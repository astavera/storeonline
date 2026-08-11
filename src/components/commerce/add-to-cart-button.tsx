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
};

const cartStorageKey = "modern-state-cart";

export function AddToCartButton({
  squareVariationId,
  label = "Add to cart",
  showQuantitySelector = false,
  disabled = false,
  disabledReason = "This item is not currently available to add to cart."
}: {
  squareVariationId: string;
  label?: string;
  showQuantitySelector?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [message, setMessage] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [quantityControlVisible, setQuantityControlVisible] = useState(false);
  const isProductionDemo = process.env.NODE_ENV === "production" && isDemoVariationId(squareVariationId);
  const isDisabled = disabled || isProductionDemo;
  const effectiveDisabledReason = isProductionDemo ? "This demo item is not available." : disabledReason;

  function addToCart() {
    if (isDisabled) return;
    const items = readCartItems();
    const existingItem = items.find((item) => item.squareVariationId === squareVariationId);
    const nextQuantity = Math.min((existingItem?.quantity ?? 0) + 1, 99);

    if (existingItem) {
      existingItem.quantity = nextQuantity;
    } else {
      items.push({ squareVariationId, quantity: nextQuantity });
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
    const nextQuantity = Math.min(Math.max(currentQuantity + delta, 0), 99);
    const nextItems = nextQuantity === 0
      ? items.filter((item) => item.squareVariationId !== squareVariationId)
      : items;

    if (nextQuantity > 0) {
      if (existingItem) existingItem.quantity = nextQuantity;
      else nextItems.push({ squareVariationId, quantity: nextQuantity });
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
            disabled={isDisabled || quantity === 99}
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
        {message ? "Item added to cart." : ""}
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
        quantity: Number(item.quantity)
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
