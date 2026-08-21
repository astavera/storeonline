/**
 * Handles HTTP requests for the API checkout endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { splitCheckoutRequestSchema, type SplitCheckoutRequest } from "@/features/checkout/contracts";
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
import {
  getOrderProShippingOrderClient,
  orderProShippingCommandIdentity
} from "@/server/orderpro/shipping-order-client";
import {
  getOrderProStorefrontFulfillmentClient,
  OrderProStorefrontFulfillmentError
} from "@/server/orderpro/storefront-fulfillment-client";
import { readMappedOperationalStoreLocations } from "@/server/square/postgres-catalog-store";
import {
  createSquareHostedCheckout,
  deleteSquareHostedCheckoutLink,
  type SquareHostedFulfillmentGroup,
  SquareCheckoutUnavailableError
} from "@/server/square/hosted-checkout";
import {
  isOrderProShippingCheckoutEnabled,
  quoteShippingCart,
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
    const body = await request.json();
    if (body && typeof body === "object" && "version" in body && body.version === 2) {
      return await handleSplitCheckout(request, body);
    }
    const parsed = checkoutRequestSchema.parse(body);
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
      ? await quoteShippingCart({ items: parsed.items, locationId: parsed.locationId })
      : await quoteCartFromOperationalCatalog({ items: parsed.items, locationId: parsed.locationId });
    const errors = [...quote.errors];
    if (parsed.fulfillmentMode === "local-delivery" && !parsed.localDelivery) {
      errors.push("A validated local delivery quote and slot are required.");
    }
    if (parsed.fulfillmentMode === "local-delivery" && parsed.localDelivery) {
      const validation = await validateOrderProLocalDeliverySelection({
        ...parsed.localDelivery,
        locationId: parsed.locationId,
        cartLines: parsed.items
      }, { quoteRequestId: `checkout:${idempotencyKey}:regular` });
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
        cartLines: parsed.items
      }, { quoteRequestId: `checkout:${idempotencyKey}:regular` });
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
          reason: "CHECKOUT_FAILED",
          idempotencyKey: orderProShippingCommandIdentity("release", attempt.attemptId, "square"),
          correlationId: orderProShippingCommandIdentity("release", attempt.attemptId, "square")
        }).catch(() => undefined);
      }
      throw error;
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
          squarePaymentLinkId: squareCheckout.squarePaymentLinkId,
          checkoutUrl: squareCheckout.checkoutUrl
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
    if (error instanceof OrderProStorefrontFulfillmentError) {
      const status = error.status && [409, 410, 422].includes(error.status) ? 422 : 503;
      return NextResponse.json({
        ok: false,
        status: "fulfillment_reservation_not_available",
        errors: [status === 422
          ? "The selected fulfillment time is no longer available. Choose another time."
          : "OrderPRO could not reserve fulfillment capacity. Please try again."]
      }, { status });
    }
    return NextResponse.json(
      { ok: false, status: "validation_only", errors: [error instanceof Error ? error.message : "Invalid checkout request."] },
      { status: 400 }
    );
  }
}

type VerifiedSplitGroup = {
  id: "regular" | "balloons";
  fulfillmentMode: "pickup" | "local-delivery" | "shipping";
  locationId: string;
  squareLocationId: string;
  items: SplitCheckoutRequest["items"];
  pickup?: {
    timing: "ASAP" | "SCHEDULED";
    quoteId?: string;
    requestedDate?: string;
    slotId?: string;
    slotLabel?: string;
    startsAt?: string;
    endsAt?: string;
  };
  localDelivery?: SquareHostedFulfillmentGroup["localDelivery"];
  shipping?: NonNullable<SquareHostedFulfillmentGroup["shipping"]>;
  orderProShippingOrderId?: string;
  orderProCapacityHoldId?: string;
};

async function handleSplitCheckout(request: NextRequest, body: unknown) {
  if (process.env.SPLIT_CHECKOUT_ENABLED !== "true") {
    return NextResponse.json({
      ok: false,
      status: "split_checkout_not_available",
      errors: ["Combined fulfillment checkout is not enabled yet."]
    }, { status: 503 });
  }

  const parsed = splitCheckoutRequestSchema.parse(body);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return NextResponse.json({ ok: false, status: "validation_only", errors: ["A valid Idempotency-Key header is required."] }, { status: 400 });
  }

  const requestHash = hashCheckoutRequest(parsed);
  const attemptRepository = getCheckoutAttemptRepository();
  const existingAttempt = await attemptRepository.findValidation({ idempotencyKey, requestHash });
  if (existingAttempt) {
    if (existingAttempt.errors.length > 0) {
      return NextResponse.json({
        ok: false,
        status: "validation_failed",
        attemptId: existingAttempt.attemptId,
        replayed: true,
        quote: existingAttempt.quote,
        errors: existingAttempt.errors,
        paymentCaptured: false,
        squareOrderCreated: false
      }, { status: 400 });
    }

    const existingCheckout = await attemptRepository.findSplitCheckout(existingAttempt.attemptId);
    if (
      existingCheckout?.checkoutUrl
      && existingCheckout.squareOrderId
      && existingCheckout.squarePaymentLinkId
    ) {
      return splitCheckoutSuccessResponse({
        attemptId: existingAttempt.attemptId,
        replayed: true,
        quote: existingAttempt.quote,
        checkoutUrl: existingCheckout.checkoutUrl,
        squareOrderId: existingCheckout.squareOrderId,
        squarePaymentLinkId: existingCheckout.squarePaymentLinkId
      });
    }

    return NextResponse.json({
      ok: false,
      status: "checkout_in_progress",
      attemptId: existingAttempt.attemptId,
      replayed: true,
      errors: ["This checkout is still being initialized. Retry the same request shortly."],
      paymentCaptured: false,
      squareOrderCreated: false
    }, { status: 409 });
  }

  const requestedById = new Map(parsed.fulfillmentGroups.map((group) => [group.id, group]));
  const orderProShippingCheckoutGroups = parsed.fulfillmentGroups
    .filter((group) => group.fulfillmentMode === "shipping")
    .map((group) => group.id);
  const quote = await quoteCartFromOperationalCatalog(
    { items: parsed.items },
    { orderProShippingCheckoutGroups }
  );
  const errors = [...quote.errors];
  const quotedGroups = quote.checkoutGroups ?? [];
  if (
    quotedGroups.length !== parsed.fulfillmentGroups.length
    || quotedGroups.some((group) => !requestedById.has(group.id))
  ) {
    errors.push("The fulfillment groups do not match the current cart.");
  }

  const locations = await readMappedOperationalStoreLocations();
  const verifiedGroups: VerifiedSplitGroup[] = [];
  for (const quotedGroup of quotedGroups) {
    const selection = requestedById.get(quotedGroup.id);
    if (!selection) continue;
    if (quotedGroup.id === "balloons" && selection.fulfillmentMode === "shipping") {
      errors.push("Balloons cannot be shipped.");
      continue;
    }
    const location = locations.find((candidate) => candidate.id === selection.locationId);
    if (!location) {
      errors.push(`${quotedGroup.label} has an unavailable fulfillment location.`);
      continue;
    }
    const groupItems = parsed.items.filter((item) => quotedGroup.lines.some((line) => line.squareVariationId === item.squareVariationId));
    const locationQuote = await quoteCartFromOperationalCatalog(
      { items: groupItems, locationId: selection.locationId },
      selection.fulfillmentMode === "shipping"
        ? { orderProShippingCheckoutGroups: [quotedGroup.id] }
        : {}
    );
    const locationGroup = locationQuote.checkoutGroups?.find((group) => group.id === quotedGroup.id);
    errors.push(...locationQuote.errors);
    if (!locationGroup || !locationGroup.compatibleFulfillmentModes.includes(selection.fulfillmentMode)) {
      errors.push(`${quotedGroup.label} cannot use the selected fulfillment method at this location.`);
      continue;
    }
    if (selection.fulfillmentMode !== "pickup" && selection.pickup) errors.push(`${quotedGroup.label} includes pickup details for a different fulfillment method.`);
    if (selection.fulfillmentMode !== "local-delivery" && selection.localDelivery) errors.push(`${quotedGroup.label} includes delivery details for a different fulfillment method.`);
    if (selection.fulfillmentMode !== "shipping" && selection.shipping) errors.push(`${quotedGroup.label} includes shipping details for a different fulfillment method.`);

    const verified: VerifiedSplitGroup = {
      id: quotedGroup.id,
      fulfillmentMode: selection.fulfillmentMode,
      locationId: selection.locationId,
      squareLocationId: location.squareLocationId,
      items: groupItems
    };

    if (selection.fulfillmentMode === "pickup") {
      if (!selection.pickup) {
        errors.push(`${quotedGroup.label} requires an ASAP or scheduled pickup selection.`);
      } else if (selection.pickup.timing === "ASAP") {
        if (quotedGroup.id === "balloons") errors.push("Balloon pickup requires a scheduled time window.");
        verified.pickup = { timing: "ASAP" };
      } else {
        const validation = await validateOrderProPickupSelection({
          context: quotedGroup.id,
          locationId: selection.locationId,
          requestedDate: selection.pickup.requestedDate,
          slotId: selection.pickup.slotId,
          cartLines: groupItems
        }, { quoteRequestId: `checkout:${idempotencyKey}:${quotedGroup.id}` });
        if (!validation.valid) {
          errors.push(validation.message);
        } else {
          verified.pickup = {
            timing: "SCHEDULED",
            ...(validation.availability.quoteId ? { quoteId: validation.availability.quoteId } : {}),
            requestedDate: selection.pickup.requestedDate,
            slotId: validation.slot.id,
            slotLabel: validation.slot.label,
            startsAt: validation.slot.startsAt,
            endsAt: validation.slot.endsAt
          };
        }
      }
    }

    if (selection.fulfillmentMode === "local-delivery") {
      if (!isOrderProDeliveryTestMode() && !isOrderProLocalDeliveryCheckoutEnabled()) {
        errors.push("Local delivery checkout is not available yet.");
      } else if (!selection.localDelivery) {
        errors.push(`${quotedGroup.label} requires a validated local delivery quote and slot.`);
      } else {
        const validation = await validateOrderProLocalDeliverySelection({
          ...selection.localDelivery,
          locationId: selection.locationId,
          cartLines: groupItems
        }, { quoteRequestId: `checkout:${idempotencyKey}:${quotedGroup.id}` });
        if (!validation.valid) {
          errors.push(validation.message);
        } else {
          const slot = validation.quote.availableSlots.find((candidate) => candidate.id === selection.localDelivery?.slotId);
          if (!slot) {
            errors.push("The selected local delivery time is no longer available.");
          } else {
            verified.localDelivery = {
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
    }

    if (selection.fulfillmentMode === "shipping") {
      if (!isOrderProShippingCheckoutEnabled()) {
        errors.push("Shipping checkout is not available yet.");
      } else if (!selection.shipping) {
        errors.push(`${quotedGroup.label} requires a current Shippo shipping rate.`);
      } else {
        try {
          verified.shipping = await validateShippingSelection({
            items: groupItems,
            locationId: selection.locationId,
            selection: selection.shipping
          });
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "The shipping rate could not be verified.");
        }
      }
    }

    verifiedGroups.push(verified);
  }

  const uniqueErrors = Array.from(new Set(errors));
  const attempt = await attemptRepository.recordValidation({
    idempotencyKey,
    requestHash,
    quote,
    errors: uniqueErrors
  });
  if (attempt.errors.length > 0) {
    return NextResponse.json({
      ok: false,
      status: "validation_failed",
      attemptId: attempt.attemptId,
      replayed: attempt.replayed,
      quote: attempt.quote,
      errors: attempt.errors,
      paymentCaptured: false,
      squareOrderCreated: false
    }, { status: 400 });
  }

  if (attempt.replayed) {
    const existingCheckout = await attemptRepository.findSplitCheckout(attempt.attemptId);
    if (
      existingCheckout?.checkoutUrl
      && existingCheckout.squareOrderId
      && existingCheckout.squarePaymentLinkId
    ) {
      return splitCheckoutSuccessResponse({
        attemptId: attempt.attemptId,
        replayed: true,
        quote: attempt.quote,
        checkoutUrl: existingCheckout.checkoutUrl,
        squareOrderId: existingCheckout.squareOrderId,
        squarePaymentLinkId: existingCheckout.squarePaymentLinkId
      });
    }
    return NextResponse.json({
      ok: false,
      status: "checkout_in_progress",
      attemptId: attempt.attemptId,
      replayed: true,
      errors: ["This checkout is still being initialized. Retry the same request shortly."],
      paymentCaptured: false,
      squareOrderCreated: false
    }, { status: 409 });
  }

  const shippingGroup = verifiedGroups.find((group) => group.fulfillmentMode === "shipping" && group.shipping);
  const shippingClient = shippingGroup ? getOrderProShippingOrderClient() : null;
  const capacityGroups = verifiedGroups.filter((group) => (
    group.fulfillmentMode === "local-delivery"
    || (group.fulfillmentMode === "pickup" && group.pickup?.timing === "SCHEDULED")
  ));
  const capacityClient = capacityGroups.length > 0 ? getOrderProStorefrontFulfillmentClient() : null;
  if (shippingGroup && !shippingClient) {
    return NextResponse.json({ ok: false, status: "shipping_not_available", errors: ["OrderPRO shipping reservations are not configured."] }, { status: 503 });
  }
  if (capacityGroups.length > 0 && !capacityClient) {
    return NextResponse.json({
      ok: false,
      status: "fulfillment_reservation_not_available",
      errors: ["OrderPRO pickup and local-delivery reservations are not configured."]
    }, { status: 503 });
  }

  const releaseCapacityGroups = async (reason: "CHECKOUT_FAILED" | "PAYMENT_FAILED" | "ABANDONED" | "MANUAL") => {
    if (!capacityClient) return;
    for (const group of capacityGroups) {
      if (!group.orderProCapacityHoldId) continue;
      await capacityClient.release({
        capacityHoldId: group.orderProCapacityHoldId,
        reason,
        idempotencyKey: `capacity-release:${group.orderProCapacityHoldId}:${reason}`,
        correlationId: `capacity-release:${group.orderProCapacityHoldId}`
      }).catch(() => undefined);
    }
  };

  if (shippingGroup?.shipping && shippingClient) {
    const reservation = await shippingClient.create({
      checkoutAttemptId: attempt.attemptId,
      locationId: shippingGroup.locationId,
      items: shippingGroup.items,
      readyToShipDate: shippingGroup.shipping.readyToShipDate,
      destination: { ...parsed.customer, address: shippingGroup.shipping.address },
      rate: {
        rateId: shippingGroup.shipping.rateId,
        amountCents: shippingGroup.shipping.amountCents,
        currency: "USD",
        carrier: shippingGroup.shipping.carrier,
        serviceName: shippingGroup.shipping.serviceName
      },
      idempotencyKey: orderProShippingCommandIdentity("create", attempt.attemptId),
      correlationId: orderProShippingCommandIdentity("create", attempt.attemptId)
    });
    shippingGroup.orderProShippingOrderId = reservation.order.id;
    try {
      await attemptRepository.recordShippingReservation({
        attemptId: attempt.attemptId,
        orderproShippingOrderId: reservation.order.id,
        shippingContext: {
          groupId: shippingGroup.id,
          rateId: shippingGroup.shipping.rateId,
          destinationHash: createHash("sha256").update(JSON.stringify(shippingGroup.shipping.address)).digest("hex")
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

  if (capacityClient) {
    try {
      for (const group of capacityGroups) {
        const checkoutAttemptId = `${attempt.attemptId}:${group.id}`;
        const requestIdentity = {
          checkoutAttemptId,
          idempotencyKey: `split-capacity:${attempt.attemptId}:${group.id}`,
          correlationId: `split-capacity:${attempt.attemptId}:${group.id}`
        };
        const reservation = group.fulfillmentMode === "pickup"
          ? await capacityClient.reservePickup({
              quoteId: requiredValue(group.pickup?.quoteId, "Pickup quote identity is missing."),
              slotId: requiredValue(group.pickup?.slotId, "Pickup slot identity is missing."),
              ...requestIdentity
            })
          : await capacityClient.reserveLocalDelivery({
              quoteId: requiredValue(group.localDelivery?.quoteId, "Local-delivery quote identity is missing."),
              slotId: requiredValue(group.localDelivery?.slotId, "Local-delivery slot identity is missing."),
              ...requestIdentity
            });
        group.orderProCapacityHoldId = reservation.hold.capacityHoldId;
      }
    } catch (error) {
      await releaseCapacityGroups("CHECKOUT_FAILED");
      if (shippingGroup?.orderProShippingOrderId && shippingClient) {
        await shippingClient.release({
          shippingOrderId: shippingGroup.orderProShippingOrderId,
          reason: "CHECKOUT_FAILED",
          idempotencyKey: orderProShippingCommandIdentity("release", attempt.attemptId, "capacity"),
          correlationId: orderProShippingCommandIdentity("release", attempt.attemptId, "capacity")
        }).catch(() => undefined);
      }
      throw error;
    }
  }

  try {
    await attemptRepository.recordSplitCheckoutContext({
      attemptId: attempt.attemptId,
      context: {
        schemaVersion: "storefront.split-checkout.v2",
        customer: parsed.customer,
        groups: verifiedGroups.map(toStoredSplitGroup)
      }
    });
  } catch (error) {
    if (shippingGroup?.orderProShippingOrderId && shippingClient) {
      await shippingClient.release({
        shippingOrderId: shippingGroup.orderProShippingOrderId,
        reason: "CHECKOUT_FAILED",
        idempotencyKey: orderProShippingCommandIdentity("release", attempt.attemptId, "context"),
        correlationId: orderProShippingCommandIdentity("release", attempt.attemptId, "context")
      }).catch(() => undefined);
    }
    await releaseCapacityGroups("CHECKOUT_FAILED");
    throw error;
  }

  const primaryGroup = verifiedGroups.find((group) => group.id === "balloons") ?? verifiedGroups[0];
  if (!primaryGroup) throw new SquareCheckoutUnavailableError("No verified fulfillment group is available.");
  let squareCheckout: Awaited<ReturnType<typeof createSquareHostedCheckout>>;
  try {
    squareCheckout = await createSquareHostedCheckout({
      attemptId: attempt.attemptId,
      idempotencyKey,
      squareLocationId: primaryGroup.squareLocationId,
      customer: parsed.customer,
      quote,
      fulfillmentGroups: verifiedGroups.map((group): SquareHostedFulfillmentGroup => ({
        id: group.id,
        fulfillmentMode: group.fulfillmentMode,
        ...(group.pickup?.timing === "SCHEDULED" ? {
          pickup: {
            timing: "SCHEDULED",
            requestedDate: group.pickup.requestedDate!,
            slotId: group.pickup.slotId!,
            slotLabel: group.pickup.slotLabel!,
            startsAt: group.pickup.startsAt,
            endsAt: group.pickup.endsAt
          }
        } : {}),
        ...(group.localDelivery ? { localDelivery: group.localDelivery } : {}),
        ...(group.shipping ? { shipping: group.shipping } : {}),
        ...(group.orderProShippingOrderId ? { orderProShippingOrderId: group.orderProShippingOrderId } : {})
      }))
    });
  } catch (error) {
    if (shippingGroup?.orderProShippingOrderId && shippingClient) {
      await shippingClient.release({
        shippingOrderId: shippingGroup.orderProShippingOrderId,
        reason: "CHECKOUT_FAILED",
        idempotencyKey: orderProShippingCommandIdentity("release", attempt.attemptId, "square"),
        correlationId: orderProShippingCommandIdentity("release", attempt.attemptId, "square")
      }).catch(() => undefined);
    }
    await releaseCapacityGroups("CHECKOUT_FAILED");
    throw error;
  }

  if (!squareCheckout.squarePaymentLinkId) {
    if (shippingGroup?.orderProShippingOrderId && shippingClient) {
      await shippingClient.release({
        shippingOrderId: shippingGroup.orderProShippingOrderId,
        reason: "CHECKOUT_FAILED",
        idempotencyKey: orderProShippingCommandIdentity("release", attempt.attemptId, "missing-link"),
        correlationId: orderProShippingCommandIdentity("release", attempt.attemptId, "missing-link")
      }).catch(() => undefined);
    }
    await releaseCapacityGroups("CHECKOUT_FAILED");
    throw new SquareCheckoutUnavailableError("Square did not return a manageable checkout link.");
  }

  try {
    await attemptRepository.recordSplitHostedCheckout({
      attemptId: attempt.attemptId,
      squareOrderId: squareCheckout.squareOrderId,
      squarePaymentLinkId: squareCheckout.squarePaymentLinkId,
      checkoutUrl: squareCheckout.checkoutUrl
    });
    if (shippingGroup?.orderProShippingOrderId && shippingClient) {
      await shippingClient.bind({
        shippingOrderId: shippingGroup.orderProShippingOrderId,
        squareOrderId: squareCheckout.squareOrderId,
        squarePaymentLinkId: squareCheckout.squarePaymentLinkId,
        squareLocationId: primaryGroup.squareLocationId,
        idempotencyKey: orderProShippingCommandIdentity("bind", attempt.attemptId),
        correlationId: orderProShippingCommandIdentity("bind", attempt.attemptId)
      });
    }
    if (capacityClient) {
      for (const group of capacityGroups) {
        await capacityClient.bind({
          capacityHoldId: requiredValue(group.orderProCapacityHoldId, "Capacity reservation identity is missing."),
          squareOrderId: squareCheckout.squareOrderId,
          squarePaymentLinkId: squareCheckout.squarePaymentLinkId,
          squareLocationId: primaryGroup.squareLocationId,
          idempotencyKey: `capacity-bind:${requiredValue(group.orderProCapacityHoldId, "Capacity reservation identity is missing.")}`,
          correlationId: `capacity-bind:${requiredValue(group.orderProCapacityHoldId, "Capacity reservation identity is missing.")}`
        });
      }
    }
  } catch (error) {
    let closed = false;
    try {
      await deleteSquareHostedCheckoutLink(squareCheckout.squarePaymentLinkId);
      closed = true;
    } catch {
      // Keep reservations when the live payment link cannot be closed safely.
    }
    if (closed && shippingGroup?.orderProShippingOrderId && shippingClient) {
      await shippingClient.release({
        shippingOrderId: shippingGroup.orderProShippingOrderId,
        reason: "CHECKOUT_FAILED",
        idempotencyKey: orderProShippingCommandIdentity("release", attempt.attemptId, "bind"),
        correlationId: orderProShippingCommandIdentity("release", attempt.attemptId, "bind")
      }).catch(() => undefined);
    }
    if (closed) {
      await releaseCapacityGroups("CHECKOUT_FAILED");
      await attemptRepository.markSplitCheckoutExpired(attempt.attemptId).catch(() => undefined);
    }
    throw error;
  }

  return splitCheckoutSuccessResponse({
    attemptId: attempt.attemptId,
    replayed: attempt.replayed,
    quote,
    checkoutUrl: squareCheckout.checkoutUrl,
    squareOrderId: squareCheckout.squareOrderId,
    squarePaymentLinkId: squareCheckout.squarePaymentLinkId
  });
}

function splitCheckoutSuccessResponse(input: {
  attemptId: string;
  replayed: boolean;
  quote: unknown;
  checkoutUrl: string;
  squareOrderId: string;
  squarePaymentLinkId: string;
}) {
  return NextResponse.json({
    ok: true,
    status: "redirect_to_square",
    checkoutVersion: 2,
    fulfillmentModel: "orderpro_split",
    attemptId: input.attemptId,
    replayed: input.replayed,
    quote: input.quote,
    errors: [],
    checkoutUrl: input.checkoutUrl,
    squareOrderId: input.squareOrderId,
    squarePaymentLinkId: input.squarePaymentLinkId,
    paymentCaptured: false,
    squareOrderCreated: true
  });
}

function toStoredSplitGroup(group: VerifiedSplitGroup) {
  const base = {
    id: group.id,
    fulfillmentMode: group.fulfillmentMode,
    locationId: group.locationId,
    squareLocationId: group.squareLocationId,
    items: group.items
  };
  if (group.fulfillmentMode === "pickup") {
    const pickup = requiredValue(group.pickup, "Pickup selection is missing.");
    return pickup.timing === "ASAP"
      ? { ...base, fulfillmentMode: "pickup" as const, pickup: { timing: "ASAP" as const } }
      : {
          ...base,
          fulfillmentMode: "pickup" as const,
          pickup: {
            timing: "SCHEDULED" as const,
            requestedDate: requiredValue(pickup.requestedDate, "Pickup date is missing."),
            slotId: requiredValue(pickup.slotId, "Pickup slot identity is missing."),
            slotLabel: requiredValue(pickup.slotLabel, "Pickup slot label is missing."),
            startsAt: requiredValue(pickup.startsAt, "Pickup start time is missing."),
            endsAt: requiredValue(pickup.endsAt, "Pickup end time is missing.")
          },
          orderProCapacityHoldId: requiredValue(group.orderProCapacityHoldId, "Pickup reservation identity is missing.")
        };
  }
  if (group.fulfillmentMode === "local-delivery") {
    return {
      ...base,
      fulfillmentMode: "local-delivery" as const,
      localDelivery: requiredValue(group.localDelivery, "Local-delivery selection is missing."),
      orderProCapacityHoldId: requiredValue(group.orderProCapacityHoldId, "Local-delivery reservation identity is missing.")
    };
  }
  return {
    ...base,
    fulfillmentMode: "shipping" as const,
    shipping: requiredValue(group.shipping, "Shipping selection is missing."),
    orderProShippingOrderId: requiredValue(group.orderProShippingOrderId, "Shipping reservation identity is missing.")
  };
}

function requiredValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined || value === "") throw new Error(message);
  return value;
}
