/** Persists the estimated/final shipping tax comparison without customer PII. */

import "server-only";

import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError, requireDatabaseOrDevelopmentFallback } from "@/server/db/persistence-policy";
import { toPrismaJson } from "@/server/prisma-json";
import type { SquareTaxReconciliationSnapshot } from "@/server/tax/square-tax-reconciliation";
import type { TaxQuoteRecord } from "@/server/tax/tax-quote-repository";

export async function persistFinalShippingTaxReconciliation(input: {
  squareOrderId: string;
  squarePaymentId: string;
  quote: TaxQuoteRecord;
  final: SquareTaxReconciliationSnapshot;
  reconciledAt?: Date;
}) {
  if (requireDatabaseOrDevelopmentFallback("Final shipping tax") !== "database") return;
  try {
    const data = {
      squarePaymentId: input.squarePaymentId,
      currency: "USD",
      totalMoney: toPrismaJson({ amount: input.final.totalCents, currency: "USD" }),
      status: "PAID",
      estimatedMerchandiseSubtotalCents: input.quote.subtotalCents,
      estimatedDiscountCents: input.quote.discountCents,
      estimatedShippingFeeCents: input.quote.shippingCents,
      estimatedDeliveryFeeCents: 0,
      estimatedMerchandiseTaxCents: input.quote.merchandiseTaxCents,
      estimatedShippingTaxCents: input.quote.shippingTaxCents,
      estimatedDeliveryFeeTaxCents: 0,
      estimatedTotalTaxCents: input.quote.totalTaxCents,
      estimatedTotalCents: input.quote.totalCents,
      finalMerchandiseSubtotalCents: input.final.merchandiseSubtotalCents,
      finalDiscountCents: input.final.discountCents,
      finalShippingFeeCents: input.final.shippingCents,
      finalDeliveryFeeCents: 0,
      finalMerchandiseTaxCents: input.final.merchandiseTaxCents,
      finalShippingTaxCents: input.final.shippingTaxCents,
      finalDeliveryFeeTaxCents: 0,
      finalTotalTaxCents: input.final.totalTaxCents,
      finalTotalCents: input.final.totalCents,
      taxProvider: input.quote.provider,
      taxApplicationMode: "EXPLICIT_DESTINATION_TAX" as const,
      squareTaxSnapshot: toPrismaJson(input.final),
      squareFinancialSnapshot: toPrismaJson({
        schemaVersion: input.final.schemaVersion,
        currency: input.final.currency,
        merchandiseSubtotalCents: input.final.merchandiseSubtotalCents,
        discountCents: input.final.discountCents,
        shippingCents: input.final.shippingCents,
        totalTaxCents: input.final.totalTaxCents,
        totalCents: input.final.totalCents
      }),
      taxReconciledAt: input.reconciledAt ?? new Date()
    };
    await getPrismaClient().orderMirror.upsert({
      where: { squareOrderId: input.squareOrderId },
      create: { squareOrderId: input.squareOrderId, ...data },
      update: data
    });
  } catch (error) {
    throw new PersistenceUnavailableError("Final shipping tax", { cause: error });
  }
}
