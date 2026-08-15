/**
 * Verifies the in-place wishlist flow shared by desktop and mobile headers.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WishlistButton } from "@/components/commerce/wishlist-button";
import { readWishlistIds, setWishlistPanelOpen } from "@/components/commerce/wishlist-store";
import { WishlistDrawer } from "@/components/layout/wishlist-drawer";
import { WishlistLink } from "@/components/layout/wishlist-link";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";

const product: StorefrontProduct = {
  id: "item-wishlist-1",
  squareVariationId: "variation-wishlist-1",
  slug: "wishlist-product",
  name: "Wishlist product",
  department: "Toys",
  shortDescription: "Saved product",
  description: "Saved product",
  imageUrl: "/images/product-fallback.svg",
  priceCents: 1_998,
  fulfillmentModes: ["pickup", "shipping"],
  inventoryStatus: "in-stock",
  priceAvailable: true
};

afterEach(() => {
  setWishlistPanelOpen(false);
  window.localStorage.clear();
  vi.unstubAllGlobals();
  cleanup();
});

describe("wishlist drawer", () => {
  it("saves, opens over the current page, and removes an item", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ products: [product], missingIds: [] }),
      ok: true
    }));

    render(
      <>
        <WishlistButton productName={product.name} squareVariationId={product.squareVariationId} />
        <WishlistLink />
        <WishlistDrawer />
      </>
    );

    const saveButton = screen.getByRole("button", { name: `Save ${product.name} to wishlist` });
    fireEvent.click(saveButton);
    expect(readWishlistIds()).toEqual([product.squareVariationId]);
    expect(saveButton.getAttribute("aria-pressed")).toBe("true");

    const headerButton = screen.getByRole("button", { name: "Wishlist" });
    expect(headerButton.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(headerButton);

    const drawer = await screen.findByRole("dialog", { name: "Wishlist" });
    expect(screen.getByText("1 saved item")).not.toBeNull();
    expect(await within(drawer).findByText(product.name)).not.toBeNull();
    expect(within(drawer).getByText("In stock")).not.toBeNull();
    expect(within(drawer).getByRole("button", { name: "Add to cart" })).not.toBeNull();

    fireEvent.click(within(drawer).getByRole("button", { name: `Remove ${product.name} from wishlist` }));
    await waitFor(() => expect(readWishlistIds()).toEqual([]));
    expect(within(drawer).getByText("Your wishlist is empty")).not.toBeNull();
    expect(saveButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(within(drawer).getByRole("button", { name: "Continue shopping" }));
    expect(screen.queryByRole("dialog", { name: "Wishlist" })).toBeNull();
  });
});
