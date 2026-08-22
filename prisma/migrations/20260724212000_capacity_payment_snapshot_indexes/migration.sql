-- The Sandbox rollout stops Storefront writers before migrations. Keep both
-- indexes atomic and bounded because Prisma submits multi-statement migration
-- files as one PostgreSQL batch with an implicit transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE UNIQUE INDEX
  "CheckoutAttempt_capacitySquarePaymentId_key"
  ON "CheckoutAttempt" ("capacitySquarePaymentId");

CREATE INDEX
  "CheckoutAttempt_capacity_payment_pending_idx"
  ON "CheckoutAttempt" ("status", "capacityPaymentRecordedAt")
  WHERE
    "capacityPaymentSnapshot" IS NOT NULL
    AND "status" IN ('VALIDATED', 'EXPIRED');

COMMIT;
