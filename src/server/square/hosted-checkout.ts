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

export type SquareTaxApplicationMode =
  | "SQUARE_CATALOG_AUTO"
  | "EXPLICIT_DESTINATION_TAX";

export type SquareExplicitShippingTaxBreakdown = {
  /** Stable, non-PII identifier persisted with the tax quote. */
  taxQuoteId: string;
  /** Customer-facing label used for the explicit Square tax objects. */
  taxName: string;
  /** Every merchandise line must appear exactly once, including exempt lines. */
  merchandiseLines: Array<{
    squareVariationId: string;
    /** Tax rate as parts per million of 1.0; 88,750 means 8.875%. */
    ratePpm: number;
    taxCents: number;
  }>;
  shipping: {
    /** Tax rate as parts per million of 1.0; 88,750 means 8.875%. */
    ratePpm: number;
    taxCents: number;
  };
  totalTaxCents: number;
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
  /** Defaults to the existing Square catalog behavior for backward compatibility. */
  taxApplicationMode?: SquareTaxApplicationMode;
  /** Required only for explicit destination tax on SHIPPING orders. */
  explicitTaxBreakdown?: SquareExplicitShippingTaxBreakdown;
};

export type SquareHostedCheckoutResult = {
  checkoutUrl: string;
  squareOrderId: string;
  squarePaymentLinkId: string | null;
};

export type SquareHostedCheckoutOrderPreview = {
  order: Square.Order;
  merchandiseSubtotalCents: number;
  shippingCents: number;
  merchandiseTaxCents: number;
  shippingTaxCents: number;
  totalTaxCents: number;
  totalCents: number;
};

export type SquareCalculateOrder = (
  request: Square.CalculateOrderRequest
) => Promise<Square.CalculateOrderResponse>;

export class SquareCheckoutUnavailableError extends Error {
  constructor(message = "Square secure checkout is temporarily unavailable. Please try again.") {
    super(message);
    this.name = "SquareCheckoutUnavailableError";
  }
}

