/**
 * Defines the private, server-to-server OrderPRO returns contract. OrderPRO is
 * authoritative for order verification, RMA creation, inspection, and stock
 * disposition; the storefront never calls these endpoints from the browser.
 */

import "server-only";

import { z } from "zod";
import { returnLineSelectionSchema, returnsStatusSchema } from "@/features/returns/contracts";
import {
  returnPolicyTags,
  type EvidenceDecision,
  type ReturnPolicyEvaluation,
  type VerifiedOrderSnapshot
} from "@/server/returns/return-policy";

const requestTimeoutMs = 10_000;
const maxResponseBytes = 512 * 1024;

const configurationSchema = z.object({
  ORDERPRO_RETURNS_ENABLED: z.literal("true"),
  ORDERPRO_STOREFRONT_PREVIEW_BASE_URL: z.string().url(),
  ORDERPRO_STOREFRONT_RETURNS_SHARED_SECRET: z.string().min(32)
});

const moneySchema = z.number().int().nonnegative().max(100_000_000);
const packageSchema = z.object({
  lengthIn: z.number().positive(),
  widthIn: z.number().positive(),
  heightIn: z.number().positive(),
  weightLb: z.number().positive()
}).strict();

export const verifiedOrderSnapshotSchema = z.object({
  orderProOrderId: z.string().min(1).max(200),
  orderNumber: z.string().min(1).max(100),
  squarePaymentId: z.string().min(1).max(200).nullable(),
  currency: z.literal("USD"),
  fulfillmentStatus: z.string().min(1).max(80),
  confirmedDeliveryAt: z.string().datetime().nullable(),
  originalShippingCents: moneySchema,
  originalLocalDeliveryCents: moneySchema,
  returnAddress: z.object({
    name: z.string().min(1).max(160),
    line1: z.string().min(1).max(160),
    line2: z.string().max(160).optional(),
    city: z.string().min(1).max(100),
    state: z.string().length(2),
    postalCode: z.string().min(5).max(10),
    country: z.literal("US")
  }).strict(),
  lines: z.array(z.object({
    orderLineId: z.string().min(1).max(160),
    squareVariationId: z.string().max(200).nullable(),
    name: z.string().min(1).max(300),
    variant: z.string().max(200).nullable(),
    sku: z.string().max(100).nullable(),
    upc: z.string().max(100).nullable(),
    imageUrl: z.string().url().nullable(),
    purchasedQuantity: z.number().int().nonnegative(),
    deliveredQuantity: z.number().int().nonnegative(),
    previouslyReturnedQuantity: z.number().int().nonnegative(),
    unitMerchandiseCents: moneySchema,
    unitTaxCents: moneySchema,
    unitDiscountCents: moneySchema,
    finalSale: z.boolean(),
    brandReturnable: z.boolean(),
    returnPolicyTags: z.array(z.enum(returnPolicyTags)),
    package: packageSchema.nullable()
  }).strict()).min(1).max(200)
}).strict();

const startVerificationResponseSchema = z.object({
  ok: z.literal(true),
  challengeId: z.string().min(16).max(500),
  expiresAt: z.string().datetime()
}).strict();

const confirmVerificationResponseSchema = z.object({
  ok: z.literal(true),
  verified: z.boolean(),
  snapshot: verifiedOrderSnapshotSchema.nullable()
}).strict();

const evidenceDecisionSchema = z.enum(["APPROVED", "PENDING", "REJECTED", "NOT_REQUIRED"]);

const previewResponseSchema = z.object({
  ok: z.literal(true),
  evidenceDecisions: z.record(z.string(), evidenceDecisionSchema)
}).strict();

const createRmaResponseSchema = z.object({
  ok: z.literal(true),
  replayed: z.boolean(),
  rma: z.object({
    id: z.string().min(1).max(200),
    rmaNumber: z.string().min(1).max(100),
    status: returnsStatusSchema,
    evidenceDecisions: z.record(z.string(), evidenceDecisionSchema),
    labelAuthorized: z.boolean(),
    emailDispatched: z.boolean()
  }).strict()
}).strict();

const statusResponseSchema = z.object({
  ok: z.literal(true),
  rma: z.object({
    id: z.string().min(1),
    rmaNumber: z.string().min(1),
    status: returnsStatusSchema,
    updatedAt: z.string().datetime(),
    authorizedOrderLineIds: z.array(z.string()),
    reviewOrderLineIds: z.array(z.string())
  }).strict()
}).strict();

const evidenceUploadResponseSchema = z.object({
  ok: z.literal(true),
  evidenceReference: z.string().min(8).max(500)
}).strict();

export type OrderProReturnsConfiguration = {
  baseUrl: string;
  sharedSecret: string;
};

