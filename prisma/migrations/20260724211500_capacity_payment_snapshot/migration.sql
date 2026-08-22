-- Persist the first trusted COMPLETED Square payment observation for a
-- capacity checkout. This migration does not enable checkout or payments.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE "CheckoutAttempt"
  ADD COLUMN "capacitySquarePaymentId" TEXT,
  ADD COLUMN "capacityPaymentSnapshot" JSONB,
  ADD COLUMN "capacityPaymentRecordedAt" TIMESTAMP(3);

ALTER TABLE "CheckoutAttempt"
  ADD CONSTRAINT "CheckoutAttempt_capacity_payment_snapshot_complete_check"
    CHECK (
      (
        "capacitySquarePaymentId" IS NULL
        AND "capacityPaymentSnapshot" IS NULL
        AND "capacityPaymentRecordedAt" IS NULL
      )
      OR COALESCE((
        "capacitySquarePaymentId" IS NOT NULL
        AND "capacityPaymentSnapshot" IS NOT NULL
        AND "capacityPaymentRecordedAt" IS NOT NULL
        AND "orderproCapacityHoldId" IS NOT NULL
        AND "orderproShippingOrderId" IS NULL
        AND "fulfillmentMode" IN ('PICKUP', 'LOCAL_DELIVERY')
        AND "squareOrderId" IS NOT NULL
        AND "squarePaymentLinkId" IS NOT NULL
        AND "hostedCheckoutCreatedAt" IS NOT NULL
        AND JSONB_TYPEOF("capacityPaymentSnapshot") = 'object'
        AND "capacityPaymentSnapshot" ?& ARRAY[
          'checkoutAttemptId',
          'orderproCapacityHoldId',
          'fulfillmentMode',
          'squareOrderId',
          'squarePaymentId',
          'squareLocationId',
          'squareCustomerId',
          'paidAt',
          'amountPaidCents',
          'currency',
          'customer'
        ]
        AND (
          "capacityPaymentSnapshot"
            - 'checkoutAttemptId'
            - 'orderproCapacityHoldId'
            - 'fulfillmentMode'
            - 'squareOrderId'
            - 'squarePaymentId'
            - 'squareLocationId'
            - 'squareCustomerId'
            - 'paidAt'
            - 'amountPaidCents'
            - 'currency'
            - 'customer'
        ) = '{}'::JSONB
        AND JSONB_TYPEOF("capacityPaymentSnapshot" -> 'checkoutAttemptId')
          = 'string'
        AND JSONB_TYPEOF(
          "capacityPaymentSnapshot" -> 'orderproCapacityHoldId'
        ) = 'string'
        AND JSONB_TYPEOF("capacityPaymentSnapshot" -> 'fulfillmentMode')
          = 'string'
        AND JSONB_TYPEOF("capacityPaymentSnapshot" -> 'squareOrderId')
          = 'string'
        AND JSONB_TYPEOF("capacityPaymentSnapshot" -> 'squarePaymentId')
          = 'string'
        AND JSONB_TYPEOF("capacityPaymentSnapshot" -> 'currency') = 'string'
        AND "capacityPaymentSnapshot" ->> 'checkoutAttemptId'
          ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$'
        AND "capacityPaymentSnapshot" ->> 'orderproCapacityHoldId'
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND "capacityPaymentSnapshot" ->> 'squareOrderId'
          ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$'
        AND "capacityPaymentSnapshot" ->> 'squarePaymentId'
          ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$'
        AND "capacityPaymentSnapshot" ->> 'squareLocationId'
          ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$'
        AND "capacityPaymentSnapshot" ->> 'checkoutAttemptId' = "id"
        AND "capacityPaymentSnapshot" ->> 'orderproCapacityHoldId'
          = "orderproCapacityHoldId"
        AND "capacityPaymentSnapshot" ->> 'fulfillmentMode'
          = "fulfillmentMode"::TEXT
        AND "capacityPaymentSnapshot" ->> 'squareOrderId' = "squareOrderId"
        AND "capacityPaymentSnapshot" ->> 'squarePaymentId'
          = "capacitySquarePaymentId"
        AND "capacityPaymentSnapshot" ->> 'currency' = 'USD'
        AND JSONB_TYPEOF("capacityPaymentSnapshot" -> 'squareLocationId')
          = 'string'
        AND JSONB_TYPEOF("capacityContext") = 'object'
        AND "capacityPaymentSnapshot" ->> 'squareLocationId'
          = "capacityContext" ->> 'squareLocationId'
        AND JSONB_TYPEOF("capacityPaymentSnapshot" -> 'squareCustomerId')
          IN ('string', 'null')
        AND (
          JSONB_TYPEOF("capacityPaymentSnapshot" -> 'squareCustomerId')
            = 'null'
          OR "capacityPaymentSnapshot" ->> 'squareCustomerId'
            ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$'
        )
        AND JSONB_TYPEOF("capacityPaymentSnapshot" -> 'paidAt') = 'string'
        AND CASE
          WHEN "capacityPaymentSnapshot" ->> 'paidAt'
            ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
            THEN (
              "capacityPaymentSnapshot" ->> 'paidAt'
            )::TIMESTAMPTZ IS NOT NULL
          ELSE FALSE
        END
        AND JSONB_TYPEOF("capacityPaymentSnapshot" -> 'amountPaidCents')
          = 'number'
        AND "capacityPaymentSnapshot" ->> 'amountPaidCents' ~ '^[0-9]+$'
        AND ("capacityPaymentSnapshot" ->> 'amountPaidCents')::NUMERIC
          BETWEEN 0 AND 100000000
        AND JSONB_TYPEOF("capacityPaymentSnapshot" -> 'customer') = 'object'
        AND ("capacityPaymentSnapshot" -> 'customer')
          ?& ARRAY['name', 'email', 'phone', 'address']
        AND (
          ("capacityPaymentSnapshot" -> 'customer')
            - 'name'
            - 'email'
            - 'phone'
            - 'address'
        ) = '{}'::JSONB
        AND JSONB_TYPEOF(
          "capacityPaymentSnapshot" -> 'customer' -> 'name'
        ) = 'string'
        AND CHAR_LENGTH(BTRIM(
          "capacityPaymentSnapshot" -> 'customer' ->> 'name'
        )) BETWEEN 2 AND 120
        AND JSONB_TYPEOF(
          "capacityPaymentSnapshot" -> 'customer' -> 'email'
        ) = 'string'
        AND CHAR_LENGTH(BTRIM(
          "capacityPaymentSnapshot" -> 'customer' ->> 'email'
        )) BETWEEN 3 AND 254
        AND BTRIM("capacityPaymentSnapshot" -> 'customer' ->> 'email')
          ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        AND JSONB_TYPEOF(
          "capacityPaymentSnapshot" -> 'customer' -> 'phone'
        ) = 'string'
        AND CHAR_LENGTH(BTRIM(
          "capacityPaymentSnapshot" -> 'customer' ->> 'phone'
        )) BETWEEN 7 AND 40
        AND (
          CASE
            WHEN "fulfillmentMode" = 'PICKUP'
              THEN "capacityPaymentSnapshot" -> 'customer' -> 'address'
                = 'null'::JSONB
            WHEN "fulfillmentMode" = 'LOCAL_DELIVERY'
              THEN COALESCE(
                JSONB_TYPEOF(
                  "capacityPaymentSnapshot" -> 'customer' -> 'address'
                ) = 'object'
                AND (
                  "capacityPaymentSnapshot" -> 'customer' -> 'address'
                ) ?& ARRAY[
                  'line1',
                  'line2',
                  'city',
                  'state',
                  'postalCode',
                  'country'
                ]
                AND (
                  ("capacityPaymentSnapshot" -> 'customer' -> 'address')
                    - 'line1'
                    - 'line2'
                    - 'city'
                    - 'state'
                    - 'postalCode'
                    - 'country'
                ) = '{}'::JSONB
                AND JSONB_TYPEOF(
                  "capacityPaymentSnapshot"
                    -> 'customer'
                    -> 'address'
                    -> 'line1'
                ) = 'string'
                AND CHAR_LENGTH(BTRIM(
                  "capacityPaymentSnapshot"
                    -> 'customer'
                    -> 'address'
                    ->> 'line1'
                )) BETWEEN 3 AND 160
                AND JSONB_TYPEOF(
                  "capacityPaymentSnapshot"
                    -> 'customer'
                    -> 'address'
                    -> 'line2'
                ) IN ('string', 'null')
                AND (
                  JSONB_TYPEOF(
                    "capacityPaymentSnapshot"
                      -> 'customer'
                      -> 'address'
                      -> 'line2'
                  ) = 'null'
                  OR CHAR_LENGTH(BTRIM(
                    "capacityPaymentSnapshot"
                      -> 'customer'
                      -> 'address'
                      ->> 'line2'
                  )) BETWEEN 1 AND 80
                )
                AND JSONB_TYPEOF(
                  "capacityPaymentSnapshot"
                    -> 'customer'
                    -> 'address'
                    -> 'city'
                ) = 'string'
                AND CHAR_LENGTH(BTRIM(
                  "capacityPaymentSnapshot"
                    -> 'customer'
                    -> 'address'
                    ->> 'city'
                )) BETWEEN 2 AND 80
                AND JSONB_TYPEOF(
                  "capacityPaymentSnapshot"
                    -> 'customer'
                    -> 'address'
                    -> 'state'
                ) = 'string'
                AND (
                  "capacityPaymentSnapshot"
                    -> 'customer'
                    -> 'address'
                    ->> 'state'
                ) ~ '^[A-Z]{2}$'
                AND JSONB_TYPEOF(
                  "capacityPaymentSnapshot"
                    -> 'customer'
                    -> 'address'
                    -> 'postalCode'
                ) = 'string'
                AND (
                  "capacityPaymentSnapshot"
                    -> 'customer'
                    -> 'address'
                    ->> 'postalCode'
                ) ~ '^[0-9]{5}(-[0-9]{4})?$'
                AND JSONB_TYPEOF(
                  "capacityPaymentSnapshot"
                    -> 'customer'
                    -> 'address'
                    -> 'country'
                ) = 'string'
                AND (
                  "capacityPaymentSnapshot"
                    -> 'customer'
                    -> 'address'
                    ->> 'country'
                ) = 'US',
                FALSE
              )
            ELSE FALSE
          END
        )
      ), FALSE)
    ) NOT VALID;

ALTER TABLE "CheckoutAttempt"
  VALIDATE CONSTRAINT "CheckoutAttempt_capacity_payment_snapshot_complete_check";

COMMIT;
