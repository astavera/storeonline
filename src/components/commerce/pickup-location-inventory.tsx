/**
 * Shows real pickup inventory on a product detail view.
 */

import type { StorefrontProduct } from "@/features/catalog/product-catalog";
import { cn } from "@/lib/utils";

export function PickupLocationInventory({ product }: {
  product: Pick<StorefrontProduct, "fulfillmentModes" | "pickupInventory">;
}) {
  const locations = product.fulfillmentModes.includes("pickup") ? product.pickupInventory ?? [] : [];

  if (locations.length === 0) return null;

  return (
    <section aria-label="Pickup availability by location" className="mt-8 rounded-md border border-border bg-surface-muted p-4" data-store-component="PickupLocationInventory">
      <h2 className="font-display text-lg font-black text-primary">Pickup availability</h2>
      <ul className="mt-3 divide-y divide-border">
        {locations.map((location) => (
          <li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0" key={location.locationId}>
            <span className="text-sm font-semibold text-primary">{location.locationName}</span>
            <span className={cn("shrink-0 text-sm font-black", location.quantity <= 1 ? "text-red" : "text-green")}>
              {pickupQuantityLabel(location.quantity)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function pickupQuantityLabel(quantity: number) {
  if (quantity <= 0) return "Sold out";
  if (quantity === 1) return "1 left";
  return `${quantity} in stock`;
}
