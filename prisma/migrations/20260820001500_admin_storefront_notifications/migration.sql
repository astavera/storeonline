-- Persist the per-administrator read cursor for the Storefront activity bell.
ALTER TABLE "AdminUser"
ADD COLUMN "notificationsLastSeenAt" TIMESTAMP(3);
