/**
 * Renders the wishlist button interface and its user interactions.
 */

"use client";

import { Heart } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { readWishlistIds, subscribeToWishlist, toggleWishlistId } from "./wishlist-store";

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
  const [announcement, setAnnouncement] = useState("");

  function toggleWishlist() {
    const nowSaved = toggleWishlistId(squareVariationId);
    setAnnouncement(nowSaved ? `${productName} saved to wishlist` : `${productName} removed from wishlist`);
  }

  return (
    <>
      <button
        aria-label={saved ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
        aria-pressed={saved}
        className={cn(
          "grid min-h-11 w-11 shrink-0 place-items-center rounded-full border-0 bg-transparent text-primary shadow-none transition hover:bg-transparent hover:text-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 [&_svg]:transition-transform hover:[&_svg]:scale-110",
          saved && "text-red",
          className
        )}
        onClick={toggleWishlist}
        title={saved ? "Remove from wishlist" : "Save to wishlist"}
        type="button"
      >
        <Heart aria-hidden="true" fill={saved ? "currentColor" : "none"} size={20} strokeWidth={2} />
      </button>
      <span aria-live="polite" className="sr-only">{announcement}</span>
    </>
  );
}
