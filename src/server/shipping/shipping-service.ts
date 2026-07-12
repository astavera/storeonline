import "server-only";

export type ShippingProvider = "shippo" | "fedex-direct" | "ups-direct";

export function getInitialShippingProviders(): ShippingProvider[] {
  return ["shippo"];
}

export function assertProductsAreShippable(items: Array<{ isShippable: boolean }>) {
  if (items.some((item) => !item.isShippable)) {
    throw new Error("Cart contains products that are not eligible for warehouse shipping.");
  }
}
