/**
 * Provides opaque, short-lived return tokens. Tokens contain no order details,
 * addresses, email addresses, or prices in plaintext.
 */

import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const verificationHandleSchema = z.object({
  v: z.literal(1),
  type: z.literal("verification"),
  challengeId: z.string().min(16).max(500),
  orderReferenceHash: z.string().length(64),
  emailHash: z.string().length(64),
  postalCodeHash: z.string().length(64),
  expiresAt: z.string().datetime()
}).strict();

const quoteHandleSchema = z.object({
  v: z.literal(1),
  type: z.literal("quote"),
  sessionId: z.string().min(1),
  quoteHash: z.string().length(64),
  labelCostCents: z.number().int().nonnegative(),
  shippoQuote: z.object({
    shipmentId: z.string().min(1).max(200),
    rateId: z.string().min(1).max(200),
    amountCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    carrier: z.string().min(1).max(100),
    serviceLevel: z.string().min(1).max(160),
    serviceToken: z.string().min(1).max(160),
    expiresAt: z.string().datetime()
  }).strict().nullable(),
  expiresAt: z.string().datetime()
}).strict();

export type ReturnQuoteHandle = z.infer<typeof quoteHandleSchema>;

export function getReturnsSessionSecret(environment: Record<string, string | undefined> = process.env) {
  const value = environment.RETURNS_SESSION_SECRET?.trim();
  if (!value || value.length < 32) throw new ReturnsSecurityError("RETURNS_SESSION_SECRET_NOT_CONFIGURED");
  return value;
}

export function createVerificationHandle(input: {
  challengeId: string;
  orderNumber: string;
  email: string;
  postalCode: string;
  expiresAt: string;
  secret?: string;
}) {
  const secret = input.secret ?? getReturnsSessionSecret();
  return signPayload({
    v: 1,
    type: "verification",
    challengeId: input.challengeId,
    orderReferenceHash: sensitiveHash(input.orderNumber.trim().toUpperCase(), secret),
    emailHash: sensitiveHash(input.email.trim().toLowerCase(), secret),
    postalCodeHash: sensitiveHash(input.postalCode.trim().toUpperCase(), secret),
    expiresAt: input.expiresAt
  }, secret);
}

export function verifyVerificationHandle(value: string, now = new Date(), secret = getReturnsSessionSecret()) {
  const payload = verificationHandleSchema.parse(verifyPayload(value, secret));
  if (Date.parse(payload.expiresAt) <= now.getTime()) {
    throw new ReturnsSecurityError("VERIFICATION_EXPIRED");
  }
  return payload;
}

export function createReturnQuoteHandle(input: {
  sessionId: string;
  quoteHash: string;
  labelCostCents: number;
  shippoQuote: {
    shipmentId: string;
    rateId: string;
    amountCents: number;
    currency: string;
    carrier: string;
    serviceLevel: string;
    serviceToken: string;
    expiresAt: string;
  } | null;
  expiresAt: string;
  secret?: string;
}) {
  const secret = input.secret ?? getReturnsSessionSecret();
  return signPayload({
    v: 1,
    type: "quote",
    sessionId: input.sessionId,
    quoteHash: input.quoteHash,
    labelCostCents: input.labelCostCents,
    shippoQuote: input.shippoQuote,
    expiresAt: input.expiresAt
  }, secret);
}

export function verifyReturnQuoteHandle(value: string, now = new Date(), secret = getReturnsSessionSecret()) {
  const payload = quoteHandleSchema.parse(verifyPayload(value, secret));
  if (Date.parse(payload.expiresAt) <= now.getTime()) {
    throw new ReturnsSecurityError("RETURN_QUOTE_EXPIRED");
  }
  return payload;
}

export function createPublicSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function publicTokenHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function stablePayloadHash(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

export function sensitiveHash(value: string, secret = getReturnsSessionSecret()) {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function signPayload(payload: unknown, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded, "utf8").digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyPayload(value: string, secret: string) {
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra) throw new ReturnsSecurityError("RETURN_TOKEN_INVALID");
  const expected = createHmac("sha256", secret).update(encoded, "utf8").digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    throw new ReturnsSecurityError("RETURN_TOKEN_INVALID");
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new ReturnsSecurityError("RETURN_TOKEN_INVALID");
  }
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new ReturnsSecurityError("RETURN_TOKEN_INVALID");
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export class ReturnsSecurityError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("The return session is invalid or expired.");
    this.name = "ReturnsSecurityError";
    this.code = code;
  }
}
