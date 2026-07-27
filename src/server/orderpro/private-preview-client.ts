import "server-only";

import { z } from "zod";

const requestTimeoutMs = 5_000;
const maxResponseBytes = 128 * 1024;

const previewConfigurationSchema = z.object({
  ORDERPRO_STOREFRONT_PREVIEW_BASE_URL: z.string().url(),
  ORDERPRO_STOREFRONT_PREVIEW_SHARED_SECRET: z.string().min(32)
});

const slotSchema = z.object({
  slotId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime()
});

const postalEligibilitySchema = z.discriminatedUnion("eligible", [
  z.object({
    ok: z.literal(true),
    eligible: z.literal(true),
    postalCode: z.string().regex(/^\d{5}$/),
    approvalId: z.string().min(1),
    expiresAt: z.string().datetime()
  }),
  z.object({
    ok: z.literal(true),
    eligible: z.literal(false),
    postalCode: z.string().regex(/^\d{5}$/),
    reasonCode: z.literal("OUTSIDE_DELIVERY_AREA"),
    message: z.string().min(1),
    expiresAt: z.string().datetime()
  })
]);

const pickupAvailabilitySchema = z.object({
  ok: z.literal(true),
  mode: z.literal("PICKUP"),
  locationId: z.enum(["third_avenue", "east_86th_street"]),
  requestedDate: z.string().date(),
  expiresAt: z.string().datetime(),
  availableSlots: z.array(slotSchema)
});

const localDeliveryQuoteSchema = z.discriminatedUnion("eligible", [
  z.object({
    ok: z.literal(true),
    eligible: z.literal(false),
    reasonCode: z.string().min(1),
    storefrontMessage: z.string().min(1),
    expiresAt: z.string().datetime()
  }),
  z.object({
    ok: z.literal(true),
    eligible: z.literal(true),
    bookable: z.boolean(),
    reasonCode: z.string().min(1),
    normalizedAddress: z.object({
      line1: z.string().min(1),
      line2: z.string().nullable().optional(),
      city: z.string().min(1),
      state: z.string().length(2),
      postalCode: z.string().regex(/^\d{5}(?:-\d{4})?$/),
      country: z.literal("US")
    }),
    selectedLocationId: z.enum(["third_avenue", "east_86th_street"]),
    selectedLocationName: z.string().min(1),
    walkingDistanceFeet: z.number().nonnegative(),
    walkingDurationSeconds: z.number().nonnegative(),
    feeCents: z.number().int().nonnegative(),
    currency: z.literal("USD"),
    availableSlots: z.array(slotSchema),
    candidateRoutes: z.array(z.object({
      locationId: z.enum(["third_avenue", "east_86th_street"]),
      walkingDistanceFeet: z.number().nonnegative(),
      walkingDurationSeconds: z.number().nonnegative()
    })),
    expiresAt: z.string().datetime()
  })
]);

const shippingAllocationSchema = z.discriminatedUnion("available", [
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
    fulfillmentNodeId: z.literal("warehouse-englewood"),
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

type PreviewConfiguration = {
  baseUrl: string;
  sharedSecret: string;
};

export type OrderProPrivatePreviewClient = ReturnType<typeof createOrderProPrivatePreviewClient>;

export function getOrderProPrivatePreviewConfiguration(
  environment: Record<string, string | undefined> = process.env
): PreviewConfiguration | null {
  const parsed = previewConfigurationSchema.safeParse(environment);
  if (!parsed.success) return null;

  const url = new URL(parsed.data.ORDERPRO_STOREFRONT_PREVIEW_BASE_URL);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:")
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    return null;
  }

  return {
    baseUrl: url.origin,
    sharedSecret: parsed.data.ORDERPRO_STOREFRONT_PREVIEW_SHARED_SECRET
  };
}

export function createOrderProPrivatePreviewClient(input: {
  config: PreviewConfiguration;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;

  async function post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetchImpl(`${input.config.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orderpro-preview-key": input.config.sharedSecret
        },
        body: JSON.stringify(body),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal
      });
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        throw new Error("ORDERPRO_PREVIEW_RESPONSE_TOO_LARGE");
      }
      const raw = await response.text();
      if (new TextEncoder().encode(raw).byteLength > maxResponseBytes) {
        throw new Error("ORDERPRO_PREVIEW_RESPONSE_TOO_LARGE");
      }
      if (!response.ok) throw new Error(`ORDERPRO_PREVIEW_HTTP_${response.status}`);

      return schema.parse(JSON.parse(raw));
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    checkPostalEligibility(postalCode: string) {
      return post(
        "/api/staging/local-delivery/postal-eligibility-preview",
        { postalCode },
        postalEligibilitySchema
      );
    },
    getPickupAvailability(input: { locationId: "third_avenue" | "east_86th_street"; requestedDate: string }) {
      return post(
        "/api/staging/pickup/slots-preview",
        input,
        pickupAvailabilitySchema
      );
    },
    quoteLocalDelivery(input: {
      line1: string;
      line2: string | null;
      postalCode: string;
      quantity: number;
      requestedDate: string;
    }) {
      return post(
        "/api/staging/local-delivery/quote-preview",
        input,
        localDeliveryQuoteSchema
      );
    },
    previewShippingAllocation(input: {
      locationId: string;
      items: Array<{ squareVariationId: string; quantity: number }>;
    }) {
      return post(
        "/api/staging/shipping/allocation-preview",
        input,
        shippingAllocationSchema
      );
    }
  };
}

export function getOrderProPrivatePreviewClient() {
  const config = getOrderProPrivatePreviewConfiguration();
  return config ? createOrderProPrivatePreviewClient({ config }) : null;
}
