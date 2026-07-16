-- Phase 0 operational hardening. Existing migrations remain immutable.
-- NOT VALID keeps unknown historical rows from blocking deployment while still
-- enforcing each invariant for all new or updated rows.

CREATE TYPE "CheckoutAttemptStatus" AS ENUM ('RECEIVED', 'VALIDATING', 'VALIDATED', 'REJECTED', 'EXPIRED');
CREATE TYPE "WebhookInboxStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER');
CREATE TYPE "CapacityHoldStatus" AS ENUM ('ACTIVE', 'CONFIRMED', 'RELEASED', 'EXPIRED');
CREATE TYPE "BalloonDraftStatus" AS ENUM ('DRAFT', 'QUOTED', 'EXPIRED', 'CONVERTED', 'CANCELLED');
CREATE TYPE "BalloonQuoteStatus" AS ENUM ('ACTIVE', 'ACCEPTED', 'EXPIRED', 'SUPERSEDED');

ALTER TABLE "OrderItemMirror" DROP CONSTRAINT "OrderItemMirror_orderId_fkey";
ALTER TABLE "FulfillmentTask" DROP CONSTRAINT "FulfillmentTask_orderId_fkey";
ALTER TABLE "DeliveryZone" DROP CONSTRAINT "DeliveryZone_locationId_fkey";
ALTER TABLE "SlotTemplate" DROP CONSTRAINT "SlotTemplate_locationId_fkey";
ALTER TABLE "SlotHold" DROP CONSTRAINT "SlotHold_slotTemplateId_fkey";
ALTER TABLE "SlotHold" DROP CONSTRAINT "SlotHold_cartId_fkey";
ALTER TABLE "SlotHold" DROP CONSTRAINT "SlotHold_orderId_fkey";

