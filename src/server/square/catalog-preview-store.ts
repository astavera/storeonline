/**
 * Implements server-side catalog preview store behavior and persistence boundaries.
 */

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { StorefrontProduct } from "@/features/catalog/product-catalog";

const previewProductSchema = z.object({
  id: z.string().min(1),
  squareVariationId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  department: z.string().min(1),
  shortDescription: z.string(),
  description: z.string(),
  imageUrl: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  badge: z.string().optional(),
  fulfillmentModes: z.array(z.enum(["pickup", "local-delivery", "shipping"])).min(1),
  inventoryStatus: z.enum(["in-stock", "limited", "special-order"]),
  squareVendorIds: z.array(z.string().min(1)).optional(),
  squareVendorNames: z.array(z.string().min(1)).optional(),
  previewOnly: z.literal(true)
});

const catalogPreviewSchema = z.object({
  source: z.literal("square-production-read-only"),
  fetchedAt: z.string().datetime(),
  pageCount: z.number().int().positive(),
  hasMoreItems: z.boolean(),
  products: z.array(previewProductSchema)
});

export type SquareCatalogPreview = Omit<z.infer<typeof catalogPreviewSchema>, "products"> & {
  products: StorefrontProduct[];
};

export async function readSquareCatalogPreview(): Promise<SquareCatalogPreview | null> {
  try {
    const filePath = path.join(process.cwd(), "data", "square-catalog-preview.json");
    const raw = await readFile(filePath, "utf8");

    return parseSquareCatalogPreview(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function parseSquareCatalogPreview(value: unknown): SquareCatalogPreview | null {
  const parsed = catalogPreviewSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}
