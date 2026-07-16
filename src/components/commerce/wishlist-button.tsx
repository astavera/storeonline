"use client";

import { Heart } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const wishlistStorageKey = "modern-state-wishlist";
const wishlistUpdatedEvent = "modern-state-wishlist-updated";

export function WishlistButton({
  squareVariationId,
  productName,
  className
}: {
  squareVariationId: string;
  productName: string;
  className?: string;
}) {
  const getSnapshot = useCallback(() => readWishlistIds().includes(squareVariationId), [squareVariationId]);
  const saved = useSyncExternalStore(subscribeToWishlist, getSnapshot, () => false);

  function toggleWishlist() {
    const ids = readWishlistIds();
    const nextIds = saved ? ids.filter((id) => id !== squareVariationId) : [...new Set([...ids, squareVariationId])];
    window.localStorage.setItem(wishlistStorageKey, JSON.stringify(nextIds));
    window.dispatchEvent(new CustomEvent(wishlistUpdatedEvent));
  }

  return (
    <button
      aria-label={saved ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
      aria-pressed={saved}
      className={cn(
        "grid min-h-11 w-12 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary transition hover:border-red hover:text-red",
        saved && "border-red bg-red/10 text-red",
        className
      )}
      onClick={toggleWishlist}
      type="button"
    >
      <Heart aria-hidden="true" fill={saved ? "currentColor" : "none"} size={20} />
    </button>
  );
}

function subscribeToWishlist(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(wishlistUpdatedEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(wishlistUpdatedEvent, onChange);
  };
}

function readWishlistIds() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(wishlistStorageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}