ALTER TABLE "OrderItemMirror" ADD CONSTRAINT "OrderItemMirror_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "OrderMirror"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FulfillmentTask" ADD CONSTRAINT "FulfillmentTask_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "OrderMirror"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlotTemplate" ADD CONSTRAINT "SlotTemplate_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_slotTemplateId_fkey"
FOREIGN KEY ("slotTemplateId") REFERENCES "SlotTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_cartId_fkey"
FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "OrderMirror"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_date_range_check"
CHECK ("startDate" <= "endDate") NOT VALID;
ALTER TABLE "ProductDepartmentAssignment" ADD CONSTRAINT "ProductDepartmentAssignment_sort_order_check"
CHECK ("sortOrder" >= 0) NOT VALID;
ALTER TABLE "ProductHolidayAssignment" ADD CONSTRAINT "ProductHolidayAssignment_sort_order_check"
CHECK ("sortOrder" >= 0) NOT VALID;
ALTER TABLE "WebsiteBrand" ADD CONSTRAINT "WebsiteBrand_sort_order_check"
CHECK ("sortOrder" >= 0) NOT VALID;
ALTER TABLE "ProductBrandAssignment" ADD CONSTRAINT "ProductBrandAssignment_sort_order_check"
CHECK ("sortOrder" >= 0) NOT VALID;
ALTER TABLE "ProductOverride" ADD CONSTRAINT "ProductOverride_capacity_check"
CHECK (("capacityPoints" IS NULL OR "capacityPoints" >= 0) AND ("prepTimeMinutes" IS NULL OR "prepTimeMinutes" >= 0)) NOT VALID;
ALTER TABLE "ProductOverride" ADD CONSTRAINT "ProductOverride_schedule_range_check"
CHECK ("scheduledPublishAt" IS NULL OR "scheduledUnpublishAt" IS NULL OR "scheduledPublishAt" <= "scheduledUnpublishAt") NOT VALID;
ALTER TABLE "ProductOverride" ADD CONSTRAINT "ProductOverride_visibility_status_check"
CHECK (NOT "webVisible" OR "webStatus" = 'PUBLISHED') NOT VALID;
ALTER TABLE "WebsiteProductPlacement" ADD CONSTRAINT "WebsiteProductPlacement_date_range_check"
CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" <= "endsAt") NOT VALID;
ALTER TABLE "WebsiteProductPlacement" ADD CONSTRAINT "WebsiteProductPlacement_sort_order_check"
CHECK ("sortOrder" >= 0) NOT VALID;
ALTER TABLE "CmsContentVersion" ADD CONSTRAINT "CmsContentVersion_version_check"
CHECK ("versionNumber" > 0) NOT VALID;
ALTER TABLE "CmsContentVersion" ADD CONSTRAINT "CmsContentVersion_schedule_range_check"
CHECK ("scheduledPublishAt" IS NULL OR "scheduledUnpublishAt" IS NULL OR "scheduledPublishAt" <= "scheduledUnpublishAt") NOT VALID;
ALTER TABLE "CmsContentVersion" ADD CONSTRAINT "CmsContentVersion_published_state_check"
CHECK ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL) NOT VALID;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_dimensions_check"
CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0)) NOT VALID;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_quantity_check"
CHECK ("quantity" > 0) NOT VALID;
ALTER TABLE "OrderItemMirror" ADD CONSTRAINT "OrderItemMirror_quantity_check"
CHECK ("quantity" > 0) NOT VALID;
ALTER TABLE "FulfillmentTask" ADD CONSTRAINT "FulfillmentTask_capacity_check"
CHECK ("capacityPoints" > 0) NOT VALID;
ALTER TABLE "FulfillmentTask" ADD CONSTRAINT "FulfillmentTask_address_mode_check"
CHECK (("mode" <> 'LOCAL_DELIVERY' OR "deliveryAddress" IS NOT NULL) AND ("mode" <> 'SHIPPING' OR "shippingAddress" IS NOT NULL)) NOT VALID;
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_nonnegative_values_check"
CHECK (
  "version" > 0 AND "baseFeeCents" >= 0 AND "minimumOrderCents" >= 0
  AND ("maxDistanceMiles" IS NULL OR "maxDistanceMiles" >= 0)
  AND ("maxRouteMinutes" IS NULL OR "maxRouteMinutes" >= 0)
  AND "cutoffMinutes" >= 0 AND "leadTimeMinutes" >= 0
) NOT VALID;
ALTER TABLE "SlotTemplate" ADD CONSTRAINT "SlotTemplate_values_check"
CHECK (
  "dayOfWeek" BETWEEN 0 AND 6 AND "capacityPoints" > 0
  AND "cutoffMinutes" >= 0 AND "leadTimeMinutes" >= 0
  AND "startTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "endTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "startTime" < "endTime"
) NOT VALID;
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_values_check"
CHECK (
  "capacityPoints" > 0 AND "expiresAt" > "createdAt"
  AND NOT ("confirmedAt" IS NOT NULL AND "releasedAt" IS NOT NULL)
  AND ("confirmedAt" IS NULL OR "confirmedAt" >= "createdAt")
  AND ("releasedAt" IS NULL OR "releasedAt" >= "createdAt")
) NOT VALID;
ALTER TABLE "ShippingRateQuote" ADD CONSTRAINT "ShippingRateQuote_values_check"
CHECK ("amountCents" >= 0 AND "expiresAt" > "createdAt") NOT VALID;

CREATE TABLE "CheckoutAttempt" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "cartId" TEXT,
  "requestHash" TEXT NOT NULL,
  "status" "CheckoutAttemptStatus" NOT NULL DEFAULT 'RECEIVED',
  "quote" JSONB,
  "validationErrors" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CheckoutAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CheckoutAttempt_expiry_check" CHECK ("expiresAt" > "createdAt")
);

CREATE TABLE "WebhookInboxEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "WebhookInboxStatus" NOT NULL DEFAULT 'RECEIVED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "error" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookInboxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebhookInboxEvent_state_check" CHECK (
    "attempts" >= 0 AND ("status" <> 'PROCESSED' OR "processedAt" IS NOT NULL)
  )
);

CREATE TABLE "SlotOccurrence" (
  "id" TEXT NOT NULL,
  "slotTemplateId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "capacityPoints" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SlotOccurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SlotOccurrence_values_check" CHECK ("capacityPoints" > 0 AND "startsAt" < "endsAt")
);

