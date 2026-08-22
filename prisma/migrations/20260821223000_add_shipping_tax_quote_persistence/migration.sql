-- Adds destination-tax quote persistence and immutable Square financial fields.
-- This migration is intentionally additive and does not seed nexus decisions.

CREATE TYPE "TaxQuoteStatus" AS ENUM (
  'ACTIVE',
  'CONSUMED',
  'EXPIRED',
  'INVALIDATED'
);

CREATE TYPE "TaxApplicationMode" AS ENUM (
  'SQUARE_CATALOG_AUTO',
  'EXPLICIT_DESTINATION_TAX'
);

CREATE TYPE "TaxNexusDecision" AS ENUM (
  'COLLECT',
  'DO_NOT_COLLECT',
  'UNKNOWN'
);

CREATE TABLE "TaxNexusRule" (
  "id" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "stateCode" TEXT NOT NULL,
  "decision" "TaxNexusDecision" NOT NULL,
  "provider" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "source" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveUntil" TIMESTAMP(3),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxNexusRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaxNexusRule_version_check" CHECK ("version" > 0),
  CONSTRAINT "TaxNexusRule_effective_window_check" CHECK (
    "effectiveUntil" IS NULL OR "effectiveUntil" > "effectiveFrom"
  )
);

CREATE TABLE "TaxQuote" (
  "id" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "signatureVersion" INTEGER NOT NULL DEFAULT 1,
  "status" "TaxQuoteStatus" NOT NULL DEFAULT 'ACTIVE',
  "fulfillmentMode" "FulfillmentMode" NOT NULL,
  "applicationMode" "TaxApplicationMode" NOT NULL,
  "provider" TEXT NOT NULL,
  "providerQuoteId" TEXT,
  "providerTransactionId" TEXT,
  "providerReportedAt" TIMESTAMP(3),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "nexusDecision" "TaxNexusDecision" NOT NULL,
  "nexusRuleId" TEXT,
  "originSnapshot" JSONB NOT NULL,
  "destinationSnapshot" JSONB NOT NULL,
  "jurisdictionSnapshot" JSONB,
  "cartHash" TEXT NOT NULL,
  "destinationHash" TEXT NOT NULL,
  "originHash" TEXT NOT NULL,
  "calculationHash" TEXT NOT NULL,
  "shippingQuoteId" TEXT,
  "shippingRateId" TEXT,
  "merchandiseSubtotalCents" INTEGER NOT NULL,
  "discountCents" INTEGER NOT NULL,
  "shippingFeeCents" INTEGER NOT NULL,
  "deliveryFeeCents" INTEGER NOT NULL,
  "taxableMerchandiseCents" INTEGER NOT NULL,
  "taxableShippingFeeCents" INTEGER NOT NULL,
  "taxableDeliveryFeeCents" INTEGER NOT NULL,
  "merchandiseTaxCents" INTEGER NOT NULL,
  "shippingTaxCents" INTEGER NOT NULL,
  "deliveryFeeTaxCents" INTEGER NOT NULL,
  "totalTaxCents" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "requestSnapshot" JSONB NOT NULL,
  "responseSnapshot" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "invalidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxQuote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaxQuote_version_check" CHECK ("version" > 0),
  CONSTRAINT "TaxQuote_signature_version_check" CHECK ("signatureVersion" > 0),
  CONSTRAINT "TaxQuote_amounts_check" CHECK (
    "merchandiseSubtotalCents" >= 0
    AND "discountCents" >= 0
    AND "shippingFeeCents" >= 0
    AND "deliveryFeeCents" >= 0
    AND "taxableMerchandiseCents" >= 0
    AND "taxableShippingFeeCents" >= 0
    AND "taxableDeliveryFeeCents" >= 0
    AND "merchandiseTaxCents" >= 0
    AND "shippingTaxCents" >= 0
    AND "deliveryFeeTaxCents" >= 0
    AND "totalTaxCents" >= 0
    AND "totalCents" >= 0
    AND "taxableMerchandiseCents" <= "merchandiseSubtotalCents"
    AND "taxableShippingFeeCents" <= "shippingFeeCents"
    AND "taxableDeliveryFeeCents" <= "deliveryFeeCents"
    AND "totalTaxCents" = "merchandiseTaxCents" + "shippingTaxCents" + "deliveryFeeTaxCents"
    AND "totalCents" = "merchandiseSubtotalCents" + "shippingFeeCents" + "deliveryFeeCents" + "totalTaxCents"
  )
);