export class SquareCheckoutParityError extends SquareCheckoutUnavailableError {
  constructor(message = "Square could not reproduce the verified checkout totals.") {
    super(message);
    this.name = "SquareCheckoutParityError";
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

  const taxApplicationMode = input.taxApplicationMode ?? "SQUARE_CATALOG_AUTO";
  const explicitTax = resolveExplicitShippingTax(input, taxApplicationMode);

  const pickupNote = input.pickup
    ? `Requested pickup: ${input.pickup.requestedDate}, ${input.pickup.slotLabel}. Slot: ${input.pickup.slotId}`
    : "Pickup order placed through the Modern State website.";
  const delivery = input.localDelivery;
  const shipping = input.shipping;
  const deliveryNote = delivery
    ? `OrderPRO quote ${delivery.quoteId}. Slot ${delivery.slotId}.`
    : "";

  const merchandiseLineItems: Square.OrderLineItem[] = input.quote.lines.map((line, index) => {
    const explicitLine = explicitTax?.merchandiseByVariationId.get(line.squareVariationId);
    const taxUid = explicitLine && explicitLine.ratePpm > 0
      ? merchandiseTaxUid(index)
      : null;

    return {
      ...(explicitTax ? { uid: merchandiseLineUid(index) } : {}),
      catalogObjectId: line.squareVariationId,
      quantity: String(line.quantity),
      ...(taxUid ? { appliedTaxes: [{ taxUid }] } : {})
    };
  });

  const explicitTaxes: Square.OrderLineItemTax[] = explicitTax
    ? [
        ...input.quote.lines.flatMap((line, index) => {
          const lineTax = explicitTax.merchandiseByVariationId.get(line.squareVariationId)!;
          return lineTax.ratePpm > 0 ? [{
            uid: merchandiseTaxUid(index),
            name: explicitTax.breakdown.taxName,
            type: "ADDITIVE" as const,
            percentage: ratePpmToSquarePercentage(lineTax.ratePpm),
            scope: "LINE_ITEM" as const,
            metadata: {
              tax_quote_id: explicitTax.breakdown.taxQuoteId,
              tax_component: "merchandise"
            }
          }] : [];
        }),
        ...(explicitTax.breakdown.shipping.ratePpm > 0 ? [{
          uid: SHIPPING_TAX_UID,
          name: explicitTax.breakdown.taxName,
          type: "ADDITIVE" as const,
          percentage: ratePpmToSquarePercentage(explicitTax.breakdown.shipping.ratePpm),
          scope: "LINE_ITEM" as const,
          metadata: {
            tax_quote_id: explicitTax.breakdown.taxQuoteId,
            tax_component: "shipping"
          }
        }] : [])
      ]
    : [];

  const explicitShippingServiceCharge: Square.OrderServiceCharge | null = explicitTax && shipping
    ? {
        uid: SHIPPING_SERVICE_CHARGE_UID,
        name: `${shipping.carrier} ${shipping.serviceName}`.slice(0, 100),
        amountMoney: {
          amount: BigInt(shipping.amountCents),
          currency: "USD"
        },
        calculationPhase: "SUBTOTAL_PHASE",
        taxable: explicitTax.breakdown.shipping.ratePpm > 0,
        ...(explicitTax.breakdown.shipping.ratePpm > 0
          ? { appliedTaxes: [{ taxUid: SHIPPING_TAX_UID }] }
          : {}),
        metadata: {
          tax_quote_id: explicitTax.breakdown.taxQuoteId,
          tax_component: "shipping",
          shippo_rate_id: shipping.rateId
        }
      }
    : null;

  return {
    idempotencyKey: input.idempotencyKey,
    description: `Modern State website checkout ${input.attemptId}`.slice(0, 255),
    order: {
      locationId: input.squareLocationId,
      referenceId: input.attemptId.slice(0, 40),
      source: { name: "Modern State NYC Website" },
      lineItems: [
        ...merchandiseLineItems,
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
        autoApplyDiscounts: !explicitTax,
        autoApplyTaxes: !explicitTax
      },
      ...(explicitTaxes.length > 0 ? { taxes: explicitTaxes } : {}),
      ...(explicitShippingServiceCharge ? { serviceCharges: [explicitShippingServiceCharge] } : {}),
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
        tax_application_mode: taxApplicationMode,
        ...(explicitTax ? { tax_quote_id: explicitTax.breakdown.taxQuoteId } : {}),
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
      enableCoupon: !explicitTax,
      ...(shipping && !explicitTax ? {
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

/**
 * Uses CalculateOrder to prove that Square can reproduce a verified explicit
 * SHIPPING quote without persisting an Order. The API call remains fail-closed
 * behind the existing checkout and shipping feature flags. Tests can inject a
 * calculator, but the feature/configuration checks are never bypassed.
 */
export async function calculateSquareHostedCheckoutOrderPreview(
  input: SquareHostedCheckoutInput,
  calculateOrder?: SquareCalculateOrder
): Promise<SquareHostedCheckoutOrderPreview> {
  const accessToken = assertSquareShippingPreviewEnabled(input);
  const request = buildSquarePaymentLinkRequest(input);
  const order = request.order;
  if (!order) throw new SquareCheckoutParityError("Square checkout order is missing.");

  const client = calculateOrder ? null : createSquareClient(accessToken);
  const calculator = calculateOrder ?? client!.orders.calculate.bind(client!.orders);

  return calculateAndAssertSquareOrderParity(input, order, calculator);
}

export async function createSquareHostedCheckout(input: SquareHostedCheckoutInput): Promise<SquareHostedCheckoutResult> {
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (env.SQUARE_CHECKOUT_ENABLED !== "true" || !accessToken) {
    throw new SquareCheckoutUnavailableError("Square secure checkout is not enabled.");
  }

  const client = createSquareClient(accessToken);

  try {
    const request = buildSquarePaymentLinkRequest(input);
    if ((input.taxApplicationMode ?? "SQUARE_CATALOG_AUTO") === "EXPLICIT_DESTINATION_TAX") {
      if (input.fulfillmentMode !== "shipping" || env.ORDERPRO_SHIPPING_CHECKOUT_ENABLED !== "true") {
        throw new SquareCheckoutUnavailableError("Explicit shipping tax checkout is not enabled.");
      }
      if (!request.order) throw new SquareCheckoutParityError("Square checkout order is missing.");
      await calculateAndAssertSquareOrderParity(
        input,
        request.order,
        client.orders.calculate.bind(client.orders)
      );
    }

    const response = await client.checkout.paymentLinks.create(request);
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

type ResolvedExplicitShippingTax = {
  breakdown: SquareExplicitShippingTaxBreakdown;
  merchandiseByVariationId: Map<string, SquareExplicitShippingTaxBreakdown["merchandiseLines"][number]>;
};

const SHIPPING_SERVICE_CHARGE_UID = "verified-shipping-service-charge";
const SHIPPING_TAX_UID = "destination-shipping-tax";

function resolveExplicitShippingTax(
  input: SquareHostedCheckoutInput,
  mode: SquareTaxApplicationMode
): ResolvedExplicitShippingTax | null {
  if (mode === "SQUARE_CATALOG_AUTO") {
    if (input.explicitTaxBreakdown) {
      throw new SquareCheckoutUnavailableError("Explicit tax cannot be combined with Square automatic tax.");
    }
    return null;
  }

  if (mode !== "EXPLICIT_DESTINATION_TAX") {
    throw new SquareCheckoutUnavailableError("The tax application mode is invalid.");
  }
  if (input.fulfillmentMode !== "shipping" || !input.shipping) {
    throw new SquareCheckoutUnavailableError("Explicit destination tax is supported only for verified SHIPPING orders.");
  }

  const breakdown = input.explicitTaxBreakdown;
  if (!breakdown) {
    throw new SquareCheckoutUnavailableError("A verified explicit shipping tax breakdown is required.");
  }
  const taxQuoteId = breakdown.taxQuoteId.trim();
  const taxName = breakdown.taxName.trim();
  if (!taxQuoteId || taxQuoteId.length > 255 || !taxName || taxName.length > 255) {
    throw new SquareCheckoutUnavailableError("The explicit shipping tax identity is invalid.");
  }
  assertMoneyCents(breakdown.totalTaxCents, "total tax");
  assertMoneyCents(breakdown.shipping.taxCents, "shipping tax");
  assertRatePpm(breakdown.shipping.ratePpm, "shipping tax rate");
  if (breakdown.shipping.ratePpm === 0 && breakdown.shipping.taxCents !== 0) {
    throw new SquareCheckoutUnavailableError("A zero shipping tax rate cannot collect shipping tax.");
  }

  const quoteVariationIds = new Set(input.quote.lines.map((line) => line.squareVariationId));
  if (quoteVariationIds.size !== input.quote.lines.length) {
    throw new SquareCheckoutUnavailableError("Explicit tax requires unique Square variation lines.");
  }
  const merchandiseByVariationId = new Map<
    string,
    SquareExplicitShippingTaxBreakdown["merchandiseLines"][number]
  >();
  let merchandiseTaxCents = 0;
  for (const line of breakdown.merchandiseLines) {
    const variationId = line.squareVariationId.trim();
    if (!variationId || !quoteVariationIds.has(variationId) || merchandiseByVariationId.has(variationId)) {
      throw new SquareCheckoutUnavailableError("The explicit merchandise tax lines do not match the verified cart.");
    }
    assertMoneyCents(line.taxCents, "merchandise tax");
    assertRatePpm(line.ratePpm, "merchandise tax rate");
    if (line.ratePpm === 0 && line.taxCents !== 0) {
      throw new SquareCheckoutUnavailableError("A zero merchandise tax rate cannot collect merchandise tax.");
    }
    merchandiseTaxCents = safeAddCents(merchandiseTaxCents, line.taxCents, "merchandise tax");
    merchandiseByVariationId.set(variationId, { ...line, squareVariationId: variationId });
  }
  if (merchandiseByVariationId.size !== quoteVariationIds.size) {
    throw new SquareCheckoutUnavailableError("Every verified cart line requires an explicit tax decision.");
  }

  const expectedTotalTaxCents = safeAddCents(
    merchandiseTaxCents,
    breakdown.shipping.taxCents,
    "total tax"
  );
  if (expectedTotalTaxCents !== breakdown.totalTaxCents) {
    throw new SquareCheckoutUnavailableError("The explicit tax breakdown does not reconcile.");
  }

  return {
    breakdown: { ...breakdown, taxQuoteId, taxName },
    merchandiseByVariationId
  };
}

async function calculateAndAssertSquareOrderParity(
  input: SquareHostedCheckoutInput,
  order: Square.Order,
  calculateOrder: SquareCalculateOrder
): Promise<SquareHostedCheckoutOrderPreview> {
  const explicitTax = resolveExplicitShippingTax(input, input.taxApplicationMode ?? "SQUARE_CATALOG_AUTO");
  if (!explicitTax || !input.shipping) {
    throw new SquareCheckoutParityError("CalculateOrder parity is available only for explicit SHIPPING tax.");
  }

  let response: Square.CalculateOrderResponse;
  try {
    response = await calculateOrder({ order });
  } catch (error) {
    if (error instanceof SquareCheckoutUnavailableError) throw error;
    if (error instanceof SquareError) {
      console.error(JSON.stringify({
        event: "square_calculate_order_rejected",
        statusCode: error.statusCode,
        errors: error.errors?.map((entry) => ({
          category: entry.category,
          code: entry.code,
          field: entry.field ?? null
        })) ?? []
      }));
    }
    throw new SquareCheckoutUnavailableError("Square could not verify the checkout totals.");
  }

  const calculatedOrder = response.order;
  if (!calculatedOrder || (response.errors?.length ?? 0) > 0) {
    throw new SquareCheckoutUnavailableError("Square could not verify the checkout totals.");
  }

  const calculatedLines = new Map(
    (calculatedOrder.lineItems ?? []).map((line) => [line.uid, line] as const)
  );
  let merchandiseSubtotalCents = 0;
  let merchandiseTaxCents = 0;
  input.quote.lines.forEach((quoteLine, index) => {
    const calculatedLine = calculatedLines.get(merchandiseLineUid(index));
    if (!calculatedLine) {
      throw new SquareCheckoutParityError("Square omitted a verified merchandise line.");
    }
    const grossCents = readRequiredUsdCents(calculatedLine.grossSalesMoney, "merchandise gross sales");
    const taxCents = readOptionalUsdCents(calculatedLine.totalTaxMoney, "merchandise tax");
    const expectedLineTax = explicitTax.merchandiseByVariationId.get(quoteLine.squareVariationId)!.taxCents;
    if (grossCents !== quoteLine.lineTotalCents || taxCents !== expectedLineTax) {
      throw new SquareCheckoutParityError("Square merchandise pricing or tax differs from the verified quote.");
    }
    merchandiseSubtotalCents = safeAddCents(merchandiseSubtotalCents, grossCents, "merchandise subtotal");
    merchandiseTaxCents = safeAddCents(merchandiseTaxCents, taxCents, "merchandise tax");
  });

  const shippingServiceCharge = (calculatedOrder.serviceCharges ?? []).find(
    (serviceCharge) => serviceCharge.uid === SHIPPING_SERVICE_CHARGE_UID
  );
  if (!shippingServiceCharge) {
    throw new SquareCheckoutParityError("Square omitted the verified shipping service charge.");
  }
  const shippingCents = readRequiredUsdCents(shippingServiceCharge.appliedMoney, "shipping service charge");
  const shippingTaxCents = readOptionalUsdCents(shippingServiceCharge.totalTaxMoney, "shipping tax");
  const totalTaxCents = readOptionalUsdCents(calculatedOrder.totalTaxMoney, "total tax");
  const totalDiscountCents = readOptionalUsdCents(calculatedOrder.totalDiscountMoney, "total discount");
  const totalCents = readRequiredUsdCents(calculatedOrder.totalMoney, "order total");
  const expectedTotalCents = safeAddCents(
    safeAddCents(input.quote.subtotalCents, input.shipping.amountCents, "order subtotal"),
    explicitTax.breakdown.totalTaxCents,
    "order total"
  );

  if (
    merchandiseSubtotalCents !== input.quote.subtotalCents
    || shippingCents !== input.shipping.amountCents
    || merchandiseTaxCents !== explicitTax.breakdown.totalTaxCents - explicitTax.breakdown.shipping.taxCents
    || shippingTaxCents !== explicitTax.breakdown.shipping.taxCents
    || totalTaxCents !== explicitTax.breakdown.totalTaxCents
    || totalDiscountCents !== 0
    || totalCents !== expectedTotalCents
  ) {
    throw new SquareCheckoutParityError();
  }

  const expectedTaxUids = new Set((order.taxes ?? []).map((tax) => tax.uid));
  const calculatedTaxes = calculatedOrder.taxes ?? [];
  if (
    calculatedTaxes.length !== expectedTaxUids.size
    || calculatedTaxes.some((tax) => !tax.uid || !expectedTaxUids.has(tax.uid) || tax.autoApplied === true)
  ) {
    throw new SquareCheckoutParityError("Square applied an unexpected tax.");
  }

  return {
    order: calculatedOrder,
    merchandiseSubtotalCents,
    shippingCents,
    merchandiseTaxCents,
    shippingTaxCents,
    totalTaxCents,
    totalCents
  };
}

function assertSquareShippingPreviewEnabled(input: SquareHostedCheckoutInput) {
  const accessToken = env.SQUARE_ACCESS_TOKEN?.trim();
  if (
    env.SQUARE_CHECKOUT_ENABLED !== "true"
    || env.ORDERPRO_SHIPPING_CHECKOUT_ENABLED !== "true"
    || !accessToken
    || input.fulfillmentMode !== "shipping"
    || (input.taxApplicationMode ?? "SQUARE_CATALOG_AUTO") !== "EXPLICIT_DESTINATION_TAX"
  ) {
    throw new SquareCheckoutUnavailableError("Explicit shipping tax preview is not enabled.");
  }
  return accessToken;
}

function createSquareClient(accessToken: string) {
  return new SquareClient({
    token: accessToken,
    environment: env.SQUARE_ENVIRONMENT === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    timeoutInSeconds: 30,
    maxRetries: 2
  });
}

function merchandiseLineUid(index: number) {
  return `verified-merchandise-${index + 1}`;
}

function merchandiseTaxUid(index: number) {
  return `destination-merchandise-tax-${index + 1}`;
}

function ratePpmToSquarePercentage(ratePpm: number) {
  assertRatePpm(ratePpm, "tax rate");
  const wholePercent = Math.floor(ratePpm / 10_000);
  const fractionalPercent = String(ratePpm % 10_000).padStart(4, "0").replace(/0+$/, "");
  return fractionalPercent ? `${wholePercent}.${fractionalPercent}` : String(wholePercent);
}

function assertRatePpm(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new SquareCheckoutUnavailableError(`The ${label} is invalid.`);
  }
}

function assertMoneyCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SquareCheckoutUnavailableError(`The ${label} is invalid.`);
  }
}

function safeAddCents(left: number, right: number, label: string) {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new SquareCheckoutUnavailableError(`The ${label} is invalid.`);
  }
  return total;
}

function readRequiredUsdCents(value: Square.Money | undefined, label: string) {
  if (!value || value.currency !== "USD" || value.amount == null) {
    throw new SquareCheckoutParityError(`Square ${label} is missing or not USD.`);
  }
  return bigintToSafeCents(value.amount, label);
}

function readOptionalUsdCents(value: Square.Money | undefined, label: string) {
  if (!value) return 0;
  if (value.currency !== "USD" || value.amount == null) {
    throw new SquareCheckoutParityError(`Square ${label} is not USD.`);
  }
  return bigintToSafeCents(value.amount, label);
}

function bigintToSafeCents(value: bigint, label: string) {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new SquareCheckoutParityError(`Square ${label} is invalid.`);
  }
  return cents;
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
