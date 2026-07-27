ALTER TYPE "CheckoutAttemptStatus" ADD VALUE 'COMPLETED';

ALTER TABLE "CheckoutAttempt"
  ADD COLUMN "fulfillmentMode" "FulfillmentMode",
  ADD COLUMN "squareOrderId" TEXT,
  ADD COLUMN "squarePaymentLinkId" TEXT,
  ADD COLUMN "orderproShippingOrderId" TEXT,
  ADD COLUMN "shippingContext" JSONB,
  ADD COLUMN "hostedCheckoutCreatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "CheckoutAttempt_squareOrderId_key"
  ON "CheckoutAttempt" ("squareOrderId");
CREATE UNIQUE INDEX "CheckoutAttempt_squarePaymentLinkId_key"
  ON "CheckoutAttempt" ("squarePaymentLinkId");
CREATE UNIQUE INDEX "CheckoutAttempt_orderproShippingOrderId_key"
  ON "CheckoutAttempt" ("orderproShippingOrderId");
CREATE INDEX "CheckoutAttempt_fulfillmentMode_hostedCheckoutCreatedAt_idx"
  ON "CheckoutAttempt" ("fulfillmentMode", "hostedCheckoutCreatedAt");