ALTER TABLE "CheckoutAttempt"
  ADD COLUMN "taxQuoteId" TEXT,
  ADD COLUMN "taxContext" JSONB;

ALTER TABLE "ProductOverride"
  ADD COLUMN "stripeTaxCode" TEXT;

ALTER TABLE "OrderMirror"
  ADD COLUMN "estimatedMerchandiseSubtotalCents" INTEGER,
  ADD COLUMN "estimatedDiscountCents" INTEGER,
  ADD COLUMN "estimatedShippingFeeCents" INTEGER,
  ADD COLUMN "estimatedDeliveryFeeCents" INTEGER,
  ADD COLUMN "estimatedMerchandiseTaxCents" INTEGER,
  ADD COLUMN "estimatedShippingTaxCents" INTEGER,
  ADD COLUMN "estimatedDeliveryFeeTaxCents" INTEGER,
  ADD COLUMN "estimatedTotalTaxCents" INTEGER,
  ADD COLUMN "estimatedTotalCents" INTEGER,
  ADD COLUMN "finalMerchandiseSubtotalCents" INTEGER,
  ADD COLUMN "finalDiscountCents" INTEGER,
  ADD COLUMN "finalShippingFeeCents" INTEGER,
  ADD COLUMN "finalDeliveryFeeCents" INTEGER,
  ADD COLUMN "finalMerchandiseTaxCents" INTEGER,
  ADD COLUMN "finalShippingTaxCents" INTEGER,
  ADD COLUMN "finalDeliveryFeeTaxCents" INTEGER,
  ADD COLUMN "finalTotalTaxCents" INTEGER,
  ADD COLUMN "finalTotalCents" INTEGER,
  ADD COLUMN "taxProvider" TEXT,
  ADD COLUMN "taxApplicationMode" "TaxApplicationMode",
  ADD COLUMN "squareTaxSnapshot" JSONB,
  ADD COLUMN "squareFinancialSnapshot" JSONB,
  ADD COLUMN "taxReconciledAt" TIMESTAMP(3);

ALTER TABLE "OrderItemMirror"
  ADD COLUMN "squareLineItemUid" TEXT,
  ADD COLUMN "finalGrossSalesCents" INTEGER,
  ADD COLUMN "finalDiscountCents" INTEGER,
  ADD COLUMN "finalTaxableAmountCents" INTEGER,
  ADD COLUMN "finalTaxCents" INTEGER,
  ADD COLUMN "finalNetTotalCents" INTEGER,
  ADD COLUMN "squareAppliedTaxes" JSONB,
  ADD COLUMN "squareAppliedDiscounts" JSONB,
  ADD COLUMN "squareFinancialSnapshot" JSONB;

CREATE UNIQUE INDEX "TaxNexusRule_jurisdiction_version_key"
  ON "TaxNexusRule" ("countryCode", "stateCode", "version");

CREATE INDEX "TaxNexusRule_active_jurisdiction_idx"
  ON "TaxNexusRule" ("countryCode", "stateCode", "enabled", "effectiveFrom", "effectiveUntil");

CREATE INDEX "TaxQuote_status_expiresAt_idx"
  ON "TaxQuote" ("status", "expiresAt");

CREATE INDEX "TaxQuote_cartHash_destinationHash_expiresAt_idx"
  ON "TaxQuote" ("cartHash", "destinationHash", "expiresAt");

CREATE INDEX "TaxQuote_provider_providerQuoteId_idx"
  ON "TaxQuote" ("provider", "providerQuoteId");

CREATE UNIQUE INDEX "TaxQuote_providerTransactionId_key"
  ON "TaxQuote" ("providerTransactionId");

CREATE INDEX "TaxQuote_nexusRuleId_idx"
  ON "TaxQuote" ("nexusRuleId");

CREATE UNIQUE INDEX "CheckoutAttempt_taxQuoteId_key"
  ON "CheckoutAttempt" ("taxQuoteId");

CREATE INDEX "OrderItemMirror_squareLineItemUid_idx"
  ON "OrderItemMirror" ("squareLineItemUid");

ALTER TABLE "TaxQuote"
  ADD CONSTRAINT "TaxQuote_nexusRuleId_fkey"
  FOREIGN KEY ("nexusRuleId") REFERENCES "TaxNexusRule"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CheckoutAttempt"
  ADD CONSTRAINT "CheckoutAttempt_taxQuoteId_fkey"
  FOREIGN KEY ("taxQuoteId") REFERENCES "TaxQuote"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
