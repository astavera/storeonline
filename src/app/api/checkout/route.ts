import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CheckoutIdempotencyConflictError,
  getCheckoutAttemptRepository,
  hashCheckoutRequest
} from "@/server/checkout/checkout-attempt-repository";
import { quoteCartFromOperationalCatalog } from "@/server/checkout/cart-service";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";

const checkoutRequestSchema = z.object({
  items: z.array(z.object({ squareVariationId: z.string().min(1), quantity: z.number().int().positive().max(99) })).max(50),
  fulfillmentMode: z.enum(["pickup", "local-delivery", "shipping"]),
  locationId: z.string().trim().min(1).max(160),
  customer: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(7)
  })
});

export async function POST(request: NextRequest) {
  try {
    const parsed = checkoutRequestSchema.parse(await request.json());
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return NextResponse.json({ ok: false, status: "validation_only", errors: ["A valid Idempotency-Key header is required."] }, { status: 400 });
    }

    const quote = await quoteCartFromOperationalCatalog({ items: parsed.items, locationId: parsed.locationId });
    const errors = [...quote.errors];
    if (!quote.compatibleFulfillmentModes.includes(parsed.fulfillmentMode)) {
      errors.push("Selected fulfillment method is not available for this cart.");
    }

    const attempt = await getCheckoutAttemptRepository().recordValidation({
      idempotencyKey,
      requestHash: hashCheckoutRequest(parsed),
      quote,
      errors
    });

    return NextResponse.json({
      ok: errors.length === 0,
      status: "validation_only",
      attemptId: attempt.attemptId,
      replayed: attempt.replayed,
      quote,
      errors,
      paymentCaptured: false,
      squareOrderCreated: false
    }, { status: errors.length === 0 ? 200 : 400 });
  } catch (error) {
    if (error instanceof CheckoutIdempotencyConflictError) {
      return NextResponse.json({ ok: false, status: "validation_only", errors: [error.message] }, { status: 409 });
    }
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ ok: false, status: "validation_only", errors: [error.message] }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, status: "validation_only", errors: [error instanceof Error ? error.message : "Invalid checkout request."] },
      { status: 400 }
    );
  }
}
