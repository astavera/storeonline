-- Minimal durable correlation for Pickup and Local Delivery capacity checkouts.
-- Runtime mutation privileges are added separately after the least-privilege
-- SECURITY DEFINER boundary is verified; this migration grants nothing.
ALTER TABLE "CheckoutAttempt"
  ADD COLUMN "squarePaymentId" TEXT,
  ADD COLUMN "orderproCapacityHoldId" UUID,
  ADD COLUMN "fulfillmentContext" JSONB;

CREATE UNIQUE INDEX "CheckoutAttempt_squarePaymentId_key"
  ON "CheckoutAttempt" ("squarePaymentId");

CREATE UNIQUE INDEX "CheckoutAttempt_orderproCapacityHoldId_key"
  ON "CheckoutAttempt" ("orderproCapacityHoldId");
