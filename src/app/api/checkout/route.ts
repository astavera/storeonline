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
import { getRuntimeOrderProClient } from "@/server/orderpro/runtime";
import {
  getOrderProShippingOrderClient,
  orderProShippingCommandIdentity
} from "@/server/orderpro/shipping-order-client";
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
    quoteRequestId: z.string().uuid(),
    quoteId: z.string().trim().min(8).max(200),
    slotId: z.string().trim().min(8).max(200),
    feeCents: z.number().int().nonnegative(),
    requestedDate: z.string().date(),
    requestAddress: z.object({
      line1: z.string().trim().min(5).max(160),
      line2: z.string().trim().max(80).optional(),
      city: z.string().trim().min(2).max(80),
      state: z.string().trim().length(2),
      postalCode: z.string().trim().regex(/^\d{5}$/),
      country: z.literal("US")
    }),
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
    quoteId: z.string().uuid(),
    requestedDate: z.string().date(),
    slotId: z.string().trim().min(3).max(160),
    slotLabel: z.string().trim().min(3).max(80)
  }).optional(),
  shipping: shippingSelectionSchema.optional(),
  customer: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(7)
  })
}).superRefine((value, context) => {
  if (value.fulfillmentMode === "pickup" && !value.pickup) {
    context.addIssue({
      code: "custom",
      path: ["pickup"],
      message: "A current Pickup quote, date and slot are required."
    });
  }
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
    let verifiedPickup: Extract<
      Awaited<ReturnType<typeof validateOrderProPickupSelection>>,
      { valid: true }
    > | undefined;
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
        locationId: parsed.locationId,
        items: parsed.items
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
        slotId: parsed.pickup.slotId,
        quoteId: parsed.pickup.quoteId,
        items: parsed.items
      });
      if (!validation.valid) errors.push(validation.message);
      else verifiedPickup = validation;
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

    const capacityMode = parsed.fulfillmentMode === "pickup"
      ? "pickup"
      : parsed.fulfillmentMode === "local-delivery"
        ? "local-delivery"
        : null;
    const capacityClient = capacityMode ? getRuntimeOrderProClient() : null;
    if (parsed.fulfillmentMode === "pickup" && (!verifiedPickup || !capacityClient?.ready)) {
      return NextResponse.json(
        {
          ok: false,
          status: "pickup_not_available",
          errors: ["OrderPRO Pickup reservations are not configured."]
        },
        { status: 503 }
      );
    }
    if (
      parsed.fulfillmentMode === "local-delivery"
      && (!verifiedLocalDelivery || !capacityClient?.ready)
    ) {
      return NextResponse.json(
        {
          ok: false,
          status: "local_delivery_not_available",
          errors: ["OrderPRO Local Delivery reservations are not configured."]
        },
        { status: 503 }
      );
    }

    let orderProShippingOrderId: string | undefined;
    let orderProCapacityHoldId: string | undefined;
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
        idempotencyKey: orderProShippingCommandIdentity("create", attempt.attemptId),
        correlationId: orderProShippingCommandIdentity("create", attempt.attemptId)
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
          reason: "CHECKOUT_FAILED",
          idempotencyKey: orderProShippingCommandIdentity("release", attempt.attemptId, "persist"),
          correlationId: orderProShippingCommandIdentity("release", attempt.attemptId, "persist")
        }).catch(() => undefined);
        throw error;
      }
    }

    if (verifiedPickup && capacityClient?.ready) {
      const reserveIdentity = capacityCommandIdentity("pickup", "reserve", attempt.attemptId);
      const reservation = await capacityClient.client.reservePickup({
        quoteId: verifiedPickup.availability.quoteId!,
        slotId: verifiedPickup.slot.id,
        checkoutAttemptId: attempt.attemptId
      }, {
        idempotencyKey: reserveIdentity,
        correlationId: reserveIdentity
      });
      orderProCapacityHoldId = reservation.hold.capacityHoldId;
      try {
        await attemptRepository.recordCapacityReservation({
          attemptId: attempt.attemptId,
          fulfillmentMode: "PICKUP",
          orderproCapacityHoldId: orderProCapacityHoldId,
          expiresAt: new Date(reservation.hold.expiresAt),
          fulfillmentContext: {
            quoteId: verifiedPickup.availability.quoteId,
            slotId: verifiedPickup.slot.id,
            startsAt: verifiedPickup.slot.startsAt,
            endsAt: verifiedPickup.slot.endsAt,
            requestedDate: verifiedPickup.availability.requestedDate,
            locationId: parsed.locationId
          }
        });
      } catch (error) {
        const releaseIdentity = capacityCommandIdentity("pickup", "release", attempt.attemptId, "persist");
        await capacityClient.client.releaseCapacityCheckout({
          capacityHoldId: orderProCapacityHoldId,
          reason: "CHECKOUT_FAILED"
        }, {
          idempotencyKey: releaseIdentity,
          correlationId: releaseIdentity
        }).catch(() => undefined);
        throw error;
      }
    }

    if (verifiedLocalDelivery && parsed.localDelivery && capacityClient?.ready) {
      const reserveIdentity = capacityCommandIdentity(
        "local-delivery",
        "reserve",
        attempt.attemptId
      );
      const reservation = await capacityClient.client.reserveWalkingLocalDelivery({
        quoteId: verifiedLocalDelivery.quoteId,
        slotId: verifiedLocalDelivery.slotId,
        checkoutAttemptId: attempt.attemptId
      }, {
        idempotencyKey: reserveIdentity,
        correlationId: reserveIdentity
      });
      orderProCapacityHoldId = reservation.hold.capacityHoldId;
      try {
        await attemptRepository.recordCapacityReservation({
          attemptId: attempt.attemptId,
          fulfillmentMode: "LOCAL_DELIVERY",
          orderproCapacityHoldId: orderProCapacityHoldId,
          expiresAt: new Date(reservation.hold.expiresAt),
          fulfillmentContext: {
            quoteRequestId: parsed.localDelivery.quoteRequestId,
            quoteId: verifiedLocalDelivery.quoteId,
            slotId: verifiedLocalDelivery.slotId,
            startsAt: verifiedLocalDelivery.startsAt,
            endsAt: verifiedLocalDelivery.endsAt,
            requestedDate: parsed.localDelivery.requestedDate,
            locationId: parsed.locationId,
            feeCents: verifiedLocalDelivery.feeCents,
            addressHash: createHash("sha256")
              .update(JSON.stringify(verifiedLocalDelivery.address))
              .digest("hex")
          }
        });
      } catch (error) {
        const releaseIdentity = capacityCommandIdentity(
          "local-delivery",
          "release",
          attempt.attemptId,
          "persist"
        );
        await capacityClient.client.releaseCapacityCheckout({
          capacityHoldId: orderProCapacityHoldId,
          reason: "CHECKOUT_FAILED"
        }, {
          idempotencyKey: releaseIdentity,
          correlationId: releaseIdentity
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
        ...(orderProCapacityHoldId ? { orderProCapacityHoldId } : {}),
        fulfillmentMode: parsed.fulfillmentMode,
        customer: parsed.customer,
        quote,
        ...(verifiedPickup ? { pickup: {
          quoteId: verifiedPickup.availability.quoteId!,
          requestedDate: verifiedPickup.availability.requestedDate,
          slotId: verifiedPickup.slot.id,
          slotLabel: verifiedPickup.slot.label,
          startsAt: verifiedPickup.slot.startsAt,
          endsAt: verifiedPickup.slot.endsAt
        } } : {}),
        ...(verifiedLocalDelivery ? { localDelivery: verifiedLocalDelivery } : {}),
        ...(verifiedShipping ? { shipping: verifiedShipping } : {})
      });
    } catch (error) {
      if (orderProShippingOrderId && shippingClient) {
        await shippingClient.release({
          shippingOrderId: orderProShippingOrderId,
          reason: "CHECKOUT_FAILED",
          idempotencyKey: orderProShippingCommandIdentity("release", attempt.attemptId, "square"),
          correlationId: orderProShippingCommandIdentity("release", attempt.attemptId, "square")
        }).catch(() => undefined);
      }
      if (orderProCapacityHoldId && capacityClient?.ready) {
        const releaseIdentity = capacityCommandIdentity(capacityMode!, "release", attempt.attemptId, "square");
        await capacityClient.client.releaseCapacityCheckout({
          capacityHoldId: orderProCapacityHoldId,
          reason: "CHECKOUT_FAILED"
        }, {
          idempotencyKey: releaseIdentity,
          correlationId: releaseIdentity
        }).catch(() => undefined);
      }
      throw error;
    }

    if (orderProCapacityHoldId && capacityClient?.ready) {
      if (!squareCheckout.squarePaymentLinkId) {
        const releaseIdentity = capacityCommandIdentity(capacityMode!, "release", attempt.attemptId, "missing-link");
        await capacityClient.client.releaseCapacityCheckout({
          capacityHoldId: orderProCapacityHoldId,
          reason: "CHECKOUT_FAILED"
        }, {
          idempotencyKey: releaseIdentity,
          correlationId: releaseIdentity
        }).catch(() => undefined);
        throw new SquareCheckoutUnavailableError("Square did not return a manageable checkout link.");
      }
      try {
        await attemptRepository.recordCapacityHostedCheckout({
          attemptId: attempt.attemptId,
          squareOrderId: squareCheckout.squareOrderId,
          squarePaymentLinkId: squareCheckout.squarePaymentLinkId
        });
        const bindIdentity = capacityCommandIdentity(capacityMode!, "bind", attempt.attemptId);
        await capacityClient.client.bindCapacityCheckout({
          capacityHoldId: orderProCapacityHoldId,
          squareOrderId: squareCheckout.squareOrderId,
          squarePaymentLinkId: squareCheckout.squarePaymentLinkId,
          squareLocationId: location.squareLocationId
        }, {
          idempotencyKey: bindIdentity,
          correlationId: bindIdentity
        });
      } catch (error) {
        let squareLinkClosed = false;
        try {
          await deleteSquareHostedCheckoutLink(squareCheckout.squarePaymentLinkId);
          squareLinkClosed = true;
        } catch {
          // Keep the reservation while a live payment link may still complete.
        }
        if (squareLinkClosed) {
          const releaseIdentity = capacityCommandIdentity(capacityMode!, "release", attempt.attemptId, "bind");
          await capacityClient.client.releaseCapacityCheckout({
            capacityHoldId: orderProCapacityHoldId,
            reason: "CHECKOUT_FAILED"
          }, {
            idempotencyKey: releaseIdentity,
            correlationId: releaseIdentity
          }).catch(() => undefined);
        }
        throw error;
      }
    }

    if (orderProShippingOrderId && shippingClient) {
      if (!squareCheckout.squarePaymentLinkId) {
        await shippingClient.release({
          shippingOrderId: orderProShippingOrderId,
          reason: "CHECKOUT_FAILED",
          idempotencyKey: orderProShippingCommandIdentity("release", attempt.attemptId, "missing-link"),
          correlationId: orderProShippingCommandIdentity("release", attempt.attemptId, "missing-link")
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
          squareLocationId: location.squareLocationId,
          idempotencyKey: orderProShippingCommandIdentity("bind", attempt.attemptId),
          correlationId: orderProShippingCommandIdentity("bind", attempt.attemptId)
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
            reason: "CHECKOUT_FAILED",
            idempotencyKey: orderProShippingCommandIdentity("release", attempt.attemptId, "bind"),
            correlationId: orderProShippingCommandIdentity("release", attempt.attemptId, "bind")
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

function capacityCommandIdentity(
  mode: "pickup" | "local-delivery",
  action: "reserve" | "bind" | "confirm" | "release",
  ...parts: string[]
) {
  const digest = createHash("sha256")
    .update(JSON.stringify([mode, action, ...parts]))
    .digest("hex");
  return `capacity-${mode}-${action}:v1:${digest}`;
}
