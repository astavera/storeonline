import "server-only";
import { z } from "zod";
import { fulfillmentModeLabel, getProductByVariationId, type FulfillmentMode } from "@/features/catalog/product-catalog";

export const cartItemInputSchema = z.object({
  squareVariationId: z.string().min(1),
  quantity: z.number().int().positive().max(99)
});

export const cartQuoteInputSchema = z.object({
  items: z.array(cartItemInputSchema).max(50)
});

export type CartQuoteLine = {
  squareVariationId: string;
  slug: string;
  name: string;
  department: string;
  imageUrl: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  fulfillmentModes: FulfillmentMode[];
};

export type CartQuote = {
  lines: CartQuoteLine[];
  itemCount: number;
  subtotalCents: number;
  estimatedTaxCents: number;
  totalCents: number;
  compatibleFulfillmentModes: FulfillmentMode[];
  fulfillmentLabel: string;
  errors: string[];
};

const estimatedTaxRate = 0.08875;

export function calculateCartQuantity(items: Array<z.infer<typeof cartItemInputSchema>>) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function quoteCart(input: z.infer<typeof cartQuoteInputSchema>): CartQuote {
  const parsed = cartQuoteInputSchema.parse(input);
  const errors: string[] = [];
  const lines = parsed.items.flatMap((item): CartQuoteLine[] => {
    const product = getProductByVariationId(item.squareVariationId);

    if (!product) {
      errors.push(`Item ${item.squareVariationId} is no longer available.`);
      return [];
    }

    return [
      {
        squareVariationId: product.squareVariationId,
        slug: product.slug,
        name: product.name,
        department: product.department,
        imageUrl: product.imageUrl,
        unitPriceCents: product.priceCents,
        quantity: item.quantity,
        lineTotalCents: product.priceCents * item.quantity,
        fulfillmentModes: product.fulfillmentModes
      }
    ];
  });
  const subtotalCents = lines.reduce((total, line) => total + line.lineTotalCents, 0);
  const estimatedTaxCents = Math.round(subtotalCents * estimatedTaxRate);
  const compatibleFulfillmentModes = getCompatibleFulfillmentModes(lines);

  if (lines.length > 0 && compatibleFulfillmentModes.length === 0) {
    errors.push("This cart mixes products that cannot share one fulfillment method. Split the cart before checkout.");
  }

  return {
    lines,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    subtotalCents,
    estimatedTaxCents,
    totalCents: subtotalCents + estimatedTaxCents,
    compatibleFulfillmentModes,
    fulfillmentLabel: compatibleFulfillmentModes.length > 0 ? compatibleFulfillmentModes.map(fulfillmentModeLabel).join(", ") : "Split required",
    errors
  };
}

function getCompatibleFulfillmentModes(lines: CartQuoteLine[]) {
  if (lines.length === 0) {
    return [];
  }

  return lines.reduce<FulfillmentMode[]>((modes, line) => modes.filter((mode) => line.fulfillmentModes.includes(mode)), [...lines[0].fulfillmentModes]);
}
