/**
 * Implements server-side shipping order client behavior and persistence boundaries.
 */

import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { OrderProTokenProvider } from "@/server/orderpro/auth0-token-provider";
import { createAuth0TokenProvider } from "@/server/orderpro/auth0-token-provider";
import { getOrderProM2mConfiguration } from "@/server/orderpro/config";

const requestTimeoutMs = 8_000;
const maxResponseBytes = 128 * 1024;

const configurationSchema = z.object({
  ORDERPRO_STOREFRONT_FULFILLMENT_BASE_URL: z.string().url(),
  ORDERPRO_STOREFRONT_SHIPPING_SHARED_SECRET: z.string().min(32)
});

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().length(2),
  postalCode: z.string().min(5),
  country: z.literal("US")
});

const destinationSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  address: addressSchema
});

const orderSchema = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "PENDING_PAYMENT",
    "PAID",
    "TRANSFER_REQUESTED",
    "READY_TO_PACK",
    "SHIPPED",
    "EXPIRED",
    "CANCELLED",
    "EXCEPTION"
  ]),
  checkoutAttemptId: z.string().min(1),
  sourceLocationId: z.string().min(1),
  consolidationLocationId: z.string().min(1),
  policyVersion: z.string().min(1),
  readyToShipDate: z.string().date(),
  expiresAt: z.string().datetime(),
  squareOrderId: z.string().nullable(),
  squarePaymentLinkId: z.string().nullable(),
  squarePaymentId: z.string().nullable(),
  lines: z.array(z.object({
    squareVariationId: z.string().min(1),
    quantity: z.number().positive(),
    physicalLocationId: z.string().min(1),
    pickLocation: z.string().min(1),
    warehouseBoxId: z.string().nullable(),
    requiresTransfer: z.boolean()
  })),
  transferTask: z.object({
    id: z.string().uuid(),
    status: z.enum(["REQUESTED", "IN_TRANSIT", "RECEIVED", "READY", "CANCELLED", "FAILED"]),
    sourceLocationId: z.string().min(1),
    destinationLocationId: z.string().min(1),
    dueAt: z.string().datetime(),
    labelPurchaseMode: z.string().min(1)
  }).nullable()
});

const createResponseSchema = z.object({
  ok: z.literal(true),
  replayed: z.boolean(),
  order: orderSchema
});

const transitionResponseSchema = z.object({
  ok: z.literal(true),
  changed: z.boolean(),
  order: orderSchema
});

const allocationResponseSchema = z.discriminatedUnion("available", [
  z.object({
    ok: z.literal(true),
    available: z.literal(false),
    reasonCode: z.string().min(1),
    policyVersion: z.string().min(1).optional()
  }),
  z.object({
    ok: z.literal(true),
    available: z.literal(true),
    policyVersion: z.string().min(1),
    sellingLocationId: z.string().min(1),
    fulfillmentNodeId: z.string().min(1),
    requiresStoreTransfer: z.boolean(),
    transferLeadTimeDays: z.union([z.literal(0), z.literal(2)]),
    readyToShipDate: z.string().date(),
    items: z.array(z.object({
      squareVariationId: z.string().min(1),
      quantity: z.number().int().positive(),
      ownerLocationId: z.string().min(1),
      physicalLocationId: z.string().min(1),
      pickLocation: z.string().min(1),
      requiresTransfer: z.boolean()
    }))
  })
]);

function canonicalShippingItems(items: Array<{ squareVariationId: string; quantity: number }>) {
  return items.map(({ squareVariationId, quantity }) => ({ squareVariationId, quantity }));
}

export type OrderProShippingDestination = z.infer<typeof destinationSchema>;
export type OrderProShippingOrder = z.infer<typeof orderSchema>;

type Configuration = {
  baseUrl: string;
  sharedSecret?: string;
  tokenProvider?: OrderProTokenProvider;
};

export function orderProShippingCommandIdentity(
  action: "quote" | "create" | "bind" | "confirm" | "release",
  ...parts: readonly string[]
) {
  const digest = createHash("sha256")
    .update(JSON.stringify([action, ...parts]))
    .digest("hex");
  return `shipping-${action}:v1:${digest}`;
}

export function getOrderProShippingOrderConfiguration(
  environment: Record<string, string | undefined> = process.env
): Configuration | null {
  if (environment.ORDERPRO_INTEGRATION_ENVIRONMENT?.trim() === "PRODUCTION") {
    return null;
  }
  const parsed = configurationSchema.safeParse(environment);
  if (!parsed.success) return null;
  const url = new URL(parsed.data.ORDERPRO_STOREFRONT_FULFILLMENT_BASE_URL);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  return {
    baseUrl: url.origin,
    sharedSecret: parsed.data.ORDERPRO_STOREFRONT_SHIPPING_SHARED_SECRET
  };
}

