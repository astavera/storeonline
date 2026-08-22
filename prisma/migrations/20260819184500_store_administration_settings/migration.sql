-- Adds storefront presentation fields to the operational location record.
-- Existing rows remain public and keep their current fulfillment behavior.
ALTER TABLE "StoreLocation"
  ADD COLUMN "locality" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "hours" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "notes" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "publicVisible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "StoreLocation_publicVisible_archivedAt_displayOrder_idx"
  ON "StoreLocation"("publicVisible", "archivedAt", "displayOrder");

UPDATE "StoreLocation"
SET
  "locality" = 'Between 71st & 72nd Streets',
  "hours" = 'Monday-Sunday, 10:00am-7:00pm',
  "notes" = 'Primary published contact location from the legacy website.',
  "displayOrder" = 0
WHERE "id" = 'store-3rd-avenue';

UPDATE "StoreLocation"
SET
  "locality" = 'Between Park & Lexington Avenues',
  "hours" = 'Monday-Sunday, 10:00am-7:00pm',
  "notes" = 'Opened September 6, 2006 according to the legacy content map.',
  "displayOrder" = 1
WHERE "id" = 'store-86th-street';

UPDATE "StoreLocation"
SET
  "locality" = 'Shipping fulfillment outside NYC and local delivery zones',
  "hours" = 'Internal operations only',
  "notes" = 'Warehouse address and Square location mapping will be configured later.',
  "publicVisible" = false,
  "displayOrder" = 2
WHERE "slug" = 'warehouse';
