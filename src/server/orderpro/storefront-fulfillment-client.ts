/** Private M2M client for OrderPRO's reservable Storefront fulfillment API. */

import "server-only";

import { z } from "zod";
import { createAuth0TokenProvider, type OrderProTokenProvider } from "@/server/orderpro/auth0-token-provider";

const requestTimeoutMs = 8_000;
const maxResponseBytes = 128 * 1024;
const requiredScopes = [
  "local-delivery:quote",
  "local-delivery:reserve",
  "local-delivery:settle",
  "pickup:quote",
  "pickup:reserve",
  "pickup:settle"
] as const;

const baseConfigurationSchema = z.object({
  ORDERPRO_STOREFRONT_FULFILLMENT_BASE_URL: z.string().url(),
  ORDERPRO_STOREFRONT_FULFILLMENT_AUTH_MODE: z.enum(["AUTH0", "SHARED_SECRET"])
});

const auth0ConfigurationSchema = baseConfigurationSchema.extend({
  ORDERPRO_STOREFRONT_FULFILLMENT_AUTH_MODE: z.literal("AUTH0"),
  ORDERPRO_AUTH0_ISSUER: z.string().url(),
  ORDERPRO_AUTH0_AUDIENCE: z.string().trim().min(1),
  ORDERPRO_AUTH0_CLIENT_ID: z.string().trim().min(1),
  ORDERPRO_AUTH0_CLIENT_SECRET: z.string().trim().min(1),
  ORDERPRO_STOREFRONT_FULFILLMENT_AUTH0_SCOPES: z.string().trim().min(1)
});

const sharedSecretConfigurationSchema = baseConfigurationSchema.extend({
  ORDERPRO_STOREFRONT_FULFILLMENT_AUTH_MODE: z.literal("SHARED_SECRET"),
  ORDERPRO_STOREFRONT_PICKUP_QUOTE_SHARED_SECRET: z.string().min(32),
  ORDERPRO_STOREFRONT_PICKUP_RESERVATION_SHARED_SECRET: z.string().min(32),
  ORDERPRO_STOREFRONT_DURABLE_QUOTE_SHARED_SECRET: z.string().min(32),
  ORDERPRO_STOREFRONT_WALKING_RESERVATION_SHARED_SECRET: z.string().min(32),
  ORDERPRO_STOREFRONT_CAPACITY_CHECKOUT_SHARED_SECRET: z.string().min(32)
});

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().nullable().optional(),
  city: z.string().min(1),
  state: z.literal("NY"),
  postalCode: z.string().regex(/^\d{5}(?:-\d{4})?$/),
  country: z.literal("US")
}).strict();

const normalizedAddressSchema = addressSchema.extend({
  borough: z.literal("Manhattan")
}).strict();

type CartLine = {
  squareVariationId: string;
  quantity: number;
};

const slotSchema = z.object({
  slotId: z.string().min(1).max(160),
  slotClass: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  capacityOrders: z.number().int().nonnegative().nullable(),
  remainingOrders: z.number().int().nonnegative().nullable(),
  pickupUntilAt: z.string().datetime({ offset: true }).nullable()
}).strict();

const pickupQuoteSchema = z.object({
  ok: z.literal(true),
  quoteId: z.string().uuid(),
  quoteClientId: z.string().min(1),
  replayed: z.boolean(),
  mode: z.literal("PICKUP"),
  eligible: z.literal(true),
  bookable: z.literal(true),
  reservationCapability: z.literal("HOLD_READY"),
  locationId: z.enum(["third_avenue", "east_86th_street"]),
  requestedDate: z.string().date(),
  requiredCapacityOrders: z.literal(1),
  holdTtlSeconds: z.number().int().positive(),
  availableSlots: z.array(slotSchema),
  expiresAt: z.string().datetime({ offset: true }),
  correlationId: z.string().min(1)
}).strict();

