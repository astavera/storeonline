/** Minimal Stripe Tax HTTP boundary for calculations and external-payment reporting. */

import "server-only";

import { z } from "zod";
import { TaxProviderError } from "@/server/tax/tax-provider";

const STRIPE_API_BASE_URL = "https://api.stripe.com/v1";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const stripeMoneySchema = z.number().int().min(0).max(99_999_999);

const stripeTaxBreakdownSchema = z.object({
  amount: stripeMoneySchema,
  jurisdiction: z.object({
    country: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    level: z.string().optional(),
    display_name: z.string().optional()
  }).passthrough(),
  sourcing: z.enum(["origin", "destination"]),
  tax_rate_details: z.object({
    percentage_decimal: z.string(),
    tax_type: z.string().nullable().optional()
  }).passthrough().nullable(),
  taxability_reason: z.string(),
  taxable_amount: stripeMoneySchema
}).passthrough();

const stripeCalculationComponentSchema = z.object({
  amount: stripeMoneySchema,
  amount_tax: stripeMoneySchema,
  tax_behavior: z.literal("exclusive"),
  tax_code: z.string().regex(/^txcd_\d{8}$/),
  tax_breakdown: z.array(stripeTaxBreakdownSchema).nullable()
}).passthrough();

export const stripeTaxCalculationResponseSchema = z.object({
  id: z.string().regex(/^taxcalc_/),
  object: z.literal("tax.calculation"),
  amount_total: stripeMoneySchema,
  currency: z.literal("usd"),
  expires_at: z.number().int().positive(),
  livemode: z.boolean(),
  line_items: z.object({
    object: z.literal("list"),
    data: z.array(stripeCalculationComponentSchema.extend({
      reference: z.string().min(1),
      quantity: z.number().int().positive()
    }).passthrough()),
    has_more: z.boolean()
  }).passthrough(),
  shipping_cost: stripeCalculationComponentSchema.nullable(),
  tax_amount_exclusive: stripeMoneySchema,
  tax_amount_inclusive: stripeMoneySchema,
  tax_breakdown: z.array(z.object({
    amount: stripeMoneySchema,
    inclusive: z.boolean(),
    taxable_amount: stripeMoneySchema,
    tax_rate_details: z.object({
      country: z.string().nullable(),
      state: z.string().nullable(),
      percentage_decimal: z.string(),
      tax_type: z.string().nullable().optional()
    }).passthrough()
  }).passthrough())
}).passthrough();

const stripeTaxTransactionResponseSchema = z.object({
  id: z.string().regex(/^tax_/),
  object: z.literal("tax.transaction"),
  currency: z.literal("usd"),
  livemode: z.boolean(),
  reference: z.string().min(1)
}).passthrough();

export type StripeTaxCalculationResponse = z.infer<typeof stripeTaxCalculationResponseSchema>;

export type StripeTaxConfiguration = Readonly<{
  secretKey: string;
  livemode: boolean;
  baseUrl: typeof STRIPE_API_BASE_URL;
  timeoutMs: number;
  shippingTaxCode: string;
}>;

export interface StripeTaxClient {
  createCalculation(body: URLSearchParams): Promise<StripeTaxCalculationResponse>;
  createTransactionFromCalculation(input: {
    calculationId: string;
    reference: string;
    postedAt?: number;
  }): Promise<{ id: string; reference: string; livemode: boolean }>;
}

export function resolveStripeTaxConfiguration(
  environment: Record<string, string | undefined> = process.env
): StripeTaxConfiguration {
  if (environment.DESTINATION_TAX_ENABLED?.trim() !== "true") {
    throw new TaxProviderError("TAX_PROVIDER_DISABLED");
  }
  const secretKey = environment.STRIPE_TAX_SECRET_KEY?.trim() ?? "";
  if (!/^sk_(?:test|live)_[A-Za-z0-9_]{8,}$/.test(secretKey)) {
    throw new TaxProviderError("TAX_PROVIDER_NOT_CONFIGURED");
  }
  const livemode = secretKey.startsWith("sk_live_");
  const squareEnvironment = environment.SQUARE_ENVIRONMENT?.trim() || "sandbox";
  if ((squareEnvironment === "production") !== livemode) {
    throw new TaxProviderError("TAX_PROVIDER_NOT_CONFIGURED");
  }
  const shippingTaxCode = environment.STRIPE_TAX_SHIPPING_CODE?.trim() || "txcd_92010001";
  if (!/^txcd_\d{8}$/.test(shippingTaxCode)) {
    throw new TaxProviderError("TAX_PROVIDER_NOT_CONFIGURED");
  }
  return {
    secretKey,
    livemode,
    baseUrl: STRIPE_API_BASE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    shippingTaxCode
  };
}

