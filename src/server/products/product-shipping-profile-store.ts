/**
 * Reads and writes the narrow website-owned shipping profile projection.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  emptyProductShippingProfile,
  type ProductShippingProfile,
  type ProductShippingProfileDraft
} from "@/features/catalog/product-shipping-profile";
import type { WebsiteProductPlacement } from "@/features/catalog/services/website-merchandising-service";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";

const packageDecimalSchema = z.string()
  .trim()
  .max(16)
  .regex(/^$|^\d+(?:\.\d{1,3})?$/, "Use a positive number with up to three decimal places.")
  .refine((value) => value === "" || (Number(value) > 0 && Number(value) <= 99_999.999), {
    message: "Use a value greater than zero and no more than 99999.999."
  });

export const productShippingProfileInputSchema = z.object({
  isShippable: z.boolean(),
  packageLengthIn: packageDecimalSchema,
  packageWidthIn: packageDecimalSchema,
  packageHeightIn: packageDecimalSchema,
  packageWeightLb: packageDecimalSchema
}).strict();

type ProductShippingProfileRow = {
  squareVariationId: string;
  configured: boolean;
  isShippable: boolean;
  packageLengthIn: string | null;
  packageWidthIn: string | null;
  packageHeightIn: string | null;
  packageWeightLb: string | null;
  shippingEnabled: boolean;
};

export async function readProductShippingProfilesByVariationIds(
  variationIds: string[]
): Promise<Map<string, ProductShippingProfile>> {
  const normalizedIds = Array.from(new Set(variationIds.map((id) => id.trim()).filter(Boolean)));
  if (normalizedIds.length === 0) return new Map();
  if (normalizedIds.length > 5_000) throw new Error("At most 5000 product shipping profiles can be read at once.");

  try {
    const rows = await getPrismaClient().$queryRaw<ProductShippingProfileRow[]>(Prisma.sql`
      SELECT *
      FROM public.storefront_read_product_shipping_profiles_v1(
        ARRAY[${Prisma.join(normalizedIds)}]::text[]
      )
    `);
    return new Map(rows.map((row) => [row.squareVariationId, normalizeRow(row)]));
  } catch (error) {
    throw new PersistenceUnavailableError("PostgreSQL product shipping profiles", { cause: error });
  }
}

export async function readProductShippingProfile(squareVariationId: string) {
  const normalizedId = squareVariationId.trim();
  if (!normalizedId) return cloneEmptyProfile();
  return (await readProductShippingProfilesByVariationIds([normalizedId])).get(normalizedId) ?? cloneEmptyProfile();
}

export async function saveProductShippingProfile(
  placement: WebsiteProductPlacement,
  input: unknown
): Promise<ProductShippingProfile> {
  const profile = productShippingProfileInputSchema.parse(input);
  const modes = new Set(placement.fulfillmentModes);

  try {
    const rows = await getPrismaClient().$queryRaw<ProductShippingProfileRow[]>(Prisma.sql`
      SELECT *
      FROM public.storefront_admin_save_product_shipping_profile_v1(
        ${placement.squareVariationId},
        ${placement.visible},
        ${modes.has("pickup")},
        ${modes.has("local-delivery")},
        ${modes.has("shipping")},
        ${profile.isShippable},
        ${nullableDecimal(profile.packageLengthIn)},
        ${nullableDecimal(profile.packageWidthIn)},
        ${nullableDecimal(profile.packageHeightIn)},
        ${nullableDecimal(profile.packageWeightLb)}
      )
    `);
    const saved = rows.find((row) => row.squareVariationId === placement.squareVariationId);
    if (!saved) throw new Error("The shipping profile was not returned after saving.");
    return normalizeRow(saved);
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    throw new PersistenceUnavailableError("PostgreSQL product shipping profile save", { cause: error });
  }
}

function nullableDecimal(value: string) {
  return value.trim() ? new Prisma.Decimal(value) : null;
}

function normalizeRow(row: ProductShippingProfileRow): ProductShippingProfile {
  return {
    configured: row.configured,
    isShippable: row.isShippable,
    packageLengthIn: row.packageLengthIn ?? "",
    packageWidthIn: row.packageWidthIn ?? "",
    packageHeightIn: row.packageHeightIn ?? "",
    packageWeightLb: row.packageWeightLb ?? "",
    shippingEnabled: row.shippingEnabled
  };
}

function cloneEmptyProfile(): ProductShippingProfile {
  return { ...emptyProductShippingProfile };
}

export function parseProductShippingProfileInput(input: unknown): ProductShippingProfileDraft {
  return productShippingProfileInputSchema.parse(input);
}
