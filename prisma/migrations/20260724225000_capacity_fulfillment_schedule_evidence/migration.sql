-- Every new OrderPRO capacity correlation must preserve the exact schedule
-- sent to Square. Existing rows cannot be safely backfilled from payment
-- evidence, so deployment fails closed if any legacy capacity row exists.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CheckoutAttempt"
    WHERE "orderproCapacityHoldId" IS NOT NULL
      AND (
        NOT COALESCE(
          "capacityContext" ?& ARRAY['startsAt', 'endsAt'],
          FALSE
        )
        OR (
          "fulfillmentMode" = 'PICKUP'
          AND NOT COALESCE("capacityContext" ? 'pickupUntilAt', FALSE)
        )
        OR (
          "fulfillmentMode" = 'LOCAL_DELIVERY'
          AND COALESCE("capacityContext" ? 'pickupUntilAt', FALSE)
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Legacy capacity correlations lack canonical fulfillment schedule evidence';
  END IF;
END
$migration$;

ALTER TABLE "CheckoutAttempt"
  DROP CONSTRAINT "CheckoutAttempt_capacity_correlation_complete_check";

ALTER TABLE "CheckoutAttempt"
  ADD CONSTRAINT "CheckoutAttempt_capacity_correlation_complete_check"
    CHECK (
      (
        "orderproCapacityHoldId" IS NULL
        AND "capacityContext" IS NULL
      )
      OR (
        "orderproCapacityHoldId" IS NOT NULL
        AND "orderproCapacityHoldId"
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND COALESCE((
          JSONB_TYPEOF("capacityContext") = 'object'
          AND "capacityContext" ?& ARRAY[
            'orderproFulfillmentMode',
            'quoteId',
            'slotId',
            'storefrontLocationId',
            'orderproLocationId',
            'squareLocationId',
            'inventoryReservationId',
            'feeCents',
            'expiresAt',
            'startsAt',
            'endsAt'
          ]
          AND (
            (
              "fulfillmentMode" = 'PICKUP'
              AND "capacityContext" ? 'pickupUntilAt'
              AND (
                "capacityContext"
                  - 'orderproFulfillmentMode'
                  - 'quoteId'
                  - 'slotId'
                  - 'storefrontLocationId'
                  - 'orderproLocationId'
                  - 'squareLocationId'
                  - 'inventoryReservationId'
                  - 'feeCents'
                  - 'expiresAt'
                  - 'startsAt'
                  - 'endsAt'
                  - 'pickupUntilAt'
              ) = '{}'::JSONB
              AND "capacityContext" ->> 'orderproFulfillmentMode' = 'PICKUP'
              AND JSONB_TYPEOF(
                "capacityContext" -> 'orderproFulfillmentMode'
              ) = 'string'
              AND JSONB_TYPEOF("capacityContext" -> 'pickupUntilAt')
                IN ('string', 'null')
              AND "capacityContext" ->> 'feeCents' = '0'
            )
            OR (
              "fulfillmentMode" = 'LOCAL_DELIVERY'
              AND NOT ("capacityContext" ? 'pickupUntilAt')
              AND (
                "capacityContext"
                  - 'orderproFulfillmentMode'
                  - 'quoteId'
                  - 'slotId'
                  - 'storefrontLocationId'
                  - 'orderproLocationId'
                  - 'squareLocationId'
                  - 'inventoryReservationId'
                  - 'feeCents'
                  - 'expiresAt'
                  - 'startsAt'
                  - 'endsAt'
              ) = '{}'::JSONB
              AND "capacityContext" ->> 'orderproFulfillmentMode'
                = 'WALKING_LOCAL_DELIVERY'
              AND JSONB_TYPEOF(
                "capacityContext" -> 'orderproFulfillmentMode'
              ) = 'string'
              AND ("capacityContext" ->> 'feeCents') ~ '^[0-9]+$'
              AND ("capacityContext" ->> 'feeCents')::BIGINT
                BETWEEN 0 AND 100000
            )
          )
          AND JSONB_TYPEOF("capacityContext" -> 'quoteId') = 'string'
          AND LENGTH("capacityContext" ->> 'quoteId') BETWEEN 1 AND 200
          AND JSONB_TYPEOF("capacityContext" -> 'slotId') = 'string'
          AND LENGTH("capacityContext" ->> 'slotId') BETWEEN 1 AND 200
          AND JSONB_TYPEOF(
            "capacityContext" -> 'storefrontLocationId'
          ) = 'string'
          AND LENGTH(
            "capacityContext" ->> 'storefrontLocationId'
          ) BETWEEN 1 AND 200
          AND JSONB_TYPEOF(
            "capacityContext" -> 'orderproLocationId'
          ) = 'string'
          AND LENGTH(
            "capacityContext" ->> 'orderproLocationId'
          ) BETWEEN 1 AND 200
          AND JSONB_TYPEOF(
            "capacityContext" -> 'squareLocationId'
          ) = 'string'
          AND LENGTH(
            "capacityContext" ->> 'squareLocationId'
          ) BETWEEN 1 AND 200
          AND JSONB_TYPEOF(
            "capacityContext" -> 'inventoryReservationId'
          ) = 'string'
          AND LENGTH(
            "capacityContext" ->> 'inventoryReservationId'
          ) BETWEEN 1 AND 200
          AND JSONB_TYPEOF("capacityContext" -> 'feeCents') = 'number'
          AND JSONB_TYPEOF("capacityContext" -> 'expiresAt') = 'string'
          AND JSONB_TYPEOF("capacityContext" -> 'startsAt') = 'string'
          AND JSONB_TYPEOF("capacityContext" -> 'endsAt') = 'string'
          AND CASE
            WHEN ("capacityContext" ->> 'expiresAt')
              ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
            THEN ("capacityContext" ->> 'expiresAt')::TIMESTAMPTZ
              = "expiresAt"
            ELSE FALSE
          END
          AND CASE
            WHEN
              ("capacityContext" ->> 'startsAt')
                ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
              AND ("capacityContext" ->> 'endsAt')
                ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
              AND (
                "fulfillmentMode" = 'LOCAL_DELIVERY'
                OR JSONB_TYPEOF("capacityContext" -> 'pickupUntilAt') = 'null'
                OR (
                  JSONB_TYPEOF("capacityContext" -> 'pickupUntilAt') = 'string'
                  AND ("capacityContext" ->> 'pickupUntilAt')
                    ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
                )
              )
            THEN
              ("capacityContext" ->> 'startsAt')::TIMESTAMPTZ
                < ("capacityContext" ->> 'endsAt')::TIMESTAMPTZ
              AND COALESCE(
                ("capacityContext" ->> 'pickupUntilAt')::TIMESTAMPTZ,
                ("capacityContext" ->> 'endsAt')::TIMESTAMPTZ
              ) >= ("capacityContext" ->> 'endsAt')::TIMESTAMPTZ
              AND COALESCE(
                ("capacityContext" ->> 'pickupUntilAt')::TIMESTAMPTZ,
                ("capacityContext" ->> 'endsAt')::TIMESTAMPTZ
              ) - ("capacityContext" ->> 'startsAt')::TIMESTAMPTZ
                BETWEEN INTERVAL '1 minute' AND INTERVAL '24 hours'
            ELSE FALSE
          END
        ), FALSE)
      )
    ) NOT VALID;

ALTER TABLE "CheckoutAttempt"
  VALIDATE CONSTRAINT "CheckoutAttempt_capacity_correlation_complete_check";

COMMIT;