export function createOrderProShippingOrderClient(input: {
  config: Configuration;
  fetchImpl?: typeof fetch;
}) {
  if (Boolean(input.config.sharedSecret) === Boolean(input.config.tokenProvider)) {
    throw new Error("ORDERPRO_SHIPPING_AUTH_CONFIGURATION_INVALID");
  }
  const fetchImpl = input.fetchImpl ?? fetch;

  async function post<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    headers: Record<string, string> = {}
  ) {
    async function attempt(retryAuthentication: boolean): Promise<T> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const accessToken = input.config.tokenProvider
          ? await input.config.tokenProvider.getAccessToken()
          : null;
        const response = await fetchImpl(`${input.config.baseUrl}${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(accessToken
              ? { authorization: `Bearer ${accessToken}` }
              : { "x-orderpro-shipping-key": input.config.sharedSecret! }),
            ...headers
          },
          body: JSON.stringify(body),
          cache: "no-store",
          redirect: "error",
          signal: controller.signal
        });
        const declaredLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
          throw new Error("ORDERPRO_SHIPPING_RESPONSE_TOO_LARGE");
        }
        const raw = await response.text();
        if (new TextEncoder().encode(raw).byteLength > maxResponseBytes) {
          throw new Error("ORDERPRO_SHIPPING_RESPONSE_TOO_LARGE");
        }
        if (!response.ok) {
          if (response.status === 401 && input.config.tokenProvider && retryAuthentication) {
            input.config.tokenProvider.invalidate();
            return attempt(false);
          }
          let code = `ORDERPRO_SHIPPING_HTTP_${response.status}`;
          try {
            const parsed = JSON.parse(raw) as { code?: unknown };
            if (typeof parsed.code === "string" && /^[A-Z0-9_]+$/.test(parsed.code)) code = parsed.code;
          } catch {
            // The HTTP status remains the safe error contract.
          }
          throw new Error(code);
        }
        return schema.parse(JSON.parse(raw));
      } finally {
        clearTimeout(timeout);
      }
    }
    return attempt(true);
  }

  return {
    quote(input: {
      locationId: string;
      items: Array<{ squareVariationId: string; quantity: number }>;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const { idempotencyKey, correlationId } = input;
      return post(
        "/api/internal/storefront/shipping/quote",
        {
          locationId: input.locationId,
          items: canonicalShippingItems(input.items)
        },
        allocationResponseSchema,
        {
          "idempotency-key": idempotencyKey,
          "x-correlation-id": correlationId
        }
      );
    },
    create(input: {
      checkoutAttemptId: string;
      locationId: string;
      items: Array<{ squareVariationId: string; quantity: number }>;
      readyToShipDate: string;
      destination: OrderProShippingDestination;
      rate: {
        rateId: string;
        amountCents: number;
        currency: "USD";
        carrier: string;
        serviceName: string;
      };
      idempotencyKey: string;
      correlationId: string;
    }) {
      const { idempotencyKey, correlationId } = input;
      destinationSchema.parse(input.destination);
      return post(
        "/api/internal/storefront/shipping/create",
        {
          checkoutAttemptId: input.checkoutAttemptId,
          locationId: input.locationId,
          items: canonicalShippingItems(input.items),
          readyToShipDate: input.readyToShipDate,
          destination: input.destination,
          rate: input.rate
        },
        createResponseSchema,
        {
          "idempotency-key": idempotencyKey,
          "x-correlation-id": correlationId
        }
      );
    },
    bind(input: {
      shippingOrderId: string;
      squareOrderId: string;
      squarePaymentLinkId: string;
      squareLocationId: string;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const { idempotencyKey, correlationId, ...body } = input;
      return post(
        "/api/internal/storefront/shipping/bind",
        body,
        transitionResponseSchema,
        { "idempotency-key": idempotencyKey, "x-correlation-id": correlationId }
      );
    },
    confirm(input: {
      shippingOrderId: string;
      squareOrderId: string;
      squarePaymentId: string;
      squareLocationId: string;
      amountPaidCents: number;
      currency: "USD";
      paidAt: string;
      destination: OrderProShippingDestination;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const { idempotencyKey, correlationId, ...body } = input;
      destinationSchema.parse(body.destination);
      return post(
        "/api/internal/storefront/shipping/confirm",
        body,
        transitionResponseSchema,
        { "idempotency-key": idempotencyKey, "x-correlation-id": correlationId }
      );
    },
    release(input: {
      shippingOrderId: string;
      reason: "CHECKOUT_FAILED" | "PAYMENT_FAILED" | "ABANDONED" | "MANUAL";
      idempotencyKey: string;
      correlationId: string;
    }) {
      const { idempotencyKey, correlationId, ...body } = input;
      return post(
        "/api/internal/storefront/shipping/release",
        body,
        transitionResponseSchema,
        { "idempotency-key": idempotencyKey, "x-correlation-id": correlationId }
      );
    }
  };
}

export function getOrderProShippingOrderClient() {
  const m2m = getOrderProM2mConfiguration();
  if (
    m2m.enabled &&
    m2m.config.environment === "PRODUCTION" &&
    m2m.config.auth0.scopes.includes("shipping:quote") &&
    m2m.config.auth0.scopes.includes("shipping:reserve") &&
    m2m.config.auth0.scopes.includes("shipping:settle")
  ) {
    return createOrderProShippingOrderClient({
      config: {
        baseUrl: m2m.config.api.baseUrl,
        tokenProvider: createAuth0TokenProvider({ config: m2m.config.auth0 })
      }
    });
  }
  const config = getOrderProShippingOrderConfiguration();
  return config ? createOrderProShippingOrderClient({ config }) : null;
}
