-- Adds the internal warehouse to the canonical location directory used by
-- Store Admin and Operations access assignments. It remains storefront-hidden.
INSERT INTO "StoreLocation" (
  "id",
  "slug",
  "name",
  "address",
  "locality",
  "phone",
  "hours",
  "notes",
  "publicVisible",
  "displayOrder",
  "pickupEnabled",
  "localDeliveryEnabled",
  "shippingFulfillmentEnabled",
  "createdAt",
  "updatedAt"
)
VALUES (
  'warehouse',
  'warehouse',
  'Warehouse',
  'To be configured',
  'Shipping fulfillment outside NYC and local delivery zones',
  NULL,
  'Internal operations only',
  'Internal Operations warehouse. Address and external location mapping must be configured before fulfillment launch.',
  false,
  2,
  false,
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "address" = EXCLUDED."address",
  "locality" = EXCLUDED."locality",
  "phone" = EXCLUDED."phone",
  "hours" = EXCLUDED."hours",
  "notes" = EXCLUDED."notes",
  "publicVisible" = EXCLUDED."publicVisible",
  "displayOrder" = EXCLUDED."displayOrder",
  "pickupEnabled" = EXCLUDED."pickupEnabled",
  "localDeliveryEnabled" = EXCLUDED."localDeliveryEnabled",
  "shippingFulfillmentEnabled" = EXCLUDED."shippingFulfillmentEnabled",
  "archivedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;
