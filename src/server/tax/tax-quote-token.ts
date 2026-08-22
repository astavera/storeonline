/**
 * Signs short-lived TaxQuote references with a dedicated, domain-separated HMAC key.
 */

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { moneyCentsSchema } from "@/server/tax/tax-types";
import { TaxProviderError } from "@/server/tax/tax-provider";

const TOKEN_DOMAIN = "modern-state.tax-quote.v1";
const MAX_TOKEN_LENGTH = 4_000;
const MAX_QUOTE_TTL_MS = 15 * 60_000;
const MAX_CLOCK_SKEW_MS = 60_000;
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const taxQuoteTokenPayloadSchema = z.object({
  v: z.literal(1),
  purpose: z.literal("shipping-tax-quote"),
  taxQuoteId: z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/),
  provider: z.literal("stripe_tax"),
  fulfillmentType: z.literal("SHIPPING"),
  applicationMode: z.literal("EXPLICIT_DESTINATION_TAX"),
  currency: z.literal("USD"),
  nexusDecision: z.enum(["COLLECT", "DO_NOT_COLLECT"]),
  taxSource: z.enum(["origin", "destination"]).nullable(),
  cartFingerprint: fingerprintSchema,
  originFingerprint: fingerprintSchema,
  destinationFingerprint: fingerprintSchema,
  shippingRateFingerprint: fingerprintSchema,
  calculationFingerprint: fingerprintSchema,
  subtotalCents: moneyCentsSchema,
  shippingCents: moneyCentsSchema,
  merchandiseTaxCents: moneyCentsSchema,
  shippingTaxCents: moneyCentsSchema,
  totalTaxCents: moneyCentsSchema,
  totalCents: moneyCentsSchema,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime()
}).strict().superRefine((payload, context) => {
  const issuedAt = Date.parse(payload.issuedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  if (expiresAt <= issuedAt || expiresAt - issuedAt > MAX_QUOTE_TTL_MS) {
    context.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "Tax quote expiration is outside the supported TTL."
    });
  }
  const expectedTax = BigInt(payload.merchandiseTaxCents) + BigInt(payload.shippingTaxCents);
  const expectedTotal = BigInt(payload.subtotalCents) + BigInt(payload.shippingCents) + expectedTax;
  if (expectedTax !== BigInt(payload.totalTaxCents) || expectedTotal !== BigInt(payload.totalCents)) {
    context.addIssue({
      code: "custom",
      path: ["totalCents"],
      message: "Tax quote monetary totals do not reconcile."
    });
  }
  if (
    payload.nexusDecision === "DO_NOT_COLLECT" &&
    (payload.taxSource !== null || payload.totalTaxCents !== 0)
  ) {
    context.addIssue({
      code: "custom",
      path: ["nexusDecision"],
      message: "A no-nexus quote cannot contain tax."
    });
  }
  if (payload.nexusDecision === "COLLECT" && payload.taxSource === null) {
    context.addIssue({
      code: "custom",
      path: ["taxSource"],
      message: "A collect decision requires a tax source."
    });
  }
});

export type TaxQuoteTokenPayload = z.infer<typeof taxQuoteTokenPayloadSchema>;

export type TaxQuoteTokenErrorCode =
  | "TAX_QUOTE_TOKEN_INVALID"
  | "TAX_QUOTE_TOKEN_EXPIRED"
  | "TAX_QUOTE_TOKEN_NOT_YET_VALID";

export class TaxQuoteTokenError extends Error {
  constructor(readonly code: TaxQuoteTokenErrorCode) {
    super(code);
    this.name = "TaxQuoteTokenError";
  }
}

export interface TaxQuoteTokenSigner {
  sign(payload: TaxQuoteTokenPayload): string;
  verify(token: string, now?: Date): TaxQuoteTokenPayload;
}

