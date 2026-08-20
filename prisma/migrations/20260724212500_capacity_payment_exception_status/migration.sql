-- Preserve paid capacity checkouts that OrderPRO could not fulfill as a
-- distinct terminal state. This migration does not enable checkout or writes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TYPE "CheckoutAttemptStatus"
  ADD VALUE IF NOT EXISTS 'PAYMENT_EXCEPTION';

COMMIT;

-- PostgreSQL requires the new enum value to be committed before a constraint
-- can reference it. The existing snapshot constraint then proves that the
-- payment ID and its operational evidence are the canonical pair.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CheckoutAttempt_payment_exception_evidence_check'
      AND conrelid = '"CheckoutAttempt"'::REGCLASS
  ) THEN
    ALTER TABLE "CheckoutAttempt"
      ADD CONSTRAINT "CheckoutAttempt_payment_exception_evidence_check"
        CHECK (
          "status" <> 'PAYMENT_EXCEPTION'
          OR COALESCE((
            "fulfillmentMode" IN ('PICKUP', 'LOCAL_DELIVERY')
            AND "orderproCapacityHoldId" IS NOT NULL
            AND "orderproShippingOrderId" IS NULL
            AND "capacitySquarePaymentId" IS NOT NULL
            AND "capacityPaymentSnapshot" IS NOT NULL
            AND "capacityPaymentRecordedAt" IS NOT NULL
          ), FALSE)
        ) NOT VALID;
  END IF;
END
$migration$;

ALTER TABLE "CheckoutAttempt"
  VALIDATE CONSTRAINT "CheckoutAttempt_payment_exception_evidence_check";

COMMIT;
