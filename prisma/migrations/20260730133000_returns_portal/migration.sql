-- Adds the server-side returns policy mirror and audit trail. OrderPRO remains
-- the RMA, inspection, and inventory authority.

CREATE TYPE "ReturnRequestStatus" AS ENUM (
  'REQUESTED',
  'MANUAL_REVIEW',
  'AUTHORIZED',
  'LABEL_PENDING',
  'LABEL_CREATED',
  'DROPPED_OFF',
  'IN_TRANSIT',
  'DELIVERED_TO_WH01',
  'RECEIVED',
  'INSPECTING',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
  'REFUND_PENDING',
  'REFUNDED',
  'COMPLETED',
  'CANCELLED',
  'EXCEPTION'
);

CREATE TYPE "ReturnLineDecision" AS ENUM (
  'ELIGIBLE',
  'MANUAL_REVIEW',
  'INELIGIBLE',
  'AUTHORIZED',
  'APPROVED',
  'REJECTED'
);

CREATE TYPE "ReturnLabelPayer" AS ENUM (
  'COMPANY',
  'CUSTOMER',
  'PENDING_REVIEW'
);

ALTER TABLE "WebsiteBrand"
  ADD COLUMN "returnable" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ProductOverride"
  ADD COLUMN "returnPolicyTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "finalSale" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "packageLengthIn" DECIMAL(8,3),
  ADD COLUMN "packageWidthIn" DECIMAL(8,3),
  ADD COLUMN "packageHeightIn" DECIMAL(8,3),
  ADD COLUMN "packageWeightLb" DECIMAL(8,3);

CREATE TABLE "ReturnVerificationSession" (
  "id" TEXT NOT NULL,
  "publicTokenHash" TEXT NOT NULL,
  "orderReferenceHash" TEXT NOT NULL,
  "emailHash" TEXT NOT NULL,
  "postalCodeHash" TEXT NOT NULL,
  "orderProOrderId" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "orderSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReturnVerificationSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReturnVerificationSession_failedAttempts_check" CHECK ("failedAttempts" >= 0)
);

CREATE TABLE "ReturnRequest" (
  "id" TEXT NOT NULL,
  "rmaNumber" TEXT NOT NULL,
  "orderProRmaId" TEXT,
  "verificationSessionId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "orderProOrderId" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "status" "ReturnRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "policyVersion" TEXT NOT NULL,
  "businessTimeZone" TEXT NOT NULL,
  "confirmedDeliveryAt" TIMESTAMP(3),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "merchandiseRefundCents" INTEGER NOT NULL,
  "estimatedTaxRefundCents" INTEGER NOT NULL,
  "discountAdjustmentCents" INTEGER NOT NULL DEFAULT 0,
  "refundableOriginalFeesCents" INTEGER NOT NULL DEFAULT 0,
  "originalShippingCents" INTEGER NOT NULL DEFAULT 0,
  "originalLocalDeliveryCents" INTEGER NOT NULL DEFAULT 0,
  "labelPayer" "ReturnLabelPayer" NOT NULL,
  "acceptedLabelDeductionCents" INTEGER NOT NULL DEFAULT 0,
  "estimatedNetRefundCents" INTEGER NOT NULL,
  "quoteSnapshot" JSONB NOT NULL,
  "policyAcceptedAt" TIMESTAMP(3) NOT NULL,
  "conditionAcceptedAt" TIMESTAMP(3) NOT NULL,
  "labelDeductionAcceptedAt" TIMESTAMP(3),
  "shippoShipmentId" TEXT,
  "shippoRateId" TEXT,
  "shippoTransactionId" TEXT,
  "shippoCarrier" TEXT,
  "shippoServiceLevel" TEXT,
  "trackingNumber" TEXT,
  "labelCostCents" INTEGER,
  "labelCurrency" TEXT,
  "privateLabelUrl" TEXT,
  "labelExpiresAt" TIMESTAMP(3),
  "squarePaymentId" TEXT,
  "squareRefundId" TEXT,
  "squareRefundAmountCents" INTEGER,
  "squareRefundCurrency" TEXT,
  "squareRefundStatus" TEXT,
  "finalApprovedRefundCents" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReturnRequest_money_nonnegative_check" CHECK (
    "merchandiseRefundCents" >= 0
    AND "estimatedTaxRefundCents" >= 0
    AND "discountAdjustmentCents" >= 0
    AND "refundableOriginalFeesCents" >= 0
    AND "originalShippingCents" >= 0
    AND "originalLocalDeliveryCents" >= 0
    AND "acceptedLabelDeductionCents" >= 0
    AND "estimatedNetRefundCents" >= 0
  )
);