const localDeliveryQuoteSchema = z.discriminatedUnion("eligible", [
  z.object({
    ok: z.literal(true),
    quoteId: z.string().uuid(),
    quoteClientId: z.string().min(1),
    replayed: z.boolean(),
    eligible: z.literal(false),
    bookable: z.literal(false),
    reservationCapability: z.literal("NOT_RESERVABLE"),
    reasonCode: z.string().min(1),
    storefrontMessage: z.string().min(1),
    normalizedAddress: normalizedAddressSchema,
    postalCode: z.string().min(1),
    expiresAt: z.string().datetime({ offset: true }),
    correlationId: z.string().min(1)
  }).strict(),
  z.object({
    ok: z.literal(true),
    quoteId: z.string().uuid(),
    quoteClientId: z.string().min(1),
    replayed: z.boolean(),
    eligible: z.literal(true),
    bookable: z.boolean(),
    reservationCapability: z.enum(["HOLD_READY", "NOT_RESERVABLE"]),
    reasonCode: z.string().min(1),
    normalizedAddress: normalizedAddressSchema,
    postalCode: z.string().min(1),
    selectedLocationId: z.enum(["third_avenue", "east_86th_street"]),
    selectedLocationName: z.string().min(1),
    assignmentRule: z.enum(["FIXED_POSTAL_ZONE", "NEAREST_WALKING_ROUTE"]),
    walkingDistanceFeet: z.number().int().nonnegative(),
    walkingDurationSeconds: z.number().int().nonnegative(),
    estimatedRoundTripDurationSeconds: z.number().int().nonnegative(),
    feeCents: z.number().int().nonnegative(),
    currency: z.literal("USD"),
    feeTierId: z.string().min(1),
    availableSlots: z.array(slotSchema),
    zoneVersionId: z.string().min(1),
    feePolicyVersionId: z.string().min(1),
    routingProvider: z.string().min(1),
    expiresAt: z.string().datetime({ offset: true }),
    correlationId: z.string().min(1)
  }).strict()
]);

const holdSchema = z.object({
  capacityHoldId: z.string().uuid(),
  quoteId: z.string().uuid(),
  slotId: z.string().min(1),
  locationId: z.string().min(1),
  clientId: z.string().min(1),
  correlationId: z.string().min(1),
  inventoryReservationId: z.string().uuid(),
  capacitySeconds: z.number().int().positive(),
  status: z.enum(["HELD", "CONFIRMED", "RELEASED", "EXPIRED"]),
  createdAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  confirmedOrderId: z.string().nullable(),
  confirmedAt: z.string().datetime({ offset: true }).nullable(),
  releasedAt: z.string().datetime({ offset: true }).nullable(),
  releaseReason: z.enum([
    "QUOTE_EXPIRED",
    "ORDER_CANCELLED",
    "PAYMENT_FAILED",
    "INVENTORY_UNAVAILABLE",
    "CAPACITY_UNAVAILABLE",
    "MANUAL"
  ]).nullable()
}).strict();

const reservationResponseSchema = z.object({
  ok: z.literal(true),
  replayed: z.boolean(),
  checkoutAttemptId: z.string().min(1),
  fulfillmentMode: z.enum(["PICKUP", "WALKING_LOCAL_DELIVERY"]),
  hold: holdSchema
}).strict();

const capacityCheckoutSchema = z.object({
  capacityHoldId: z.string().uuid(),
  checkoutAttemptId: z.string().min(1),
  fulfillmentMode: z.enum(["PICKUP", "WALKING_LOCAL_DELIVERY"]),
  status: z.enum([
    "RESERVED",
    "BOUND",
    "PAID",
    "RELEASED",
    "EXPIRED",
    "CANCELLED",
    "PAYMENT_EXCEPTION",
    "RECONCILIATION_REQUIRED"
  ]),
  expiresAt: z.string().datetime({ offset: true }),
  squareOrderId: z.string().nullable(),
  squarePaymentLinkId: z.string().nullable(),
  squarePaymentId: z.string().nullable(),
  squareLocationId: z.string().nullable(),
  amountPaidCents: z.number().int().nonnegative().nullable(),
  currency: z.literal("USD").nullable(),
  boundAt: z.string().datetime({ offset: true }).nullable(),
  paidAt: z.string().datetime({ offset: true }).nullable(),
  releasedAt: z.string().datetime({ offset: true }).nullable(),
  releaseReason: z.string().nullable(),
  version: z.number().int().nonnegative()
}).strict();

