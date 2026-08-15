/**
 * Handles HTTP requests for the API shipping rates endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  quoteShippingRates,
  shippingAddressSchema,
  ShippingUnavailableError
} from "@/server/shipping/shipping-service";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  items: z.array(z.object({
    squareVariationId: z.string().trim().min(1).max(192),
    quantity: z.number().int().positive().max(99)
  }).strict()).min(1).max(50),
  locationId: z.string().trim().min(1).max(160),
  address: shippingAddressSchema
}).strict();

export async function POST(request: NextRequest) {
  try {
    const parsed = requestSchema.parse(await request.json());
    const result = await quoteShippingRates(parsed);
    return NextResponse.json({
      ok: true,
      allocation: result.allocation,
      rates: result.rates
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shipping rates are unavailable.";
    return NextResponse.json(
      { ok: false, errors: [message] },
      {
        status: error instanceof ShippingUnavailableError ? 422 : 503,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }
}
