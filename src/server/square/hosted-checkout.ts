/**
 * Implements server-side hosted checkout behavior and persistence boundaries.
 */

import "server-only";

import {
  SquareClient,
  SquareEnvironment,
  SquareError
} from "square";
import type * as Square from "square";
import { env } from "@/lib/validation/env";
import type { CartQuote } from "@/server/checkout/cart-service";

type CheckoutCustomer = {
  name: string;
  email: string;
  phone: string;
};

type PickupSelection = {
  requestedDate: string;
  slotId: string;
  slotLabel: string;
};

type LocalDeliverySelection = {
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
};

type ShippingSelection = {
  rateId: string;
  amountCents: number;
  carrier: string;
  serviceName: string;
  readyToShipDate: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: "US";
  };
};

export type SquareHostedCheckoutInput = {
  attemptId: string;
  idempotencyKey: string;
  squareLocationId: string;
  orderProShippingOrderId?: string;
  fulfillmentMode: "pickup" | "local-delivery" | "shipping";
  customer: CheckoutCustomer;
  quote: CartQuote;
  pickup?: PickupSelection;
  localDelivery?: LocalDeliverySelection;
  shipping?: ShippingSelection;
};

export type SquareHostedCheckoutResult = {
  checkoutUrl: string;
  squareOrderId: string;
  squarePaymentLinkId: string | null;
};

export class SquareCheckoutUnavailableError extends Error {
  constructor(message = "Square secure checkout is temporarily unavailable. Please try again.") {
    super(message);
    this.name = "SquareCheckoutUnavailableError";
  }
}

export function isSquareHostedCheckoutEnabled() {
  return env.SQUARE_CHECKOUT_ENABLED === "true" && Boolean(env.SQUARE_ACCESS_TOKEN?.trim());
}

export function buildSquarePaymentLinkRequest(input: SquareHostedCheckoutInput): Square.checkout.paymentLinks.CreatePaymentLinkRequest {
  if (input.quote.lines.length === 0) {
    throw new SquareCheckoutUnavailableError("Your cart has no purchasable items.");
  }
  if (input.fulfillmentMode === "local-delivery" && !input.localDelivery) {
    throw new SquareCheckoutUnavailableError("A verified local delivery quote and time slot are required.");
  }
  if (input.fulfillmentMode === "shipping" && !input.shipping) {
    throw new SquareCheckoutUnavailableError("A verified Shippo shipping rate is required.");
  }
  if (input.fulfillmentMode === "shipping" && !input.orderProShippingOrderId) {
    throw new SquareCheckoutUnavailableError("An OrderPRO shipping reservation is required.");
  }

  const pickupNote = input.pickup
    ? `Requested pickup: ${input.pickup.requestedDate}, ${input.pickup.slotLabel}. Slot: ${input.pickup.slotId}`
    : "Pickup order placed through the Modern State website.";
  const delivery = input.localDelivery;
  const shipping = input.shipping;
  const deliveryNote = delivery
    ? `OrderPRO quote ${delivery.quoteId}. Slot ${delivery.slotId}.`
    : "";

  return {
    idempotencyKey: input.idempotencyKey,
    description: `Modern State website checkout ${input.attemptId}`.slice(0, 255),
    order: {
      locationId: input.squareLocationId,
      referenceId: input.attemptId.slice(0, 40),
      source: { name: "Modern State NYC Website" },
      lineItems: [
        ...input.quote.lines.map((line) => ({
          catalogObjectId: line.squareVariationId,
          quantity: String(line.quantity)
        })),
        ...(delivery ? [{
          name: "Local delivery",
          quantity: "1",
          itemType: "ITEM" as const,
          basePriceMoney: {
            amount: BigInt(delivery.feeCents),
            currency: "USD" as const
          },
          metadata: {
            orderpro_quote_id: delivery.quoteId,
            orderpro_slot_id: delivery.slotId
          }
        }] : [])
      ],
      pricingOptions: {
        autoApplyDiscounts: true,
        autoApplyTaxes: true
      },
      ...(input.fulfillmentMode === "pickup" ? {
        fulfillments: [{
          type: "PICKUP" as const,
          state: "PROPOSED" as const,
          pickupDetails: {
            recipient: {
              displayName: input.customer.name,
              emailAddress: input.customer.email,
              phoneNumber: input.customer.phone
            },
            scheduleType: "ASAP" as const,
            note: pickupNote.slice(0, 500)
          }
        }]
      } : delivery ? {
        fulfillments: [{
          type: "DELIVERY" as const,
          state: "PROPOSED" as const,
          metadata: {
            orderpro_quote_id: delivery.quoteId,
            orderpro_slot_id: delivery.slotId
          },
          deliveryDetails: {
            recipient: {
              displayName: input.customer.name,
              emailAddress: input.customer.email,
              phoneNumber: input.customer.phone,
              address: {
                addressLine1: delivery.address.line1,
                ...(delivery.address.line2 ? { addressLine2: delivery.address.line2 } : {}),
                locality: delivery.address.city,
                administrativeDistrictLevel1: delivery.address.state,
                postalCode: delivery.address.postalCode,
                country: delivery.address.country
              }
            },
            scheduleType: "SCHEDULED" as const,
            deliverAt: delivery.startsAt,
            deliveryWindowDuration: deliveryWindowDuration(delivery.startsAt, delivery.endsAt),
            note: deliveryNote.slice(0, 550)
          }
        }]
      } : shipping ? {
        fulfillments: [{
          type: "SHIPMENT" as const,
          state: "PROPOSED" as const,
          metadata: {
            shippo_rate_id: shipping.rateId,
            orderpro_shipping_order_id: input.orderProShippingOrderId!
          },
          shipmentDetails: {
            recipient: {
              displayName: input.customer.name,
              emailAddress: input.customer.email,
              phoneNumber: input.customer.phone,
              address: {
                addressLine1: shipping.address.line1,
                ...(shipping.address.line2 ? { addressLine2: shipping.address.line2 } : {}),
                locality: shipping.address.city,
                administrativeDistrictLevel1: shipping.address.state,
                postalCode: shipping.address.postalCode,
                country: shipping.address.country
              }
            },
            carrier: shipping.carrier,
            shippingType: shipping.serviceName,
            shippingNote: `Shippo rate ${shipping.rateId}. OrderPRO ready to ship ${shipping.readyToShipDate}.`.slice(0, 500)
          }
        }]
      } : {}),
      metadata: {
        checkout_attempt_id: input.attemptId.slice(0, 255),
        fulfillment_mode: input.fulfillmentMode,
        ...(delivery ? {
          orderpro_quote_id: delivery.quoteId,
          orderpro_slot_id: delivery.slotId
        } : shipping ? {
          shippo_rate_id: shipping.rateId,
          orderpro_ready_to_ship: shipping.readyToShipDate,
          orderpro_shipping_order_id: input.orderProShippingOrderId!
        } : {})
      }
    },
    checkoutOptions: {
      allowTipping: false,
      askForShippingAddress: input.fulfillmentMode === "shipping",
      enableCoupon: true,
      ...(shipping ? {
        shippingFee: {
          name: `${shipping.carrier} ${shipping.serviceName}`.slice(0, 100),
          charge: {
            amount: BigInt(shipping.amountCents),
            currency: "USD" as const
          }
        }
      } : {})
    },
    paymentNote: `Modern State website order - ${input.fulfillmentMode}`
  };
}