const transitionResponseSchema = z.object({
  ok: z.literal(true),
  checkout: capacityCheckoutSchema,
  hold: holdSchema,
  changed: z.boolean()
}).strict();

type Auth0Configuration = {
  baseUrl: string;
  authMode: "AUTH0";
  tokenEndpoint: string;
  audience: string;
  clientId: string;
  clientSecret: string;
  scopes: typeof requiredScopes;
};

type SharedSecretConfiguration = {
  baseUrl: string;
  authMode: "SHARED_SECRET";
  sharedSecrets: {
    pickupQuote: string;
    pickupReservation: string;
    durableQuote: string;
    walkingReservation: string;
    capacityCheckout: string;
  };
};

type Configuration = Auth0Configuration | SharedSecretConfiguration;

export class OrderProStorefrontFulfillmentError extends Error {
  constructor(readonly code: string, readonly status: number | null) {
    super(code);
    this.name = "OrderProStorefrontFulfillmentError";
  }
}

export function getOrderProStorefrontFulfillmentConfiguration(
  environment: Record<string, string | undefined> = process.env
): Configuration | null {
  const base = baseConfigurationSchema.safeParse(environment);
  if (!base.success) return null;
  const baseUrl = safeOrigin(base.data.ORDERPRO_STOREFRONT_FULFILLMENT_BASE_URL);
  if (!baseUrl) return null;
  if (base.data.ORDERPRO_STOREFRONT_FULFILLMENT_AUTH_MODE === "SHARED_SECRET") {
    const parsed = sharedSecretConfigurationSchema.safeParse(environment);
    if (!parsed.success) return null;
    return {
      baseUrl,
      authMode: "SHARED_SECRET",
      sharedSecrets: {
        pickupQuote: parsed.data.ORDERPRO_STOREFRONT_PICKUP_QUOTE_SHARED_SECRET,
        pickupReservation: parsed.data.ORDERPRO_STOREFRONT_PICKUP_RESERVATION_SHARED_SECRET,
        durableQuote: parsed.data.ORDERPRO_STOREFRONT_DURABLE_QUOTE_SHARED_SECRET,
        walkingReservation: parsed.data.ORDERPRO_STOREFRONT_WALKING_RESERVATION_SHARED_SECRET,
        capacityCheckout: parsed.data.ORDERPRO_STOREFRONT_CAPACITY_CHECKOUT_SHARED_SECRET
      }
    };
  }
  const parsed = auth0ConfigurationSchema.safeParse(environment);
  if (!parsed.success) return null;
  const issuer = safeIssuer(parsed.data.ORDERPRO_AUTH0_ISSUER);
  const scopes = parsed.data.ORDERPRO_STOREFRONT_FULFILLMENT_AUTH0_SCOPES.split(/\s+/).filter(Boolean).sort();
  const expectedScopes = [...requiredScopes].sort();
  if (
    !issuer ||
    scopes.length !== expectedScopes.length ||
    scopes.some((scope, index) => scope !== expectedScopes[index])
  ) return null;
  return {
    baseUrl,
    authMode: "AUTH0",
    tokenEndpoint: new URL("oauth/token", issuer).href,
    audience: parsed.data.ORDERPRO_AUTH0_AUDIENCE,
    clientId: parsed.data.ORDERPRO_AUTH0_CLIENT_ID,
    clientSecret: parsed.data.ORDERPRO_AUTH0_CLIENT_SECRET,
    scopes: requiredScopes
  };
}