CREATE TABLE "ReturnRequestItem" (
  "id" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "orderLineId" TEXT NOT NULL,
  "squareVariationId" TEXT,
  "sku" TEXT,
  "upc" TEXT,
  "name" TEXT NOT NULL,
  "variant" TEXT,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "customerComment" TEXT,
  "evidenceReferences" JSONB NOT NULL,
  "decision" "ReturnLineDecision" NOT NULL,
  "decisionReason" TEXT,
  "declaredUnused" BOOLEAN NOT NULL,
  "declaredOriginalPackaging" BOOLEAN NOT NULL,
  "declaredSealUnopened" BOOLEAN NOT NULL,
  "partyOpened" BOOLEAN NOT NULL DEFAULT false,
  "merchandiseRefundCents" INTEGER NOT NULL,
  "estimatedTaxRefundCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReturnRequestItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReturnRequestItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "ReturnRequestItem_money_nonnegative_check" CHECK (
    "merchandiseRefundCents" >= 0 AND "estimatedTaxRefundCents" >= 0
  )
);

CREATE TABLE "ReturnStatusEvent" (
  "id" TEXT NOT NULL,
  "returnRequestId" TEXT NOT NULL,
  "status" "ReturnRequestStatus" NOT NULL,
  "source" TEXT NOT NULL,
  "externalEventId" TEXT,
  "details" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReturnVerificationSession_publicTokenHash_key" ON "ReturnVerificationSession"("publicTokenHash");
CREATE INDEX "ReturnVerificationSession_orderReferenceHash_createdAt_idx" ON "ReturnVerificationSession"("orderReferenceHash", "createdAt");
CREATE INDEX "ReturnVerificationSession_expiresAt_idx" ON "ReturnVerificationSession"("expiresAt");
CREATE UNIQUE INDEX "ReturnRequest_rmaNumber_key" ON "ReturnRequest"("rmaNumber");
CREATE UNIQUE INDEX "ReturnRequest_orderProRmaId_key" ON "ReturnRequest"("orderProRmaId");
CREATE UNIQUE INDEX "ReturnRequest_idempotencyKey_key" ON "ReturnRequest"("idempotencyKey");
CREATE UNIQUE INDEX "ReturnRequest_shippoTransactionId_key" ON "ReturnRequest"("shippoTransactionId");
CREATE UNIQUE INDEX "ReturnRequest_trackingNumber_key" ON "ReturnRequest"("trackingNumber");
CREATE UNIQUE INDEX "ReturnRequest_squareRefundId_key" ON "ReturnRequest"("squareRefundId");
CREATE INDEX "ReturnRequest_verificationSessionId_idx" ON "ReturnRequest"("verificationSessionId");
CREATE INDEX "ReturnRequest_orderProOrderId_createdAt_idx" ON "ReturnRequest"("orderProOrderId", "createdAt");
CREATE INDEX "ReturnRequest_status_updatedAt_idx" ON "ReturnRequest"("status", "updatedAt");
CREATE UNIQUE INDEX "ReturnRequestItem_returnRequestId_orderLineId_key" ON "ReturnRequestItem"("returnRequestId", "orderLineId");
CREATE INDEX "ReturnRequestItem_returnRequestId_idx" ON "ReturnRequestItem"("returnRequestId");
CREATE UNIQUE INDEX "ReturnStatusEvent_source_externalEventId_key" ON "ReturnStatusEvent"("source", "externalEventId");
CREATE INDEX "ReturnStatusEvent_returnRequestId_occurredAt_idx" ON "ReturnStatusEvent"("returnRequestId", "occurredAt");

ALTER TABLE "ReturnRequest"
  ADD CONSTRAINT "ReturnRequest_verificationSessionId_fkey"
  FOREIGN KEY ("verificationSessionId") REFERENCES "ReturnVerificationSession"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReturnRequestItem"
  ADD CONSTRAINT "ReturnRequestItem_returnRequestId_fkey"
  FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReturnStatusEvent"
  ADD CONSTRAINT "ReturnStatusEvent_returnRequestId_fkey"
  FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
