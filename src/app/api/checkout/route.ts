import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { quoteCart } from "@/server/checkout/cart-service";
import { getSquareRuntimeConfig } from "@/server/square/client";

const checkoutRequestSchema = z.object({
  items: z.array(z.object({ squareVariationId: z.string().min(1), quantity: z.number().int().positive().max(99) })).max(50),
  fulfillmentMode: z.enum(["pickup", "local-delivery", "shipping"]),
  customer: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(7)
  })
});

export async function POST(request: NextRequest) {
  try {
    const parsed = checkoutRequestSchema.parse(await request.json());
    const quote = quoteCart({ items: parsed.items });

    if (quote.errors.length > 0) {
      return NextResponse.json({ ok: false, quote, errors: quote.errors }, { status: 400 });
    }

    if (!quote.compatibleFulfillmentModes.includes(parsed.fulfillmentMode)) {
      return NextResponse.json(
        {
          ok: false,
          quote,
          errors: ["Selected fulfillment method is not available for this cart."]
        },
        { status: 400 }
      );
    }

    const square = getSquareRuntimeConfig();

    if (square.environment !== "sandbox" || !square.hasAccessToken || !square.hasApplicationId) {
      return NextResponse.json(
        {
          ok: false,
          quote,
          status: "payment_setup_required",
          errors: ["Online checkout isn’t available yet. Please contact the store to complete your purchase."]
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: "ready_for_square_payment",
      quote,
      customer: parsed.customer
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        errors: [error instanceof Error ? error.message : "Invalid checkout request."]
      },
      { status: 400 }
    );
  }
}
