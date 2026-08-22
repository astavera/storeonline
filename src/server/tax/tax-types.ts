/**
 * Defines the provider-neutral tax domain used by server-side shipping flows.
 */

import "server-only";

import { z } from "zod";

// Prisma persists cents in INTEGER columns; keep every domain amount inside int32.
export const MAX_MONEY_CENTS = 2_147_483_647;

export const moneyCentsSchema = z.number().int().min(0).max(MAX_MONEY_CENTS);

export const taxAddressSchema = z.object({
  line1: z.string().trim().min(1).max(160),
  line2: z.string().trim().min(1).max(80).optional(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  postalCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/),
  country: z.literal("US")
}).strict();

export const taxLineTaxabilitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("FULLY_TAXABLE") }).strict(),
  z.object({
    kind: z.literal("EXEMPT"),
    reason: z.string().trim().min(1).max(120)
  }).strict(),
  z.object({
    kind: z.literal("PRODUCT_TAX_CODE"),
    code: z.string().trim().min(1).max(40)
  }).strict()
]);

export const taxCalculationLineSchema = z.object({
  id: z.string().trim().min(1).max(100),
  quantity: z.number().int().positive().max(999),
  unitPriceCents: moneyCentsSchema,
  discountCents: moneyCentsSchema.default(0),
  taxability: taxLineTaxabilitySchema
}).strict().superRefine((line, context) => {
  const gross = BigInt(line.unitPriceCents) * BigInt(line.quantity);
  if (BigInt(line.discountCents) > gross) {
    context.addIssue({
      code: "custom",
      path: ["discountCents"],
      message: "Line discount cannot exceed the gross line amount."
    });
  }
  if (gross > BigInt(Number.MAX_SAFE_INTEGER)) {
    context.addIssue({
      code: "custom",
      path: ["unitPriceCents"],
      message: "Gross line amount exceeds the supported safe-integer range."
    });
  }
});

export const taxCalculationInputSchema = z.object({
  fulfillmentType: z.literal("SHIPPING"),
  currency: z.literal("USD"),
  origin: taxAddressSchema,
  destination: taxAddressSchema,
  shippingCents: moneyCentsSchema,
  lines: z.array(taxCalculationLineSchema).min(1).max(250)
}).strict().superRefine((input, context) => {
  const ids = new Set<string>();
  let subtotal = 0n;
  for (const [index, line] of input.lines.entries()) {
    if (ids.has(line.id)) {
      context.addIssue({
        code: "custom",
        path: ["lines", index, "id"],
        message: "Tax calculation line IDs must be unique."
      });
    }
    ids.add(line.id);
    subtotal += BigInt(line.unitPriceCents) * BigInt(line.quantity) - BigInt(line.discountCents);
  }
  const orderTotal = subtotal + BigInt(input.shippingCents);
  if (subtotal > BigInt(MAX_MONEY_CENTS) || orderTotal > BigInt(MAX_MONEY_CENTS)) {
    context.addIssue({
      code: "custom",
      path: ["lines"],
      message: "Tax calculation total exceeds the supported amount."
    });
  }
});

export type TaxAddress = z.infer<typeof taxAddressSchema>;
export type TaxLineTaxability = z.infer<typeof taxLineTaxabilitySchema>;
export type TaxCalculationLine = z.infer<typeof taxCalculationLineSchema>;
export type TaxCalculationInput = z.infer<typeof taxCalculationInputSchema>;

export type NexusDecision = "COLLECT" | "DO_NOT_COLLECT";
export type TaxSource = "origin" | "destination" | null;

export type TaxJurisdiction = Readonly<{
  country: "US";
  state: string;
  county: string | null;
  city: string | null;
}>;

export type TaxCalculationLineResult = Readonly<{
  id: string;
  taxableCents: number;
  taxCents: number;
  combinedRatePpm: number;
}>;

export type TaxCalculationResult = Readonly<{
  provider: "stripe_tax";
  providerQuoteId: string;
  fulfillmentType: "SHIPPING";
  applicationMode: "EXPLICIT_DESTINATION_TAX";
  currency: "USD";
  nexusDecision: NexusDecision;
  taxSource: TaxSource;
  jurisdiction: TaxJurisdiction | null;
  freightTaxable: boolean;
  subtotalCents: number;
  shippingCents: number;
  orderTotalBeforeTaxCents: number;
  taxableMerchandiseCents: number;
  taxableShippingCents: number;
  merchandiseTaxCents: number;
  shippingTaxCents: number;
  totalTaxCents: number;
  totalCents: number;
  combinedRatePpm: number;
  shippingCombinedRatePpm: number;
  lines: readonly TaxCalculationLineResult[];
}>;
