/**
 * Provides the browser-local wishlist state shared by storefront controls.
 */

export const wishlistUpdatedEvent = "modern-state-wishlist-updated";

const wishlistStorageKey = "modern-state-wishlist";
const maximumWishlistItems = 250;
let wishlistPanelOpen = false;
const wishlistPanelListeners = new Set<() => void>();

export function readWishlistIds() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(wishlistStorageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.map(String).map((id) => id.trim()).filter(Boolean))).slice(0, maximumWishlistItems);
  } catch {
    return [];
  }
}

export function wishlistSnapshot() {
  return JSON.stringify(readWishlistIds());
}

export function writeWishlistIds(ids: string[]) {
  const normalizedIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).slice(0, maximumWishlistItems);
  window.localStorage.setItem(wishlistStorageKey, JSON.stringify(normalizedIds));
  window.dispatchEvent(new CustomEvent(wishlistUpdatedEvent));
}

export function toggleWishlistId(squareVariationId: string) {
  const ids = readWishlistIds();
  const saved = ids.includes(squareVariationId);
  writeWishlistIds(saved ? ids.filter((id) => id !== squareVariationId) : [...ids, squareVariationId]);
  return !saved;
}

export function subscribeToWishlist(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(wishlistUpdatedEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(wishlistUpdatedEvent, onChange);
  };
}

export function isWishlistPanelOpen() {
  return wishlistPanelOpen;
}

export function setWishlistPanelOpen(open: boolean) {
  if (wishlistPanelOpen === open) return;
  wishlistPanelOpen = open;
  wishlistPanelListeners.forEach((listener) => listener());
}

export function subscribeToWishlistPanel(onChange: () => void) {
  wishlistPanelListeners.add(onChange);
  return () => wishlistPanelListeners.delete(onChange);
}
