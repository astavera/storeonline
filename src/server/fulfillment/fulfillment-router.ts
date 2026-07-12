import "server-only";

export type CartFulfillmentRequirement = {
  squareVariationId: string;
  fulfillmentModes: Array<"pickup" | "local-delivery" | "shipping">;
};

export function getCompatibleFulfillmentModes(items: CartFulfillmentRequirement[]) {
  if (items.length === 0) {
    return [];
  }

  return items.reduce<string[]>((modes, item) => modes.filter((mode) => item.fulfillmentModes.includes(mode as never)), [...items[0].fulfillmentModes]);
}

export function requiresFulfillmentSplit(items: CartFulfillmentRequirement[]) {
  return getCompatibleFulfillmentModes(items).length === 0;
}
