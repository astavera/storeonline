-- Minimal durable correlation for Pickup and Local Delivery capacity checkouts.
-- Runtime mutation privileges are added separately after the least-privilege
-- SECURITY DEFINER boundary is verified; this migration grants nothing.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE "CheckoutAttempt"
  ADD COLUMN "squarePaymentId" TEXT,
  ADD COLUMN "fulfillmentContext" JSONB;

-- Preserve the evidence written by the isolated capacity canary. The legacy
-- columns remain immutable evidence while the general runtime uses the new
-- canonical fields.
UPDATE "CheckoutAttempt"
SET
  "squarePaymentId" = "capacitySquarePaymentId",
  "fulfillmentContext" = "capacityContext"
WHERE "orderproCapacityHoldId" IS NOT NULL;

CREATE UNIQUE INDEX "CheckoutAttempt_squarePaymentId_key"
  ON "CheckoutAttempt" ("squarePaymentId");

-- The canary constraint required every future writer to populate the legacy
-- capacityContext document. Replace it with the generalized context contract;
-- the UUID format, fulfillment-mode and Shipping exclusivity checks remain.
ALTER TABLE "CheckoutAttempt"
  DROP CONSTRAINT "CheckoutAttempt_capacity_correlation_complete_check",
  ADD CONSTRAINT "CheckoutAttempt_capacity_correlation_complete_check"
    CHECK (
      (
        "orderproCapacityHoldId" IS NULL
        AND "fulfillmentContext" IS NULL
      )
      OR (
        "orderproCapacityHoldId" IS NOT NULL
        AND "orderproCapacityHoldId"
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND JSONB_TYPEOF("fulfillmentContext") = 'object'
      )
    ) NOT VALID;

ALTER TABLE "CheckoutAttempt"
  VALIDATE CONSTRAINT "CheckoutAttempt_capacity_correlation_complete_check";

COMMIT;