CREATE TABLE "CapacityHold" (
  "id" TEXT NOT NULL,
  "slotOccurrenceId" TEXT NOT NULL,
  "cartId" TEXT,
  "checkoutAttemptId" TEXT,
  "orderId" TEXT,
  "status" "CapacityHoldStatus" NOT NULL DEFAULT 'ACTIVE',
  "capacityPoints" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CapacityHold_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CapacityHold_owner_check" CHECK (num_nonnulls("cartId", "checkoutAttemptId", "orderId") = 1),
  CONSTRAINT "CapacityHold_values_check" CHECK (
    "capacityPoints" > 0 AND "expiresAt" > "createdAt"
    AND (("status" = 'ACTIVE' AND "confirmedAt" IS NULL AND "releasedAt" IS NULL)
      OR ("status" = 'CONFIRMED' AND "confirmedAt" IS NOT NULL AND "releasedAt" IS NULL)
      OR ("status" IN ('RELEASED', 'EXPIRED') AND "releasedAt" IS NOT NULL))
  )
);

CREATE TABLE "DeliveryZoneVersion" (
  "id" TEXT NOT NULL,
  "deliveryZoneId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "polygonGeojson" JSONB NOT NULL,
  "serviceMode" TEXT NOT NULL,
  "baseFeeCents" INTEGER NOT NULL,
  "minimumOrderCents" INTEGER NOT NULL,
  "activeDays" TEXT[],
  "cutoffMinutes" INTEGER NOT NULL,
  "leadTimeMinutes" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryZoneVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryZoneVersion_values_check" CHECK (
    "versionNumber" > 0 AND "baseFeeCents" >= 0 AND "minimumOrderCents" >= 0
    AND "cutoffMinutes" >= 0 AND "leadTimeMinutes" >= 0
    AND ("effectiveTo" IS NULL OR "effectiveFrom" < "effectiveTo")
  )
);

CREATE TABLE "DeliveryRateRule" (
  "id" TEXT NOT NULL,
  "zoneVersionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "minimumSubtotalCents" INTEGER,
  "maximumSubtotalCents" INTEGER,
  "feeCents" INTEGER NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryRateRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryRateRule_values_check" CHECK (
    "feeCents" >= 0 AND ("minimumSubtotalCents" IS NULL OR "minimumSubtotalCents" >= 0)
    AND ("maximumSubtotalCents" IS NULL OR "maximumSubtotalCents" >= 0)
    AND ("minimumSubtotalCents" IS NULL OR "maximumSubtotalCents" IS NULL OR "minimumSubtotalCents" <= "maximumSubtotalCents")
  )
);

CREATE TABLE "AddressEvaluation" (
  "id" TEXT NOT NULL,
  "zoneVersionId" TEXT,
  "addressHash" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "eligible" BOOLEAN NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "feeCents" INTEGER,
  "distanceMiles" DECIMAL(65,30),
  "routeMinutes" INTEGER,
  "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AddressEvaluation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AddressEvaluation_values_check" CHECK (
    ("feeCents" IS NULL OR "feeCents" >= 0) AND ("distanceMiles" IS NULL OR "distanceMiles" >= 0)
    AND ("routeMinutes" IS NULL OR "routeMinutes" >= 0) AND "expiresAt" > "evaluatedAt"
  )
);

CREATE TABLE "BalloonOrderDraft" (
  "id" TEXT NOT NULL,
  "publicTokenHash" TEXT NOT NULL,
  "status" "BalloonDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "locationId" TEXT,
  "fulfillmentMode" "FulfillmentMode",
  "customerContact" JSONB,
  "deliveryAddress" JSONB,
  "requestedFor" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BalloonOrderDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BalloonOrderDraft_values_check" CHECK (
    "expiresAt" > "createdAt" AND ("fulfillmentMode" <> 'LOCAL_DELIVERY' OR "deliveryAddress" IS NOT NULL)
  )
);

CREATE TABLE "BalloonDraftLine" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "squareVariationId" TEXT,
  "componentKey" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "configuration" JSONB NOT NULL,
  "capacityPoints" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BalloonDraftLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BalloonDraftLine_values_check" CHECK (
    length(btrim("componentKey")) > 0 AND "quantity" > 0 AND "capacityPoints" >= 0 AND "sortOrder" >= 0
  )
);

