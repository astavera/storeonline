-- Preserve every delivery decision inside the immutable version snapshot.
ALTER TABLE "DeliveryZoneVersion"
ADD COLUMN "maxDistanceMiles" DECIMAL(65,30),
ADD COLUMN "maxRouteMinutes" INTEGER,
ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

-- Existing rows, if any, inherit the values that were previously stored only
-- on the mutable zone record. New writes must populate the snapshot directly.
UPDATE "DeliveryZoneVersion" AS version
SET
  "maxDistanceMiles" = zone."maxDistanceMiles",
  "maxRouteMinutes" = zone."maxRouteMinutes",
  "priority" = zone."priority"
FROM "DeliveryZone" AS zone
WHERE zone."id" = version."deliveryZoneId";

ALTER TABLE "DeliveryZoneVersion"
ADD CONSTRAINT "DeliveryZoneVersion_route_limits_check"
CHECK (
  ("maxDistanceMiles" IS NULL OR "maxDistanceMiles" >= 0)
  AND ("maxRouteMinutes" IS NULL OR "maxRouteMinutes" >= 0)
) NOT VALID;

ALTER TABLE "DeliveryZoneVersion"
VALIDATE CONSTRAINT "DeliveryZoneVersion_route_limits_check";
