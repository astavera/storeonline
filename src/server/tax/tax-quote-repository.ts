/**
 * Persists short-lived destination-tax calculations and consumes each quote
 * atomically with one CheckoutAttempt.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError, requireDatabaseOrDevelopmentFallback } from "@/server/db/persistence-policy";
import { toPrismaJson } from "@/server/prisma-json";
import type { TaxQuoteTokenPayload } from "@/server/tax/tax-quote-token";
import type { TaxCalculationInput, TaxCalculationResult } from "@/server/tax/tax-types";

export type TaxQuoteCreationInput = {
  calculation: TaxCalculationInput;
  result: TaxCalculationResult;
  cartFingerprint: string;
  originFingerprint: string;
  destinationFingerprint: string;
  shippingRateFingerprint: string;
  calculationFingerprint: string;
  shippingRateId: string;
  expiresAt: Date;
};

export type TaxQuoteRecord = {
  id: string;
  status: "ACTIVE" | "CONSUMED" | "EXPIRED" | "INVALIDATED";
  checkoutAttemptId: string | null;
  fulfillmentMode: "SHIPPING";
  applicationMode: "EXPLICIT_DESTINATION_TAX";
  provider: "stripe_tax";
  providerQuoteId: string;
  providerTransactionId: string | null;
  nexusDecision: "COLLECT" | "DO_NOT_COLLECT";
  taxSource: "origin" | "destination" | null;
  cartFingerprint: string;
  originFingerprint: string;
  destinationFingerprint: string;
  shippingRateFingerprint: string;
  calculationFingerprint: string;
  shippingRateId: string;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxableMerchandiseCents: number;
  taxableShippingCents: number;
  merchandiseTaxCents: number;
  shippingTaxCents: number;
  totalTaxCents: number;
  totalCents: number;
  requestSnapshot: unknown;
  responseSnapshot: unknown;
  expiresAt: Date;
  consumedAt: Date | null;
};

export interface TaxQuoteRepository {
  create(input: TaxQuoteCreationInput): Promise<TaxQuoteRecord>;
  consumeForCheckout(input: {
    checkoutAttemptId: string;
    token: TaxQuoteTokenPayload;
    now?: Date;
  }): Promise<TaxQuoteRecord>;
  findForCheckoutAttempt(checkoutAttemptId: string): Promise<TaxQuoteRecord | null>;
  markProviderReported(input: {
    taxQuoteId: string;
    providerTransactionId: string;
    reportedAt?: Date;
  }): Promise<TaxQuoteRecord>;
}

export class TaxQuoteConflictError extends Error {
  constructor(readonly code: "TAX_QUOTE_NOT_FOUND" | "TAX_QUOTE_EXPIRED" | "TAX_QUOTE_MISMATCH" | "TAX_QUOTE_ALREADY_USED") {
    super(code);
    this.name = "TaxQuoteConflictError";
  }
}

export function getTaxQuoteRepository(): TaxQuoteRepository {
  const persistence = requireDatabaseOrDevelopmentFallback("Tax quote");
  return persistence === "database" ? prismaTaxQuoteRepository : developmentTaxQuoteRepository;
}

export class InMemoryTaxQuoteRepository implements TaxQuoteRepository {
  private readonly quotes = new Map<string, TaxQuoteRecord>();
  private sequence = 0;

  async create(input: TaxQuoteCreationInput) {
    const id = `tax-development-${++this.sequence}`;
    const record = creationToRecord(id, input);
    this.quotes.set(id, record);
    return record;
  }

  async consumeForCheckout(input: { checkoutAttemptId: string; token: TaxQuoteTokenPayload; now?: Date }) {
    const quote = this.quotes.get(input.token.taxQuoteId);
    if (!quote) throw new TaxQuoteConflictError("TAX_QUOTE_NOT_FOUND");
    assertQuoteMatchesToken(quote, input.token, input.now ?? new Date());
    if (quote.checkoutAttemptId && quote.checkoutAttemptId !== input.checkoutAttemptId) {
      throw new TaxQuoteConflictError("TAX_QUOTE_ALREADY_USED");
    }
    if (quote.status === "CONSUMED") return quote;
    const consumedAt = input.now ?? new Date();
    const consumed: TaxQuoteRecord = {
      ...quote,
      status: "CONSUMED",
      checkoutAttemptId: input.checkoutAttemptId,
      consumedAt
    };
    this.quotes.set(quote.id, consumed);
    return consumed;
  }

  async findForCheckoutAttempt(checkoutAttemptId: string) {
    return [...this.quotes.values()].find((quote) => quote.checkoutAttemptId === checkoutAttemptId) ?? null;
  }

  async markProviderReported(input: { taxQuoteId: string; providerTransactionId: string; reportedAt?: Date }) {
    const quote = this.quotes.get(input.taxQuoteId);
    if (!quote) throw new TaxQuoteConflictError("TAX_QUOTE_NOT_FOUND");
    if (quote.providerTransactionId && quote.providerTransactionId !== input.providerTransactionId) {
      throw new TaxQuoteConflictError("TAX_QUOTE_MISMATCH");
    }
    const updated = { ...quote, providerTransactionId: input.providerTransactionId };
    this.quotes.set(quote.id, updated);
    return updated;
  }
}

const developmentTaxQuoteRepository = new InMemoryTaxQuoteRepository();

const prismaTaxQuoteRepository: TaxQuoteRepository = {
  async create(input) {
    try {
      const created = await getPrismaClient().taxQuote.create({
        data: {
          fulfillmentMode: "SHIPPING",
          applicationMode: "EXPLICIT_DESTINATION_TAX",
          provider: input.result.provider,
          providerQuoteId: input.result.providerQuoteId,
          currency: input.result.currency,
          nexusDecision: input.result.nexusDecision,
          originSnapshot: toPrismaJson(input.calculation.origin),
          destinationSnapshot: toPrismaJson(input.calculation.destination),
          ...(input.result.jurisdiction ? { jurisdictionSnapshot: toPrismaJson(input.result.jurisdiction) } : {}),
          cartHash: input.cartFingerprint,
          destinationHash: input.destinationFingerprint,
          originHash: input.originFingerprint,
          calculationHash: input.calculationFingerprint,
          shippingQuoteId: input.shippingRateFingerprint,
          shippingRateId: input.shippingRateId,
          merchandiseSubtotalCents: input.result.subtotalCents,
          discountCents: input.calculation.lines.reduce((total, line) => total + line.discountCents, 0),
          shippingFeeCents: input.result.shippingCents,
          deliveryFeeCents: 0,
          taxableMerchandiseCents: input.result.taxableMerchandiseCents,
          taxableShippingFeeCents: input.result.taxableShippingCents,
          taxableDeliveryFeeCents: 0,
          merchandiseTaxCents: input.result.merchandiseTaxCents,
          shippingTaxCents: input.result.shippingTaxCents,
          deliveryFeeTaxCents: 0,
          totalTaxCents: input.result.totalTaxCents,
          totalCents: input.result.totalCents,
          requestSnapshot: toPrismaJson(input.calculation),
          responseSnapshot: toPrismaJson(input.result),
          expiresAt: input.expiresAt
        }
      });
      return databaseToRecord(created, null);
    } catch (error) {
      throw new PersistenceUnavailableError("Tax quote", { cause: error });
    }
  },

  async consumeForCheckout(input) {
    const now = input.now ?? new Date();
    try {
      return await getPrismaClient().$transaction(async (transaction) => {
        const [attempt, quote] = await Promise.all([
          transaction.checkoutAttempt.findUnique({ where: { id: input.checkoutAttemptId } }),
          transaction.taxQuote.findUnique({
            where: { id: input.token.taxQuoteId },
            include: { checkoutAttempt: { select: { id: true } } }
          })
        ]);
        if (!attempt || !quote) throw new TaxQuoteConflictError("TAX_QUOTE_NOT_FOUND");
        const record = databaseToRecord(quote, quote.checkoutAttempt?.id ?? null);
        assertQuoteMatchesToken(record, input.token, now);

        if (attempt.taxQuoteId === quote.id && record.checkoutAttemptId === attempt.id && quote.status === "CONSUMED") {
          return record;
        }
        if (attempt.taxQuoteId || record.checkoutAttemptId || quote.status !== "ACTIVE") {
          throw new TaxQuoteConflictError("TAX_QUOTE_ALREADY_USED");
        }

        const consumed = await transaction.taxQuote.updateMany({
          where: { id: quote.id, status: "ACTIVE", consumedAt: null, expiresAt: { gt: now } },
          data: { status: "CONSUMED", consumedAt: now }
        });
        if (consumed.count !== 1) throw new TaxQuoteConflictError("TAX_QUOTE_ALREADY_USED");

        const attached = await transaction.checkoutAttempt.updateMany({
          where: { id: attempt.id, taxQuoteId: null },
          data: {
            taxQuoteId: quote.id,
            taxContext: toPrismaJson(input.token)
          }
        });
        if (attached.count !== 1) throw new TaxQuoteConflictError("TAX_QUOTE_ALREADY_USED");

        return {
          ...record,
          status: "CONSUMED" as const,
          checkoutAttemptId: attempt.id,
          consumedAt: now
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof TaxQuoteConflictError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new TaxQuoteConflictError("TAX_QUOTE_ALREADY_USED");
      }
      throw new PersistenceUnavailableError("Tax quote consumption", { cause: error });
    }
  },

  async findForCheckoutAttempt(checkoutAttemptId) {
    try {
      const attempt = await getPrismaClient().checkoutAttempt.findUnique({
        where: { id: checkoutAttemptId },
        include: { taxQuote: true }
      });
      return attempt?.taxQuote ? databaseToRecord(attempt.taxQuote, attempt.id) : null;
    } catch (error) {
      throw new PersistenceUnavailableError("Tax quote reconciliation", { cause: error });
    }
  },

  async markProviderReported(input) {
    try {
      const existing = await getPrismaClient().taxQuote.findUnique({ where: { id: input.taxQuoteId } });
      if (!existing) throw new TaxQuoteConflictError("TAX_QUOTE_NOT_FOUND");
      if (existing.providerTransactionId && existing.providerTransactionId !== input.providerTransactionId) {
        throw new TaxQuoteConflictError("TAX_QUOTE_MISMATCH");
      }
      const updated = existing.providerTransactionId
        ? existing
        : await getPrismaClient().taxQuote.update({
            where: { id: input.taxQuoteId },
            data: {
              providerTransactionId: input.providerTransactionId,
              providerReportedAt: input.reportedAt ?? new Date()
            }
          });
      const attempt = await getPrismaClient().checkoutAttempt.findUnique({
        where: { taxQuoteId: input.taxQuoteId },
        select: { id: true }
      });
      return databaseToRecord(updated, attempt?.id ?? null);
    } catch (error) {
      if (error instanceof TaxQuoteConflictError) throw error;
      throw new PersistenceUnavailableError("Stripe Tax reporting", { cause: error });
    }
  }
};

function creationToRecord(id: string, input: TaxQuoteCreationInput): TaxQuoteRecord {
  return {
    id,
    status: "ACTIVE",
    checkoutAttemptId: null,
    fulfillmentMode: "SHIPPING",
    applicationMode: "EXPLICIT_DESTINATION_TAX",
    provider: "stripe_tax",
    providerQuoteId: input.result.providerQuoteId,
    providerTransactionId: null,
    nexusDecision: input.result.nexusDecision,
    taxSource: input.result.taxSource,
    cartFingerprint: input.cartFingerprint,
    originFingerprint: input.originFingerprint,
    destinationFingerprint: input.destinationFingerprint,
    shippingRateFingerprint: input.shippingRateFingerprint,
    calculationFingerprint: input.calculationFingerprint,
    shippingRateId: input.shippingRateId,
    subtotalCents: input.result.subtotalCents,
    discountCents: input.calculation.lines.reduce((total, line) => total + line.discountCents, 0),
    shippingCents: input.result.shippingCents,
    taxableMerchandiseCents: input.result.taxableMerchandiseCents,
    taxableShippingCents: input.result.taxableShippingCents,
    merchandiseTaxCents: input.result.merchandiseTaxCents,
    shippingTaxCents: input.result.shippingTaxCents,
    totalTaxCents: input.result.totalTaxCents,
    totalCents: input.result.totalCents,
    requestSnapshot: input.calculation,
    responseSnapshot: input.result,
    expiresAt: input.expiresAt,
    consumedAt: null
  };
}

function databaseToRecord(record: {
  id: string;
  status: "ACTIVE" | "CONSUMED" | "EXPIRED" | "INVALIDATED";
  fulfillmentMode: "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING";
  applicationMode: "SQUARE_CATALOG_AUTO" | "EXPLICIT_DESTINATION_TAX";
  provider: string;
  providerQuoteId: string | null;
  providerTransactionId: string | null;
  nexusDecision: "COLLECT" | "DO_NOT_COLLECT" | "UNKNOWN";
  responseSnapshot: unknown;
  requestSnapshot: unknown;
  cartHash: string;
  originHash: string;
  destinationHash: string;
  shippingQuoteId: string | null;
  calculationHash: string;
  shippingRateId: string | null;
  merchandiseSubtotalCents: number;
  discountCents: number;
  shippingFeeCents: number;
  taxableMerchandiseCents: number;
  taxableShippingFeeCents: number;
  merchandiseTaxCents: number;
  shippingTaxCents: number;
  totalTaxCents: number;
  totalCents: number;
  expiresAt: Date;
  consumedAt: Date | null;
}, checkoutAttemptId: string | null): TaxQuoteRecord {
  if (
    record.fulfillmentMode !== "SHIPPING" ||
    record.applicationMode !== "EXPLICIT_DESTINATION_TAX" ||
    record.provider !== "stripe_tax" ||
    !record.providerQuoteId ||
    (record.nexusDecision !== "COLLECT" && record.nexusDecision !== "DO_NOT_COLLECT") ||
    !record.shippingQuoteId ||
    !record.shippingRateId
  ) {
    throw new TaxQuoteConflictError("TAX_QUOTE_MISMATCH");
  }
  const response = record.responseSnapshot as { taxSource?: unknown };
  const taxSource = response?.taxSource;
  if (taxSource !== "origin" && taxSource !== "destination" && taxSource !== null) {
    throw new TaxQuoteConflictError("TAX_QUOTE_MISMATCH");
  }
  return {
    id: record.id,
    status: record.status,
    checkoutAttemptId,
    fulfillmentMode: "SHIPPING",
    applicationMode: "EXPLICIT_DESTINATION_TAX",
    provider: "stripe_tax",
    providerQuoteId: record.providerQuoteId,
    providerTransactionId: record.providerTransactionId,
    nexusDecision: record.nexusDecision,
    taxSource: taxSource as "origin" | "destination" | null,
    cartFingerprint: record.cartHash,
    originFingerprint: record.originHash,
    destinationFingerprint: record.destinationHash,
    shippingRateFingerprint: record.shippingQuoteId,
    calculationFingerprint: record.calculationHash,
    shippingRateId: record.shippingRateId,
    subtotalCents: record.merchandiseSubtotalCents,
    discountCents: record.discountCents,
    shippingCents: record.shippingFeeCents,
    taxableMerchandiseCents: record.taxableMerchandiseCents,
    taxableShippingCents: record.taxableShippingFeeCents,
    merchandiseTaxCents: record.merchandiseTaxCents,
    shippingTaxCents: record.shippingTaxCents,
    totalTaxCents: record.totalTaxCents,
    totalCents: record.totalCents,
    requestSnapshot: record.requestSnapshot,
    responseSnapshot: record.responseSnapshot,
    expiresAt: record.expiresAt,
    consumedAt: record.consumedAt
  };
}

export function assertQuoteMatchesToken(record: TaxQuoteRecord, token: TaxQuoteTokenPayload, now: Date) {
  if (record.expiresAt.getTime() <= now.getTime()) throw new TaxQuoteConflictError("TAX_QUOTE_EXPIRED");
  if (
    record.id !== token.taxQuoteId ||
    record.provider !== token.provider ||
    record.fulfillmentMode !== token.fulfillmentType ||
    record.applicationMode !== token.applicationMode ||
    record.nexusDecision !== token.nexusDecision ||
    record.taxSource !== token.taxSource ||
    record.cartFingerprint !== token.cartFingerprint ||
    record.originFingerprint !== token.originFingerprint ||
    record.destinationFingerprint !== token.destinationFingerprint ||
    record.shippingRateFingerprint !== token.shippingRateFingerprint ||
    record.calculationFingerprint !== token.calculationFingerprint ||
    record.subtotalCents !== token.subtotalCents ||
    record.shippingCents !== token.shippingCents ||
    record.merchandiseTaxCents !== token.merchandiseTaxCents ||
    record.shippingTaxCents !== token.shippingTaxCents ||
    record.totalTaxCents !== token.totalTaxCents ||
    record.totalCents !== token.totalCents ||
    record.expiresAt.toISOString() !== token.expiresAt
  ) {
    throw new TaxQuoteConflictError("TAX_QUOTE_MISMATCH");
  }
}