CREATE TABLE "BalloonQuote" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "BalloonQuoteStatus" NOT NULL DEFAULT 'ACTIVE',
  "subtotalCents" INTEGER NOT NULL,
  "feeCents" INTEGER NOT NULL DEFAULT 0,
  "taxCents" INTEGER NOT NULL DEFAULT 0,
  "totalCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "pricingSnapshot" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BalloonQuote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BalloonQuote_values_check" CHECK (
    "versionNumber" > 0 AND "subtotalCents" >= 0 AND "feeCents" >= 0 AND "taxCents" >= 0
    AND "totalCents" = "subtotalCents" + "feeCents" + "taxCents" AND "expiresAt" > "createdAt"
    AND (("status" = 'ACCEPTED' AND "acceptedAt" IS NOT NULL) OR ("status" <> 'ACCEPTED' AND "acceptedAt" IS NULL))
  )
);

CREATE UNIQUE INDEX "CheckoutAttempt_idempotencyKey_key" ON "CheckoutAttempt"("idempotencyKey");
CREATE INDEX "CheckoutAttempt_cartId_idx" ON "CheckoutAttempt"("cartId");
CREATE INDEX "CheckoutAttempt_status_expiresAt_idx" ON "CheckoutAttempt"("status", "expiresAt");
CREATE UNIQUE INDEX "WebhookInboxEvent_provider_eventId_key" ON "WebhookInboxEvent"("provider", "eventId");
CREATE INDEX "WebhookInboxEvent_status_receivedAt_idx" ON "WebhookInboxEvent"("status", "receivedAt");
CREATE UNIQUE INDEX "SlotOccurrence_slotTemplateId_startsAt_key" ON "SlotOccurrence"("slotTemplateId", "startsAt");
CREATE INDEX "SlotOccurrence_startsAt_active_idx" ON "SlotOccurrence"("startsAt", "active");
CREATE INDEX "CapacityHold_slotOccurrenceId_status_expiresAt_idx" ON "CapacityHold"("slotOccurrenceId", "status", "expiresAt");
CREATE INDEX "CapacityHold_cartId_idx" ON "CapacityHold"("cartId");
CREATE INDEX "CapacityHold_checkoutAttemptId_idx" ON "CapacityHold"("checkoutAttemptId");
CREATE INDEX "CapacityHold_orderId_idx" ON "CapacityHold"("orderId");
CREATE UNIQUE INDEX "DeliveryZoneVersion_deliveryZoneId_versionNumber_key" ON "DeliveryZoneVersion"("deliveryZoneId", "versionNumber");
CREATE INDEX "DeliveryZoneVersion_effectiveFrom_effectiveTo_idx" ON "DeliveryZoneVersion"("effectiveFrom", "effectiveTo");
CREATE INDEX "DeliveryRateRule_zoneVersionId_active_priority_idx" ON "DeliveryRateRule"("zoneVersionId", "active", "priority");
CREATE INDEX "AddressEvaluation_addressHash_evaluatedAt_idx" ON "AddressEvaluation"("addressHash", "evaluatedAt");
CREATE INDEX "AddressEvaluation_zoneVersionId_idx" ON "AddressEvaluation"("zoneVersionId");
CREATE UNIQUE INDEX "BalloonOrderDraft_publicTokenHash_key" ON "BalloonOrderDraft"("publicTokenHash");
CREATE INDEX "BalloonOrderDraft_status_expiresAt_idx" ON "BalloonOrderDraft"("status", "expiresAt");
CREATE INDEX "BalloonOrderDraft_locationId_idx" ON "BalloonOrderDraft"("locationId");
CREATE INDEX "BalloonDraftLine_draftId_sortOrder_idx" ON "BalloonDraftLine"("draftId", "sortOrder");
CREATE INDEX "BalloonDraftLine_squareVariationId_idx" ON "BalloonDraftLine"("squareVariationId");
CREATE UNIQUE INDEX "BalloonQuote_draftId_versionNumber_key" ON "BalloonQuote"("draftId", "versionNumber");
CREATE INDEX "BalloonQuote_status_expiresAt_idx" ON "BalloonQuote"("status", "expiresAt");