export function createStripeTaxClient(input: {
  configuration: StripeTaxConfiguration;
  fetchImpl?: typeof fetch;
}): StripeTaxClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  const configuration = input.configuration;

  async function post<T>(path: string, body: URLSearchParams, schema: z.ZodType<T>, idempotencyKey?: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);
    try {
      const response = await fetchImpl(`${configuration.baseUrl}${path}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${configuration.secretKey}`,
          "content-type": "application/x-www-form-urlencoded",
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {})
        },
        body: body.toString(),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal
      });
      const raw = await readLimitedResponse(response);
      if (!response.ok) throw errorForStatus(response.status);
      let decoded: unknown;
      try {
        decoded = JSON.parse(raw);
      } catch (cause) {
        throw new TaxProviderError("TAX_PROVIDER_PROTOCOL_ERROR", response.status, { cause });
      }
      const parsed = schema.safeParse(decoded);
      if (!parsed.success) {
        throw new TaxProviderError("TAX_PROVIDER_PROTOCOL_ERROR", response.status, { cause: parsed.error });
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof TaxProviderError) throw error;
      if (controller.signal.aborted) {
        throw new TaxProviderError("TAX_REQUEST_TIMEOUT", null, { cause: error, retryable: true });
      }
      throw new TaxProviderError("TAX_PROVIDER_UNAVAILABLE", null, { cause: error, retryable: true });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async createCalculation(body) {
      const result = await post("/tax/calculations", body, stripeTaxCalculationResponseSchema);
      if (result.livemode !== configuration.livemode) {
        throw new TaxProviderError("TAX_PROVIDER_PROTOCOL_ERROR");
      }
      return result;
    },
    async createTransactionFromCalculation(transaction) {
      if (!/^taxcalc_/.test(transaction.calculationId) || !transaction.reference.trim()) {
        throw new TaxProviderError("TAX_INVALID_INPUT");
      }
      const body = new URLSearchParams({
        calculation: transaction.calculationId,
        reference: transaction.reference
      });
      if (transaction.postedAt !== undefined) body.set("posted_at", String(transaction.postedAt));
      const result = await post(
        "/tax/transactions/create_from_calculation",
        body,
        stripeTaxTransactionResponseSchema,
        `square-tax-${transaction.reference}`.slice(0, 255)
      );
      if (result.livemode !== configuration.livemode || result.reference !== transaction.reference) {
        throw new TaxProviderError("TAX_PROVIDER_RECONCILIATION_FAILED");
      }
      return { id: result.id, reference: result.reference, livemode: result.livemode };
    }
  };
}

async function readLimitedResponse(response: Response) {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!Number.isSafeInteger(Number(declared)) || Number(declared) > MAX_RESPONSE_BYTES)) {
    throw new TaxProviderError("TAX_PROVIDER_PROTOCOL_ERROR", response.status);
  }
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
    throw new TaxProviderError("TAX_PROVIDER_PROTOCOL_ERROR", response.status);
  }
  return raw;
}

function errorForStatus(status: number) {
  if (status === 401 || status === 403) return new TaxProviderError("TAX_AUTHENTICATION_FAILED", status);
  if (status === 429) return new TaxProviderError("TAX_RATE_LIMITED", status, { retryable: true });
  if ([400, 404, 409, 422].includes(status)) return new TaxProviderError("TAX_UPSTREAM_REJECTED", status);
  if (status >= 500) return new TaxProviderError("TAX_PROVIDER_UNAVAILABLE", status, { retryable: true });
  return new TaxProviderError("TAX_PROVIDER_PROTOCOL_ERROR", status);
}