export function getOrderProReturnsConfiguration(
  environment: Record<string, string | undefined> = process.env
): OrderProReturnsConfiguration | null {
  const parsed = configurationSchema.safeParse(environment);
  if (!parsed.success) return null;
  const url = new URL(parsed.data.ORDERPRO_STOREFRONT_PREVIEW_BASE_URL);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) return null;
  return {
    baseUrl: url.origin,
    sharedSecret: parsed.data.ORDERPRO_STOREFRONT_RETURNS_SHARED_SECRET
  };
}

export function createOrderProReturnsClient(input: {
  config: OrderProReturnsConfiguration;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;

  async function request<T>(path: string, init: RequestInit, schema: z.ZodType<T>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(`${input.config.baseUrl}${path}`, {
        ...init,
        headers: {
          "x-orderpro-returns-key": input.config.sharedSecret,
          ...init.headers
        },
        cache: "no-store",
        redirect: "error",
        signal: controller.signal
      });
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        throw new OrderProReturnsError("ORDERPRO_RETURNS_RESPONSE_TOO_LARGE");
      }
      const raw = await response.text();
      if (new TextEncoder().encode(raw).byteLength > maxResponseBytes) {
        throw new OrderProReturnsError("ORDERPRO_RETURNS_RESPONSE_TOO_LARGE");
      }
      if (!response.ok) {
        throw new OrderProReturnsError(`ORDERPRO_RETURNS_HTTP_${response.status}`);
      }
      return schema.parse(JSON.parse(raw));
    } catch (error) {
      if (error instanceof OrderProReturnsError) throw error;
      throw new OrderProReturnsError("ORDERPRO_RETURNS_UNAVAILABLE", { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  const postJson = <T>(path: string, body: unknown, schema: z.ZodType<T>, headers?: Record<string, string>) =>
    request(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body)
    }, schema);

  return {
    startVerification(input: { orderNumber: string; email: string; postalCode: string }) {
      return postJson(
        "/api/internal/storefront/returns/verification/start",
        input,
        startVerificationResponseSchema
      );
    },
    confirmVerification(input: { challengeId: string; code: string }) {
      return postJson(
        "/api/internal/storefront/returns/verification/confirm",
        input,
        confirmVerificationResponseSchema
      );
    },
    preview(input: {
      orderProOrderId: string;
      selections: z.infer<typeof returnLineSelectionSchema>[];
    }): Promise<{ ok: true; evidenceDecisions: Record<string, EvidenceDecision> }> {
      return postJson(
        "/api/internal/storefront/returns/preview",
        input,
        previewResponseSchema
      );
    },
    createRma(input: {
      order: VerifiedOrderSnapshot;
      selections: z.infer<typeof returnLineSelectionSchema>[];
      evaluation: ReturnPolicyEvaluation;
      acceptedLabelCostCents: number;
      quoteExpiresAt: string;
      idempotencyKey: string;
    }) {
      return postJson(
        "/api/internal/storefront/returns/create",
        {
          orderProOrderId: input.order.orderProOrderId,
          selections: input.selections,
          evaluation: input.evaluation,
          acceptedLabelCostCents: input.acceptedLabelCostCents,
          quoteExpiresAt: input.quoteExpiresAt
        },
        createRmaResponseSchema,
        { "idempotency-key": input.idempotencyKey }
      );
    },
    getStatus(input: { orderProRmaId: string }) {
      return postJson(
        "/api/internal/storefront/returns/status",
        input,
        statusResponseSchema
      );
    },
    async uploadEvidence(input: {
      challengeSessionId: string;
      orderLineId: string;
      file: File;
    }) {
      const formData = new FormData();
      formData.set("challengeSessionId", input.challengeSessionId);
      formData.set("orderLineId", input.orderLineId);
      formData.set("file", input.file);
      return request(
        "/api/internal/storefront/returns/evidence",
        { method: "POST", body: formData },
        evidenceUploadResponseSchema
      );
    },
    recordInventoryDisposition(input: {
      orderProRmaId: string;
      eventId: string;
      disposition: "RETURN_STAGED" | "QUARANTINED" | "PUTAWAY" | "AVAILABLE_ONLINE" | "DAMAGED" | "MANUAL_REVIEW";
      lines: Array<{ orderLineId: string; quantity: number }>;
      occurredAt: string;
    }) {
      return postJson(
        "/api/internal/storefront/returns/inventory-event",
        input,
        z.object({ ok: z.literal(true), replayed: z.boolean() }).strict(),
        { "idempotency-key": input.eventId }
      );
    }
  };
}

export function getOrderProReturnsClient() {
  const config = getOrderProReturnsConfiguration();
  return config ? createOrderProReturnsClient({ config }) : null;
}

export class OrderProReturnsError extends Error {
  readonly code: string;

  constructor(code: string, options?: { cause?: unknown }) {
    super("The returns service is temporarily unavailable.", options);
    this.name = "OrderProReturnsError";
    this.code = code;
  }
}
