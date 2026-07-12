"use client";

import { ShoppingCart } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export type StoredCartItem = {
  squareVariationId: string;
  quantity: number;
};

const cartStorageKey = "modern-state-cart";

export function AddToCartButton({
  squareVariationId,
  label = "Add to cart"
}: {
  squareVariationId: string;
  label?: string;
}) {
  const [message, setMessage] = useState("");

  function addToCart() {
    const items = readCartItems();
    const existingItem = items.find((item) => item.squareVariationId === squareVariationId);

    if (existingItem) {
      existingItem.quantity = Math.min(existingItem.quantity + 1, 99);
    } else {
      items.push({ squareVariationId, quantity: 1 });
    }

    writeCartItems(items);
    window.dispatchEvent(new CustomEvent("modern-state-cart-updated"));
    setMessage("Added");
    window.setTimeout(() => setMessage(""), 1600);
  }

  return (
    <div>
      <Button className="w-full gap-2 rounded-pill py-3 font-black" onClick={addToCart} type="button">
        <ShoppingCart aria-hidden="true" size={16} />
        {message || label}
      </Button>
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

    return parsed
      .map((item) => ({
        squareVariationId: String(item.squareVariationId ?? ""),
        quantity: Number(item.quantity)
      }))
      .filter((item) => item.squareVariationId && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99);
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
