import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CheckoutIdempotencyConflictError,
  getCheckoutAttemptRepository,
  hashCheckoutRequest
} from "@/server/checkout/checkout-attempt-repository";
import { quoteCartFromOperationalCatalog } from "@/server/checkout/cart-service";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { validateOrderProLocalDeliverySelection } from "@/server/orderpro/orderpro-local-delivery-service";
import { validateOrderProPickupSelection } from "@/server/orderpro/orderpro-pickup-slot-service";

const checkoutRequestSchema = z.object({
  items: z.array(z.object({ squareVariationId: z.string().min(1), quantity: z.number().int().positive().max(99) })).max(50),
  fulfillmentMode: z.enum(["pickup", "local-delivery", "shipping"]),
  locationId: z.string().trim().min(1).max(160),
  localDelivery: z.object({
    quoteId: z.string().trim().min(8).max(200),
    slotId: z.string().trim().min(8).max(200),
    feeCents: z.number().int().nonnegative(),
    requestedDate: z.string().date(),
    address: z.object({
      line1: z.string().trim().min(5).max(160),
      line2: z.string().trim().max(80).optional(),
      city: z.string().trim().min(2).max(80),
      state: z.string().trim().length(2),
      postalCode: z.string().trim().regex(/^\d{5}$/),
      country: z.literal("US")
    })
  }).optional(),
  pickup: z.object({
    requestedDate: z.string().date(),
    slotId: z.string().trim().min(3).max(80),
    slotLabel: z.string().trim().min(3).max(80)
  }).optional(),
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
    if (parsed.fulfillmentMode === "local-delivery" && !parsed.localDelivery) {
      errors.push("A validated local delivery quote and slot are required.");
    }
    if (parsed.fulfillmentMode === "local-delivery" && parsed.localDelivery) {
      const validation = await validateOrderProLocalDeliverySelection({
        ...parsed.localDelivery,
        locationId: parsed.locationId
      });
      if (!validation.valid) errors.push(validation.message);
    }
    if (parsed.fulfillmentMode !== "local-delivery" && parsed.localDelivery) {
      errors.push("Local delivery details are not valid for the selected fulfillment method.");
    }
    if (parsed.fulfillmentMode !== "pickup" && parsed.pickup) {
      errors.push("Pickup schedule details are not valid for the selected fulfillment method.");
    }
    if (parsed.fulfillmentMode === "pickup" && parsed.pickup) {
      const validation = await validateOrderProPickupSelection({
        locationId: parsed.locationId,
        requestedDate: parsed.pickup.requestedDate,
        slotId: parsed.pickup.slotId
      });
      if (!validation.valid) errors.push(validation.message);
    }
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
