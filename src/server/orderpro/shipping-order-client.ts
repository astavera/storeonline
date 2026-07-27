import "server-only";

import { z } from "zod";

const requestTimeoutMs = 8_000;
const maxResponseBytes = 128 * 1024;

const configurationSchema = z.object({
  ORDERPRO_STOREFRONT_PREVIEW_BASE_URL: z.string().url(),
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

export type OrderProShippingDestination = z.infer<typeof destinationSchema>;
export type OrderProShippingOrder = z.infer<typeof orderSchema>;

type Configuration = {
  baseUrl: string;
  sharedSecret: string;
};

export function getOrderProShippingOrderConfiguration(
  environment: Record<string, string | undefined> = process.env
): Configuration | null {
  const parsed = configurationSchema.safeParse(environment);
  if (!parsed.success) return null;
  const url = new URL(parsed.data.ORDERPRO_STOREFRONT_PREVIEW_BASE_URL);
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
  const fetchImpl = input.fetchImpl ?? fetch;

  async function post<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    headers: Record<string, string> = {}
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(`${input.config.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orderpro-shipping-key": input.config.sharedSecret,
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

  return {
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
      const { idempotencyKey, correlationId, ...body } = input;
      destinationSchema.parse(body.destination);
      return post(
        "/api/internal/storefront/shipping/create",
        body,
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
    }) {
      return post(
        "/api/internal/storefront/shipping/bind",
        input,
        transitionResponseSchema
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
    }) {
      destinationSchema.parse(input.destination);
      return post(
        "/api/internal/storefront/shipping/confirm",
        input,
        transitionResponseSchema
      );
    },
    release(input: {
      shippingOrderId: string;
      reason: "CHECKOUT_FAILED" | "PAYMENT_FAILED" | "ABANDONED" | "MANUAL";
    }) {
      return post(
        "/api/internal/storefront/shipping/release",
        input,
        transitionResponseSchema
      );
    }
  };
}

export function getOrderProShippingOrderClient() {
  const config = getOrderProShippingOrderConfiguration();
  return config ? createOrderProShippingOrderClient({ config }) : null;
}