export async function createSquareHostedCheckout(input: SquareHostedCheckoutInput): Promise<SquareHostedCheckoutResult> {
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (env.SQUARE_CHECKOUT_ENABLED !== "true" || !accessToken) {
    throw new SquareCheckoutUnavailableError("Square secure checkout is not enabled.");
  }

  const client = new SquareClient({
    token: accessToken,
    environment: env.SQUARE_ENVIRONMENT === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    timeoutInSeconds: 30,
    maxRetries: 2
  });

  try {
    const response = await client.checkout.paymentLinks.create(buildSquarePaymentLinkRequest(input));
    const checkoutUrl = normalizeSquareCheckoutUrl(response.paymentLink?.url);
    const squareOrderId = response.paymentLink?.orderId?.trim();
    if (!checkoutUrl || !squareOrderId) {
      throw new SquareCheckoutUnavailableError();
    }

    return {
      checkoutUrl,
      squareOrderId,
      squarePaymentLinkId: response.paymentLink?.id?.trim() || null
    };
  } catch (error) {
    if (error instanceof SquareCheckoutUnavailableError) throw error;
    if (error instanceof SquareError) {
      console.error(JSON.stringify({
        event: "square_hosted_checkout_rejected",
        statusCode: error.statusCode,
        errors: error.errors?.map((entry) => ({
          category: entry.category,
          code: entry.code,
          field: entry.field ?? null
        })) ?? []
      }));
      throw new SquareCheckoutUnavailableError("Square could not start secure checkout. Please review the order and try again.");
    }
    throw new SquareCheckoutUnavailableError();
  }
}

export async function deleteSquareHostedCheckoutLink(paymentLinkId: string) {
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (env.SQUARE_CHECKOUT_ENABLED !== "true" || !accessToken) {
    throw new SquareCheckoutUnavailableError("Square secure checkout is not enabled.");
  }
  const id = paymentLinkId.trim();
  if (!id) throw new SquareCheckoutUnavailableError("Square payment link is missing.");

  const client = new SquareClient({
    token: accessToken,
    environment: env.SQUARE_ENVIRONMENT === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    timeoutInSeconds: 30,
    maxRetries: 2
  });
  try {
    await client.checkout.paymentLinks.delete({ id });
  } catch (error) {
    if (error instanceof SquareError && error.statusCode === 404) return;
    throw new SquareCheckoutUnavailableError("Square checkout could not be closed safely.");
  }
}

function normalizeSquareCheckoutUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const trustedHost = url.hostname === "square.link" || url.hostname.endsWith(".square.link");
    return url.protocol === "https:" && trustedHost ? url.toString() : null;
  } catch {
    return null;
  }
}

function deliveryWindowDuration(startsAt: string, endsAt: string) {
  const durationMinutes = Math.ceil((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000);
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 24 * 60) {
    throw new SquareCheckoutUnavailableError("The selected delivery time window is invalid.");
  }
  return `PT${durationMinutes}M`;
}
