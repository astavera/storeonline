-- Store only the durable correlation to OrderPRO's authoritative capacity
-- reservation. Both columns are nullable so existing checkout attempts remain
-- valid and the change can be deployed before any application wiring.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE "CheckoutAttempt"
  ADD COLUMN "orderproCapacityHoldId" TEXT,
  ADD COLUMN "capacityContext" JSONB;

CREATE UNIQUE INDEX "CheckoutAttempt_orderproCapacityHoldId_key"
  ON "CheckoutAttempt" ("orderproCapacityHoldId");

ALTER TABLE "CheckoutAttempt"
  ADD CONSTRAINT "CheckoutAttempt_orderpro_reservation_exclusive_check"
    CHECK (
      NOT (
        "orderproShippingOrderId" IS NOT NULL
        AND "orderproCapacityHoldId" IS NOT NULL
      )
    ) NOT VALID,
  ADD CONSTRAINT "CheckoutAttempt_capacity_correlation_complete_check"
    CHECK (
      (
        "orderproCapacityHoldId" IS NULL
        AND "capacityContext" IS NULL
      )
      OR (
        "orderproCapacityHoldId" IS NOT NULL
        AND "orderproCapacityHoldId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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
            'expiresAt'
          ]
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
          ) = '{}'::JSONB
          AND JSONB_TYPEOF(
            "capacityContext" -> 'orderproFulfillmentMode'
          ) = 'string'
          AND (
            (
              "fulfillmentMode" = 'PICKUP'
              AND "capacityContext" ->> 'orderproFulfillmentMode' = 'PICKUP'
              AND "capacityContext" ->> 'feeCents' = '0'
            )
            OR (
              "fulfillmentMode" = 'LOCAL_DELIVERY'
              AND "capacityContext" ->> 'orderproFulfillmentMode'
                = 'WALKING_LOCAL_DELIVERY'
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
          AND CASE
            WHEN ("capacityContext" ->> 'expiresAt')
              ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
            THEN ("capacityContext" ->> 'expiresAt')::TIMESTAMPTZ
              = "expiresAt"
            ELSE FALSE
          END
        ), FALSE)
      )
    ) NOT VALID,
  ADD CONSTRAINT "CheckoutAttempt_capacity_fulfillment_mode_check"
    CHECK (
      "orderproCapacityHoldId" IS NULL
      OR (
        "fulfillmentMode" IS NOT NULL
        AND "fulfillmentMode" IN ('PICKUP', 'LOCAL_DELIVERY')
      )
    ) NOT VALID;

ALTER TABLE "CheckoutAttempt"
  VALIDATE CONSTRAINT "CheckoutAttempt_orderpro_reservation_exclusive_check";
ALTER TABLE "CheckoutAttempt"
  VALIDATE CONSTRAINT "CheckoutAttempt_capacity_correlation_complete_check";
ALTER TABLE "CheckoutAttempt"
  VALIDATE CONSTRAINT "CheckoutAttempt_capacity_fulfillment_mode_check";

COMMIT;