export function createOrderProStorefrontFulfillmentClient(input: {
  config: Configuration;
  tokenProvider?: OrderProTokenProvider;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const tokenProvider = input.tokenProvider ?? (input.config.authMode === "AUTH0"
    ? createAuth0TokenProvider({
        config: {
          tokenEndpoint: input.config.tokenEndpoint,
          audience: input.config.audience,
          clientId: input.config.clientId,
          clientSecret: input.config.clientSecret,
          scopes: input.config.scopes
        },
        fetchImpl
      })
    : null);

  async function post<T>(request: {
    path: string;
    body: unknown;
    correlationId: string;
    idempotencyKey: string;
    schema: z.ZodType<T>;
    successStatuses: readonly number[];
    secretKind: SecretKind;
  }): Promise<T> {
    const maximumAttempts = tokenProvider ? 2 : 1;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      let authenticationHeaders: Record<string, string>;
      if (tokenProvider) {
        try {
          authenticationHeaders = { authorization: `Bearer ${await tokenProvider.getAccessToken()}` };
        } catch {
          throw new OrderProStorefrontFulfillmentError("ORDERPRO_TOKEN_ACQUISITION_FAILED", null);
        }
      } else {
        authenticationHeaders = sharedSecretHeader(request.secretKind);
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await fetchImpl(`${input.config.baseUrl}${request.path}`, {
          method: "POST",
          headers: {
            accept: "application/json",
            ...authenticationHeaders,
            "content-type": "application/json",
            "idempotency-key": request.idempotencyKey,
            "x-correlation-id": request.correlationId
          },
          body: JSON.stringify(request.body),
          cache: "no-store",
          redirect: "error",
          signal: controller.signal
        });
        const raw = await readLimitedBody(response);
        if (response.headers.get("x-correlation-id") !== request.correlationId) {
          throw new OrderProStorefrontFulfillmentError("ORDERPRO_FULFILLMENT_PROTOCOL_ERROR", response.status);
        }
        if (request.successStatuses.includes(response.status)) {
          let json: unknown;
          try {
            json = JSON.parse(raw);
          } catch {
            throw new OrderProStorefrontFulfillmentError("ORDERPRO_FULFILLMENT_PROTOCOL_ERROR", response.status);
          }
          const result = request.schema.safeParse(json);
          if (!result.success) {
            throw new OrderProStorefrontFulfillmentError("ORDERPRO_FULFILLMENT_PROTOCOL_ERROR", response.status);
          }
          return result.data;
        }
        if (response.status === 401 && tokenProvider && attempt === 1) {
          tokenProvider.invalidate();
          continue;
        }
        throw new OrderProStorefrontFulfillmentError(upstreamCode(raw, response.status), response.status);
      } catch (error) {
        if (error instanceof OrderProStorefrontFulfillmentError) throw error;
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
          throw new OrderProStorefrontFulfillmentError("ORDERPRO_FULFILLMENT_TIMEOUT", null);
        }
        throw new OrderProStorefrontFulfillmentError("ORDERPRO_FULFILLMENT_UNAVAILABLE", null);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new OrderProStorefrontFulfillmentError("ORDERPRO_FULFILLMENT_UNAVAILABLE", null);
  }

  return {
    quotePickup(request: {
      locationId: "third_avenue" | "east_86th_street";
      requestedDate: string;
      cartLines: CartLine[];
      idempotencyKey: string;
      correlationId: string;
    }) {
      const { idempotencyKey, correlationId, ...body } = request;
      return post({
        path: "/api/internal/storefront/pickup-quote",
        body,
        correlationId,
        idempotencyKey,
        schema: pickupQuoteSchema,
        successStatuses: [200],
        secretKind: "pickupQuote"
      });
    },
    quoteLocalDelivery(request: {
      address: z.infer<typeof addressSchema>;
      cartLines: CartLine[];
      requestedDate: string;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const { idempotencyKey, correlationId, ...body } = request;
      return post({
        path: "/api/internal/storefront/durable-local-delivery-quote",
        body,
        correlationId,
        idempotencyKey,
        schema: localDeliveryQuoteSchema,
        successStatuses: [200],
        secretKind: "durableQuote"
      });
    },
    reservePickup(request: ReservationRequest) {
      return reserve("/api/internal/storefront/pickup-capacity-reservation", request, "PICKUP");
    },
    reserveLocalDelivery(request: ReservationRequest) {
      return reserve("/api/internal/storefront/walking-capacity-reservation", request, "WALKING_LOCAL_DELIVERY");
    },
    bind(request: {
      capacityHoldId: string;
      squareOrderId: string;
      squarePaymentLinkId: string;
      squareLocationId: string;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const { idempotencyKey, correlationId, ...body } = request;
      return post({
        path: "/api/internal/storefront/capacity-checkout/bind",
        body,
        correlationId,
        idempotencyKey,
        schema: transitionResponseSchema,
        successStatuses: [200],
        secretKind: "capacityCheckout"
      });
    },
    release(request: {
      capacityHoldId: string;
      reason: "CHECKOUT_FAILED" | "PAYMENT_FAILED" | "ABANDONED" | "MANUAL";
      idempotencyKey: string;
      correlationId: string;
    }) {
      const { idempotencyKey, correlationId, ...body } = request;
      return post({
        path: "/api/internal/storefront/capacity-checkout/release",
        body,
        correlationId,
        idempotencyKey,
        schema: transitionResponseSchema,
        successStatuses: [200],
        secretKind: "capacityCheckout"
      });
    }
  };

  async function reserve(path: string, request: ReservationRequest, expectedMode: "PICKUP" | "WALKING_LOCAL_DELIVERY") {
    const { idempotencyKey, correlationId, ...body } = request;
    const result = await post({
      path,
      body,
      correlationId,
      idempotencyKey,
      schema: reservationResponseSchema,
      successStatuses: [200, 201],
      secretKind: expectedMode === "PICKUP" ? "pickupReservation" : "walkingReservation"
    });
    if (result.fulfillmentMode !== expectedMode || result.checkoutAttemptId !== request.checkoutAttemptId) {
      throw new OrderProStorefrontFulfillmentError("ORDERPRO_FULFILLMENT_EVIDENCE_MISMATCH", 200);
    }
    return result;
  }

  function sharedSecretHeader(kind: SecretKind) {
    if (input.config.authMode !== "SHARED_SECRET") {
      throw new OrderProStorefrontFulfillmentError("ORDERPRO_FULFILLMENT_AUTH_NOT_CONFIGURED", null);
    }
    const headers: Record<SecretKind, string> = {
      pickupQuote: "x-orderpro-pickup-quote-key",
      pickupReservation: "x-orderpro-pickup-reservation-key",
      durableQuote: "x-orderpro-durable-quote-key",
      walkingReservation: "x-orderpro-walking-reservation-key",
      capacityCheckout: "x-orderpro-capacity-checkout-key"
    };
    return { [headers[kind]]: input.config.sharedSecrets[kind] };
  }
}

type SecretKind = "pickupQuote" | "pickupReservation" | "durableQuote" | "walkingReservation" | "capacityCheckout";

type ReservationRequest = {
  quoteId: string;
  slotId: string;
  checkoutAttemptId: string;
  idempotencyKey: string;
  correlationId: string;
};

export function getOrderProStorefrontFulfillmentClient() {
  const config = getOrderProStorefrontFulfillmentConfiguration();
  return config ? createOrderProStorefrontFulfillmentClient({ config }) : null;
}

async function readLimitedBody(response: Response) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxResponseBytes)) {
    throw new OrderProStorefrontFulfillmentError("ORDERPRO_FULFILLMENT_RESPONSE_TOO_LARGE", response.status);
  }
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > maxResponseBytes) {
    throw new OrderProStorefrontFulfillmentError("ORDERPRO_FULFILLMENT_RESPONSE_TOO_LARGE", response.status);
  }
  return raw;
}

function upstreamCode(raw: string, status: number) {
  try {
    const parsed = JSON.parse(raw) as { code?: unknown };
    if (typeof parsed.code === "string" && /^[A-Z0-9_]+$/.test(parsed.code)) return parsed.code;
  } catch {
    // The HTTP-derived error remains safe when the body is not JSON.
  }
  return `ORDERPRO_FULFILLMENT_HTTP_${status}`;
}

function safeOrigin(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function safeIssuer(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    return url;
  } catch {
    return null;
  }
}