export function resolveTaxQuoteSigningSecret(
  environment: Record<string, string | undefined> = process.env
) {
  const secret = environment.TAX_QUOTE_SIGNING_SECRET?.trim();
  const providerSecrets = [
    environment.STRIPE_TAX_SECRET_KEY,
    environment.SHIPPO_API_TOKEN,
    environment.SQUARE_ACCESS_TOKEN
  ].map((value) => value?.trim()).filter(Boolean);
  if (
    !secret ||
    Buffer.byteLength(secret, "utf8") < 32 ||
    providerSecrets.includes(secret)
  ) {
    throw new TaxProviderError("TAX_PROVIDER_NOT_CONFIGURED");
  }
  return secret;
}

export function createTaxQuoteTokenSigner(secret: string): TaxQuoteTokenSigner {
  assertSigningSecret(secret);
  return {
    sign: (payload) => signTaxQuoteToken(payload, secret),
    verify: (token, now) => verifyTaxQuoteToken(token, secret, now)
  };
}

export function createConfiguredTaxQuoteTokenSigner(
  environment: Record<string, string | undefined> = process.env
) {
  return createTaxQuoteTokenSigner(resolveTaxQuoteSigningSecret(environment));
}

export function signTaxQuoteToken(payload: TaxQuoteTokenPayload, secret: string) {
  assertSigningSecret(secret);
  const parsed = taxQuoteTokenPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new TaxQuoteTokenError("TAX_QUOTE_TOKEN_INVALID");
  const encoded = Buffer.from(JSON.stringify(parsed.data), "utf8").toString("base64url");
  const signature = tokenDigest(encoded, secret).toString("base64url");
  const token = `${encoded}.${signature}`;
  if (token.length > MAX_TOKEN_LENGTH) throw new TaxQuoteTokenError("TAX_QUOTE_TOKEN_INVALID");
  return token;
}

export function verifyTaxQuoteToken(token: string, secret: string, now = new Date()) {
  assertSigningSecret(secret);
  if (token.length > MAX_TOKEN_LENGTH) throw new TaxQuoteTokenError("TAX_QUOTE_TOKEN_INVALID");
  const [encoded, suppliedSignature, ...rest] = token.split(".");
  if (
    !encoded || !suppliedSignature || rest.length > 0 ||
    !/^[A-Za-z0-9_-]+$/.test(encoded) ||
    !/^[A-Za-z0-9_-]{43}$/.test(suppliedSignature)
  ) {
    throw new TaxQuoteTokenError("TAX_QUOTE_TOKEN_INVALID");
  }

  const expected = tokenDigest(encoded, secret);
  const supplied = decodeBase64Url(suppliedSignature);
  if (!supplied || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new TaxQuoteTokenError("TAX_QUOTE_TOKEN_INVALID");
  }

  let decoded: unknown;
  try {
    const bytes = decodeBase64Url(encoded);
    if (!bytes) throw new Error("invalid base64url");
    decoded = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new TaxQuoteTokenError("TAX_QUOTE_TOKEN_INVALID");
  }
  const parsed = taxQuoteTokenPayloadSchema.safeParse(decoded);
  if (!parsed.success) throw new TaxQuoteTokenError("TAX_QUOTE_TOKEN_INVALID");

  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new TaxQuoteTokenError("TAX_QUOTE_TOKEN_INVALID");
  if (Date.parse(parsed.data.issuedAt) > nowMs + MAX_CLOCK_SKEW_MS) {
    throw new TaxQuoteTokenError("TAX_QUOTE_TOKEN_NOT_YET_VALID");
  }
  if (Date.parse(parsed.data.expiresAt) <= nowMs) {
    throw new TaxQuoteTokenError("TAX_QUOTE_TOKEN_EXPIRED");
  }
  return parsed.data;
}

function tokenDigest(encoded: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${TOKEN_DOMAIN}\0${encoded}`, "utf8")
    .digest();
}

function decodeBase64Url(value: string) {
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.toString("base64url") === value ? decoded : null;
  } catch {
    return null;
  }
}

function assertSigningSecret(secret: string) {
  if (Buffer.byteLength(secret.trim(), "utf8") < 32) {
    throw new TaxProviderError("TAX_PROVIDER_NOT_CONFIGURED");
  }
}