CREATE INDEX "SquareInventoryCount_squareLocationId_state_idx" ON "SquareInventoryCount"("squareLocationId", "state");
CREATE INDEX "Holiday_isActive_isVisible_startDate_endDate_idx" ON "Holiday"("isActive", "isVisible", "startDate", "endDate");
CREATE INDEX "WebsiteBrand_visible_sortOrder_idx" ON "WebsiteBrand"("visible", "sortOrder");
CREATE INDEX "ProductBrandAssignment_brandId_sortOrder_idx" ON "ProductBrandAssignment"("brandId", "sortOrder");
CREATE INDEX "ProductOverride_webStatus_webVisible_idx" ON "ProductOverride"("webStatus", "webVisible");
CREATE INDEX "WebsiteProductPlacement_placementType_placementTargetSlug_visible_sortOrder_idx" ON "WebsiteProductPlacement"("placementType", "placementTargetSlug", "visible", "sortOrder");
CREATE INDEX "MediaAsset_source_sourceId_idx" ON "MediaAsset"("source", "sourceId");
CREATE INDEX "OrderMirror_status_createdAt_idx" ON "OrderMirror"("status", "createdAt");
CREATE INDEX "FulfillmentTask_status_dueAt_idx" ON "FulfillmentTask"("status", "dueAt");
CREATE INDEX "DeliveryZone_locationId_active_priority_idx" ON "DeliveryZone"("locationId", "active", "priority");
CREATE INDEX "SlotTemplate_locationId_fulfillmentMode_active_dayOfWeek_idx" ON "SlotTemplate"("locationId", "fulfillmentMode", "active", "dayOfWeek");
CREATE INDEX "SlotHold_slotTemplateId_expiresAt_idx" ON "SlotHold"("slotTemplateId", "expiresAt");
CREATE INDEX "ShippingRateQuote_addressHash_expiresAt_idx" ON "ShippingRateQuote"("addressHash", "expiresAt");
CREATE INDEX "WebhookEvent_provider_receivedAt_idx" ON "WebhookEvent"("provider", "receivedAt");
CREATE INDEX "WebhookEvent_processedAt_idx" ON "WebhookEvent"("processedAt");

ALTER TABLE "CheckoutAttempt" ADD CONSTRAINT "CheckoutAttempt_cartId_fkey"
FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SlotOccurrence" ADD CONSTRAINT "SlotOccurrence_slotTemplateId_fkey"
FOREIGN KEY ("slotTemplateId") REFERENCES "SlotTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapacityHold" ADD CONSTRAINT "CapacityHold_slotOccurrenceId_fkey"
FOREIGN KEY ("slotOccurrenceId") REFERENCES "SlotOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapacityHold" ADD CONSTRAINT "CapacityHold_cartId_fkey"
FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapacityHold" ADD CONSTRAINT "CapacityHold_checkoutAttemptId_fkey"
FOREIGN KEY ("checkoutAttemptId") REFERENCES "CheckoutAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapacityHold" ADD CONSTRAINT "CapacityHold_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "OrderMirror"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryZoneVersion" ADD CONSTRAINT "DeliveryZoneVersion_deliveryZoneId_fkey"
FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRateRule" ADD CONSTRAINT "DeliveryRateRule_zoneVersionId_fkey"
FOREIGN KEY ("zoneVersionId") REFERENCES "DeliveryZoneVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AddressEvaluation" ADD CONSTRAINT "AddressEvaluation_zoneVersionId_fkey"
FOREIGN KEY ("zoneVersionId") REFERENCES "DeliveryZoneVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BalloonOrderDraft" ADD CONSTRAINT "BalloonOrderDraft_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BalloonDraftLine" ADD CONSTRAINT "BalloonDraftLine_draftId_fkey"
FOREIGN KEY ("draftId") REFERENCES "BalloonOrderDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BalloonDraftLine" ADD CONSTRAINT "BalloonDraftLine_squareVariationId_fkey"
FOREIGN KEY ("squareVariationId") REFERENCES "SquareItemVariation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BalloonQuote" ADD CONSTRAINT "BalloonQuote_draftId_fkey"
FOREIGN KEY ("draftId") REFERENCES "BalloonOrderDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
