/**
 * Handles HTTP requests for the API checkout endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  CheckoutIdempotencyConflictError,
  getCheckoutAttemptRepository,
  hashCheckoutRequest
} from "@/server/checkout/checkout-attempt-repository";
import { quoteCartFromOperationalCatalog } from "@/server/checkout/cart-service";
import { PersistenceUnavailableError } from "@/server/db/persistence-policy";
import { isOrderProLocalDeliveryCheckoutEnabled } from "@/server/orderpro/config";
import { isOrderProDeliveryTestMode, validateOrderProLocalDeliverySelection } from "@/server/orderpro/orderpro-local-delivery-service";
import { validateOrderProPickupSelection } from "@/server/orderpro/orderpro-pickup-slot-service";
import { getOrderProShippingOrderClient } from "@/server/orderpro/shipping-order-client";
import { readMappedOperationalStoreLocations } from "@/server/square/postgres-catalog-store";
import {
  createSquareHostedCheckout,
  deleteSquareHostedCheckoutLink,
  SquareCheckoutUnavailableError
} from "@/server/square/hosted-checkout";
import {
  isOrderProShippingCheckoutEnabled,
  quoteShippingPilotCart,
  shippingSelectionSchema,
  ShippingUnavailableError,
  validateShippingSelection
} from "@/server/shipping/shipping-service";

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
  shipping: shippingSelectionSchema.optional(),
  customer: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(7)
  })
});

export async function POST(request: NextRequest) {
  try {
    const parsed = checkoutRequestSchema.parse(await request.json());
    let verifiedLocalDelivery: {
      quoteId: string;
      slotId: string;
      feeCents: number;
      startsAt: string;
      endsAt: string;
      address: {
        line1: string;
        line2?: string;
        city: string;
        state: string;
        postalCode: string;
        country: "US";
      };
    } | undefined;
    let verifiedShipping: Awaited<ReturnType<typeof validateShippingSelection>> | undefined;
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return NextResponse.json({ ok: false, status: "validation_only", errors: ["A valid Idempotency-Key header is required."] }, { status: 400 });
    }

    if (parsed.fulfillmentMode === "local-delivery" && !isOrderProDeliveryTestMode() && !isOrderProLocalDeliveryCheckoutEnabled()) {
      return NextResponse.json(
        {
          ok: false,
          status: "local_delivery_not_available",
          errors: ["Local delivery checkout is not available yet. Please select pickup or shipping."]
        },
        { status: 503 }
      );
    }
    if (parsed.fulfillmentMode === "shipping" && !isOrderProShippingCheckoutEnabled()) {
      return NextResponse.json(
        {
          ok: false,
          status: "shipping_not_available",
          errors: ["Shipping checkout is not available yet. Please select pickup or local delivery."]
        },
        { status: 503 }
      );
    }

    const quote = parsed.fulfillmentMode === "shipping"
      ? await quoteShippingPilotCart({ items: parsed.items, locationId: parsed.locationId })
      : await quoteCartFromOperationalCatalog({ items: parsed.items, locationId: parsed.locationId });
    const errors = [...quote.errors];
    if (parsed.fulfillmentMode === "local-delivery" && !parsed.localDelivery) {
      errors.push("A validated local delivery quote and slot are required.");
    }
    if (parsed.fulfillmentMode === "local-delivery" && parsed.localDelivery) {
      const validation = await validateOrderProLocalDeliverySelection({
        ...parsed.localDelivery,
        locationId: parsed.locationId
      });
      if (!validation.valid) {
        errors.push(validation.message);
      } else {
        const slot = validation.quote.availableSlots.find((candidate) => candidate.id === parsed.localDelivery?.slotId);
        if (!slot) {
          errors.push("The selected local delivery time is no longer available.");
        } else {
          verifiedLocalDelivery = {
            quoteId: validation.quote.quoteId,
            slotId: slot.id,
            feeCents: validation.quote.feeCents,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            address: validation.quote.normalizedAddress
          };
        }
      }
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
    if (parsed.fulfillmentMode !== "shipping" && parsed.shipping) {
      errors.push("Shipping rate details are not valid for the selected fulfillment method.");
    }
    if (parsed.fulfillmentMode === "shipping" && !parsed.shipping) {
      errors.push("A current Shippo shipping rate is required.");
    }
    if (parsed.fulfillmentMode === "shipping" && parsed.shipping && errors.length === 0) {
      try {
        verifiedShipping = await validateShippingSelection({
          items: parsed.items,
          locationId: parsed.locationId,
          selection: parsed.shipping
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "The shipping rate could not be verified.");
      }
    }
    if (!quote.compatibleFulfillmentModes.includes(parsed.fulfillmentMode)) {
      errors.push("Selected fulfillment method is not available for this cart.");
    }

    const attemptRepository = getCheckoutAttemptRepository();
    const attempt = await attemptRepository.recordValidation({
      idempotencyKey,
      requestHash: hashCheckoutRequest(parsed),
      quote,
      errors
    });

    if (errors.length > 0) {
      return NextResponse.json({
        ok: false,
        status: "validation_failed",
        attemptId: attempt.attemptId,
        replayed: attempt.replayed,
        quote,
        errors,
        paymentCaptured: false,
        squareOrderCreated: false
      }, { status: 400 });
    }

    const location = (await readMappedOperationalStoreLocations())
      .find((candidate) => candidate.id === parsed.locationId);
    if (!location) {
      return NextResponse.json({
        ok: false,
        status: "location_not_available",
        errors: ["The selected store is not available for Square checkout."]
      }, { status: 400 });
    }

    const shippingClient = parsed.fulfillmentMode === "shipping"
      ? getOrderProShippingOrderClient()
      : null;
    if (parsed.fulfillmentMode === "shipping" && (!verifiedShipping || !shippingClient)) {
      return NextResponse.json(
        {
          ok: false,
          status: "shipping_not_available",
          errors: ["OrderPRO shipping order reservations are not configured."]
        },
        { status: 503 }
      );
    }

    let orderProShippingOrderId: string | undefined;
    if (verifiedShipping && shippingClient) {
      const reservation = await shippingClient.create({
        checkoutAttemptId: attempt.attemptId,
        locationId: parsed.locationId,
        items: parsed.items,
        readyToShipDate: verifiedShipping.readyToShipDate,
        destination: {
          ...parsed.customer,
          address: verifiedShipping.address
        },
        rate: {
          rateId: verifiedShipping.rateId,
          amountCents: verifiedShipping.amountCents,
          currency: "USD",
          carrier: verifiedShipping.carrier,
          serviceName: verifiedShipping.serviceName
        },
        idempotencyKey: `shipping-checkout:${attempt.attemptId}`,
        correlationId: `shipping-checkout:${attempt.attemptId}`
      });
      orderProShippingOrderId = reservation.order.id;
      try {
        await attemptRepository.recordShippingReservation({
          attemptId: attempt.attemptId,
          orderproShippingOrderId: reservation.order.id,
          shippingContext: {
            rateId: verifiedShipping.rateId,
            amountCents: verifiedShipping.amountCents,
            carrier: verifiedShipping.carrier,
            serviceName: verifiedShipping.serviceName,
            readyToShipDate: verifiedShipping.readyToShipDate,
            destinationHash: createHash("sha256")
              .update(JSON.stringify(verifiedShipping.address))
              .digest("hex")
          }
        });
      } catch (error) {
        await shippingClient.release({
          shippingOrderId: reservation.order.id,
          reason: "CHECKOUT_FAILED"
        }).catch(() => undefined);
        throw error;
      }
    }

    let squareCheckout: Awaited<ReturnType<typeof createSquareHostedCheckout>>;
    try {
      squareCheckout = await createSquareHostedCheckout({
        attemptId: attempt.attemptId,
        idempotencyKey,
        squareLocationId: location.squareLocationId,
        ...(orderProShippingOrderId ? { orderProShippingOrderId } : {}),
        fulfillmentMode: parsed.fulfillmentMode,
        customer: parsed.customer,
        quote,
        ...(parsed.pickup ? { pickup: parsed.pickup } : {}),
        ...(verifiedLocalDelivery ? { localDelivery: verifiedLocalDelivery } : {}),
        ...(verifiedShipping ? { shipping: verifiedShipping } : {})
      });
    } catch (error) {
      if (orderProShippingOrderId && shippingClient) {
        await shippingClient.release({
          shippingOrderId: orderProShippingOrderId,
          reason: "CHECKOUT_FAILED"
        }).catch(() => undefined);
      }
      throw error;
    }

    if (orderProShippingOrderId && shippingClient) {
      if (!squareCheckout.squarePaymentLinkId) {
        await shippingClient.release({
          shippingOrderId: orderProShippingOrderId,
          reason: "CHECKOUT_FAILED"
        }).catch(() => undefined);
        throw new SquareCheckoutUnavailableError("Square did not return a manageable checkout link.");
      }
      try {
        // Persist the Square link first so the cleanup worker can always close it
        // if this process stops before OrderPRO is bound.
        await attemptRepository.recordHostedCheckout({
          attemptId: attempt.attemptId,
          squareOrderId: squareCheckout.squareOrderId,
          squarePaymentLinkId: squareCheckout.squarePaymentLinkId
        });
        await shippingClient.bind({
          shippingOrderId: orderProShippingOrderId,
          squareOrderId: squareCheckout.squareOrderId,
          squarePaymentLinkId: squareCheckout.squarePaymentLinkId,
          squareLocationId: location.squareLocationId
        });
      } catch (error) {
        let squareLinkClosed = false;
        try {
          await deleteSquareHostedCheckoutLink(squareCheckout.squarePaymentLinkId);
          squareLinkClosed = true;
        } catch {
          // Keep inventory reserved if the live payment link could not be closed.
        }
        if (squareLinkClosed) {
          await shippingClient.release({
            shippingOrderId: orderProShippingOrderId,
            reason: "CHECKOUT_FAILED"
          }).catch(() => undefined);
        }
        throw error;
      }
    }

    return NextResponse.json({
      ok: true,
      status: "redirect_to_square",
      attemptId: attempt.attemptId,
      replayed: attempt.replayed,
      quote,
      errors: [],
      checkoutUrl: squareCheckout.checkoutUrl,
      squareOrderId: squareCheckout.squareOrderId,
      squarePaymentLinkId: squareCheckout.squarePaymentLinkId,
      paymentCaptured: false,
      squareOrderCreated: true
    });
  } catch (error) {
    if (error instanceof CheckoutIdempotencyConflictError) {
      return NextResponse.json({ ok: false, status: "validation_only", errors: [error.message] }, { status: 409 });
    }
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ ok: false, status: "validation_only", errors: [error.message] }, { status: 503 });
    }
    if (error instanceof SquareCheckoutUnavailableError) {
      return NextResponse.json({ ok: false, status: "square_checkout_unavailable", errors: [error.message] }, { status: 503 });
    }
    if (error instanceof ShippingUnavailableError) {
      return NextResponse.json({ ok: false, status: "shipping_not_available", errors: [error.message] }, { status: 422 });
    }
    return NextResponse.json(
      { ok: false, status: "validation_only", errors: [error instanceof Error ? error.message : "Invalid checkout request."] },
      { status: 400 }
    );
  }
}
