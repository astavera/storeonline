/**
 * Renders the responsive wishlist drawer without navigating away from the current page.
 */

"use client";

import { Heart, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AddToCartButton } from "@/components/commerce/add-to-cart-button";
import {
  isWishlistPanelOpen,
  setWishlistPanelOpen,
  subscribeToWishlist,
  subscribeToWishlistPanel,
  wishlistSnapshot,
  writeWishlistIds
} from "@/components/commerce/wishlist-store";
import {
  storefrontFulfillableQuantity,
  storefrontInventoryLabel,
  type StorefrontProduct
} from "@/features/catalog/product-catalog";
import { formatMoney } from "@/lib/utils";

type WishlistResponse = {
  products: StorefrontProduct[];
  missingIds: string[];
};

type WishlistDrawerResponse = WishlistResponse & {
  error: boolean;
  snapshot: string;
};

export function WishlistDrawer() {
  const open = useSyncExternalStore(subscribeToWishlistPanel, isWishlistPanelOpen, () => false);
  const savedSnapshot = useSyncExternalStore(subscribeToWishlist, wishlistSnapshot, () => "[]");
  const savedIds = useMemo(() => parseWishlistSnapshot(savedSnapshot), [savedSnapshot]);
  const [response, setResponse] = useState<WishlistDrawerResponse>({ error: false, missingIds: [], products: [], snapshot: "" });
  const [retryVersion, setRetryVersion] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const products = useMemo(() => {
    const productById = new Map(response.products.map((product) => [product.squareVariationId, product]));
    return savedIds.map((id) => productById.get(id)).filter((product): product is StorefrontProduct => Boolean(product));
  }, [response.products, savedIds]);
  const responseIsCurrent = response.snapshot === savedSnapshot;
  const status = savedIds.length === 0 ? "ready" : !responseIsCurrent ? "loading" : response.error ? "error" : "ready";

  useEffect(() => {
    if (!open) return;

    if (savedIds.length === 0) return;

    const controller = new AbortController();

    void fetch("/api/wishlist", {
      body: JSON.stringify({ ids: savedIds }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal
    })
      .then(async (result) => {
        if (!result.ok) throw new Error("Wishlist products could not be loaded.");
        return result.json() as Promise<WishlistResponse>;
      })
      .then((nextResponse) => {
        setResponse({ ...nextResponse, error: false, snapshot: savedSnapshot });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResponse({ error: true, missingIds: [], products: [], snapshot: savedSnapshot });
      });

    return () => controller.abort();
  }, [open, retryVersion, savedIds, savedSnapshot]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setWishlistPanelOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000]" data-store-component="WishlistDrawer">
      <button aria-label="Close wishlist backdrop" className="absolute inset-0 cursor-default bg-primary/40 backdrop-blur-[1px]" onClick={() => setWishlistPanelOpen(false)} tabIndex={-1} type="button" />
      <aside aria-labelledby="wishlist-drawer-title" aria-modal="true" className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white text-primary shadow-2xl sm:w-[min(28rem,92vw)]" id="storefront-wishlist-drawer" ref={panelRef} role="dialog">
        <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-display text-xl font-black" id="wishlist-drawer-title">Wishlist</h2>
            <p aria-live="polite" className="mt-0.5 text-xs font-semibold text-secondary">{savedIds.length} {savedIds.length === 1 ? "saved item" : "saved items"}</p>
          </div>
          <button aria-label="Close wishlist" className="grid min-h-11 w-11 place-items-center rounded-full text-primary transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue" onClick={() => setWishlistPanelOpen(false)} ref={closeButtonRef} type="button">
            <X aria-hidden="true" size={22} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {savedIds.length === 0 ? (
            <EmptyWishlist onClose={() => setWishlistPanelOpen(false)} />
          ) : status === "error" ? (
            <div className="grid min-h-72 place-items-center text-center">
              <div>
                <p className="font-display text-lg font-black">Wishlist unavailable</p>
                <p className="mx-auto mt-2 max-w-xs text-sm text-secondary">Your saved items are still safe in this browser. Try loading them again.</p>
                <button className="mt-5 min-h-11 rounded-md bg-blue px-5 py-2.5 text-sm font-black text-white" onClick={() => { setResponse((current) => ({ ...current, snapshot: "" })); setRetryVersion((value) => value + 1); }} type="button">Try again</button>
              </div>
            </div>
          ) : (
            <>
              {status === "loading" && products.length === 0 ? <WishlistLoading /> : null}
              {products.length > 0 ? (
                <ul className="grid gap-3">
                  {products.map((product) => (
                    <WishlistItem key={product.squareVariationId} onRemove={() => writeWishlistIds(savedIds.filter((id) => id !== product.squareVariationId))} product={product} />
                  ))}
                </ul>
              ) : null}
              {status === "ready" && response.missingIds.length > 0 ? (
                <div className="mt-4 rounded-md border border-border bg-surface-muted p-4 text-sm">
                  <p className="font-bold">{response.missingIds.length} {response.missingIds.length === 1 ? "item is" : "items are"} no longer available.</p>
                  <button className="mt-2 min-h-11 font-black text-blue underline underline-offset-4" onClick={() => writeWishlistIds(savedIds.filter((id) => !response.missingIds.includes(id)))} type="button">Remove unavailable {response.missingIds.length === 1 ? "item" : "items"}</button>
                </div>
              ) : null}
            </>
          )}
        </div>

        {savedIds.length > 0 ? (
          <footer className="border-t border-border bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6">
            <button className="min-h-11 w-full rounded-md border border-primary px-5 py-2.5 text-sm font-black transition hover:bg-primary hover:text-white" onClick={() => setWishlistPanelOpen(false)} type="button">Continue shopping</button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

function WishlistItem({ onRemove, product }: { onRemove: () => void; product: StorefrontProduct }) {
  const maxQuantity = storefrontFulfillableQuantity(product);
  const purchaseDisabled = product.previewOnly || product.inventoryStatus === "out-of-stock" || maxQuantity === 0 || product.priceAvailable === false;
  const disabledReason = product.previewOnly ? "Unavailable online" : product.priceAvailable === false ? "Price unavailable" : "Out of stock";

  return (
    <li className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 rounded-md border border-border bg-white p-3">
      <div className="relative aspect-square overflow-hidden rounded-md bg-surface-muted">
        <Image alt={product.name} className="object-contain p-2" fill sizes="88px" src={product.imageUrl || "/images/product-fallback.svg"} unoptimized />
      </div>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 pr-1 text-sm font-black leading-snug">{product.name}</h3>
          <button aria-label={`Remove ${product.name} from wishlist`} className="grid min-h-11 w-11 shrink-0 place-items-center rounded-full text-secondary transition hover:bg-surface-muted hover:text-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue" onClick={onRemove} title="Remove from wishlist" type="button">
            <Trash2 aria-hidden="true" size={17} />
          </button>
        </div>
        <p className={product.inventoryStatus === "out-of-stock" ? "text-[11px] font-bold text-secondary" : maxQuantity !== null && maxQuantity <= 3 ? "text-[11px] font-bold text-red" : "text-[11px] font-bold text-green"}>{storefrontInventoryLabel(product)}</p>
        <p className="mt-1 text-base font-black">{product.priceAvailable === false ? "Price unavailable" : formatMoney(product.priceCents)}</p>
        <div className="mt-2 [&_.add-to-cart-submit]:!min-h-10 [&_.add-to-cart-submit]:!rounded-md [&_.add-to-cart-submit]:!py-2 [&_.add-to-cart-submit]:!text-xs [&_.add-to-cart-stepper]:!min-h-10 [&_.add-to-cart-stepper]:!rounded-md">
          <AddToCartButton disabled={purchaseDisabled} disabledReason={disabledReason} label="Add to cart" maxQuantity={maxQuantity} showQuantitySelector squareVariationId={product.squareVariationId} />
        </div>
      </div>
    </li>
  );
}

function EmptyWishlist({ onClose }: { onClose: () => void }) {
  return (
    <div className="grid min-h-[55vh] place-items-center text-center">
      <div>
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-surface-muted text-primary"><Heart aria-hidden="true" size={28} /></span>
        <h3 className="mt-5 font-display text-xl font-black">Your wishlist is empty</h3>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-secondary">Tap the heart on any product to save it here while you keep browsing.</p>
        <button className="mt-6 min-h-11 rounded-md bg-blue px-6 py-2.5 text-sm font-black text-white" onClick={onClose} type="button">Continue shopping</button>
      </div>
    </div>
  );
}

function WishlistLoading() {
  return <div aria-label="Loading wishlist" className="grid gap-3" role="status">{[0, 1, 2].map((index) => <div className="h-32 animate-pulse rounded-md bg-surface-muted" key={index} />)}</div>;
}

function parseWishlistSnapshot(snapshot: string) {
  try {
    const ids = JSON.parse(snapshot);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
