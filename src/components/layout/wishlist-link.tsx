/**
 * Renders the header wishlist shortcut and its live saved-item count.
 */

"use client";

import { Heart } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { isWishlistPanelOpen, readWishlistIds, setWishlistPanelOpen, subscribeToWishlist, subscribeToWishlistPanel } from "@/components/commerce/wishlist-store";

export function WishlistLink({ label = "Wishlist" }: { label?: string }) {
  const getSnapshot = useCallback(() => readWishlistIds().length, []);
  const count = useSyncExternalStore(subscribeToWishlist, getSnapshot, () => 0);
  const open = useSyncExternalStore(subscribeToWishlistPanel, isWishlistPanelOpen, () => false);

  return (
    <button aria-controls="storefront-wishlist-drawer" aria-expanded={open} aria-haspopup="dialog" aria-label={label} className="relative grid h-10 w-10 place-items-center rounded-full text-current transition hover:bg-black/5 hover:text-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue" data-header-nav-id="wishlist" onClick={() => setWishlistPanelOpen(true)} type="button">
      <Heart aria-hidden="true" fill={count > 0 ? "currentColor" : "none"} size={24} />
      <span className="sr-only">{label}</span>
      {count > 0 ? (
        <span aria-hidden="true" className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red px-1 text-[10px] font-black leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}
