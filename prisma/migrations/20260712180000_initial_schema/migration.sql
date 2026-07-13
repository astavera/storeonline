-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FulfillmentMode" AS ENUM ('PICKUP', 'LOCAL_DELIVERY', 'SHIPPING');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('NEW', 'PAID', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'WAREHOUSE_PICKING', 'PACKED', 'LABEL_CREATED', 'SHIPPED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'MANAGER', 'STORE_STAFF', 'DELIVERY_STAFF', 'WAREHOUSE_STAFF', 'VIEWER');

-- CreateEnum
CREATE TYPE "CmsPublishStatus" AS ENUM ('DRAFT', 'PREVIEW', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductWebStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'NEEDS_PLACEMENT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED_WEB_ONLY');

-- CreateEnum
CREATE TYPE "ProductPlacementType" AS ENUM ('DEPARTMENT', 'HOLIDAY', 'BALLOON_SECTION', 'HOMEPAGE_SECTION', 'PRODUCT_GROUP', 'SEARCH_GROUP', 'PROMO_SECTION');

-- CreateEnum
CREATE TYPE "DescriptionSource" AS ENUM ('SQUARE', 'WEBSITE_OVERRIDE', 'GENERATED_DRAFT', 'ADMIN_APPROVED', 'EMPTY');

-- CreateEnum
CREATE TYPE "DescriptionStatus" AS ENUM ('READY', 'NEEDS_REVIEW', 'MISSING', 'OUTDATED_SQUARE_CHANGED');

-- CreateTable
CREATE TABLE "StoreLocation" (
    "id" TEXT NOT NULL,
    "squareLocationId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "localDeliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "shippingFulfillmentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SquareCatalogObject" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" BIGINT,
    "reportingCategoryId" TEXT,
    "categoryIds" TEXT[],
    "name" TEXT,
    "descriptionHtml" TEXT,
    "descriptionPlaintext" TEXT,
    "squareDescriptionHash" TEXT,
    "lastDescriptionSyncedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SquareCatalogObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SquareItemVariation" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "upc" TEXT,
    "priceMoney" JSONB,
    "raw" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SquareItemVariation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SquareInventoryCount" (
    "id" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,
    "squareLocationId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "state" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SquareInventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "shortTitleEn" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "heroTitleEn" TEXT NOT NULL,
    "heroSubtitleEn" TEXT NOT NULL,
    "seoTitleEn" TEXT NOT NULL,
    "seoDescriptionEn" TEXT NOT NULL,
    "heroImageUrl" TEXT,
    "mobileHeroImageUrl" TEXT,
    "accentColorToken" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "navigationPriority" TEXT NOT NULL,
    "isPrimaryNav" BOOLEAN NOT NULL DEFAULT false,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "layoutPreset" TEXT NOT NULL,
    "productGridPreset" TEXT NOT NULL,
    "productCardVariant" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "shortTitleEn" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "heroTitleEn" TEXT NOT NULL,
    "heroSubtitleEn" TEXT NOT NULL,
    "seoTitleEn" TEXT NOT NULL,
    "seoDescriptionEn" TEXT NOT NULL,
    "heroImageUrl" TEXT,
    "mobileHeroImageUrl" TEXT,
    "accentColorToken" TEXT NOT NULL,
    "customAccentColor" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "layoutPreset" TEXT NOT NULL,
    "productGridPreset" TEXT NOT NULL,
    "productCardVariant" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDepartmentAssignment" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "squareVariationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDepartmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductHolidayAssignment" (
    "id" TEXT NOT NULL,
    "holidayId" TEXT NOT NULL,
    "squareVariationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "badge" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductHolidayAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOverride" (
    "id" TEXT NOT NULL,
    "squareVariationId" TEXT NOT NULL,
    "webVisible" BOOLEAN NOT NULL DEFAULT true,
    "webStatus" "ProductWebStatus" NOT NULL DEFAULT 'NEEDS_PLACEMENT',
    "seoTitleEn" TEXT,
    "seoDescriptionEn" TEXT,
    "slug" TEXT,
    "displayNameEn" TEXT,
    "webShortDescriptionEn" TEXT,
    "webDescriptionEn" TEXT,
    "badgeEn" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "productCardStyle" TEXT,
    "fulfillmentModes" "FulfillmentMode"[],
    "pickupAllowed" BOOLEAN NOT NULL DEFAULT false,
    "localDeliveryAllowed" BOOLEAN NOT NULL DEFAULT false,
    "shippingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "allowedLocationIds" TEXT[],
    "warehouseRequired" BOOLEAN NOT NULL DEFAULT false,
    "inflated" BOOLEAN NOT NULL DEFAULT false,
    "fragile" BOOLEAN NOT NULL DEFAULT false,
    "requiresBalloonPrep" BOOLEAN NOT NULL DEFAULT false,
    "prepTimeMinutes" INTEGER,
    "capacityPoints" INTEGER,
    "descriptionSource" "DescriptionSource" NOT NULL DEFAULT 'EMPTY',
    "descriptionStatus" "DescriptionStatus" NOT NULL DEFAULT 'MISSING',
    "useSquareDescription" BOOLEAN NOT NULL DEFAULT true,
    "lockWebDescription" BOOLEAN NOT NULL DEFAULT false,
    "squareDescriptionHash" TEXT,
    "lastSquareDescriptionSyncedAt" TIMESTAMP(3),
    "isBalloonComponent" BOOLEAN NOT NULL DEFAULT false,
    "isShippable" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "unpublishedAt" TIMESTAMP(3),
    "scheduledPublishAt" TIMESTAMP(3),
    "scheduledUnpublishAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteProductPlacement" (
    "id" TEXT NOT NULL,
    "squareVariationId" TEXT NOT NULL,
    "placementType" "ProductPlacementType" NOT NULL,
    "placementTargetId" TEXT,
    "placementTargetSlug" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteProductPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPlacementRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "suggestOnly" BOOLEAN NOT NULL DEFAULT true,
    "matchField" TEXT NOT NULL,
    "matchOperator" TEXT NOT NULL,
    "matchValue" TEXT NOT NULL,
    "placementType" "ProductPlacementType" NOT NULL,
    "placementTargetSlug" TEXT NOT NULL,
    "fulfillmentSuggestion" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPlacementRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsContentVersion" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "CmsPublishStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "payload" JSONB NOT NULL,
    "createdById" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "scheduledPublishAt" TIMESTAMP(3),
    "scheduledUnpublishAt" TIMESTAMP(3),
    "rollbackOfVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CmsContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "url" TEXT NOT NULL,
    "altTextEn" TEXT,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "hiddenFromWebsite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImagePreference" (
    "id" TEXT NOT NULL,
    "catalogObjectId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "altTextEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "cropPreset" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImagePreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "squareVariationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "fulfillmentMode" "FulfillmentMode",
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderMirror" (
    "id" TEXT NOT NULL,
    "squareOrderId" TEXT,
    "squarePaymentId" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalMoney" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderMirror_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemMirror" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "squareVariationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceMoney" JSONB NOT NULL,

    CONSTRAINT "OrderItemMirror_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentTask" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "locationId" TEXT,
    "mode" "FulfillmentMode" NOT NULL,
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'NEW',
    "assignedRole" "AdminRole",
    "capacityPoints" INTEGER NOT NULL DEFAULT 1,
    "deliveryAddress" JSONB,
    "shippingAddress" JSONB,
    "trackingNumber" TEXT,
    "carrier" TEXT,
    "labelUrl" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfillmentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "polygonGeojson" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "serviceMode" TEXT NOT NULL,
    "baseFeeCents" INTEGER NOT NULL,
    "minimumOrderCents" INTEGER NOT NULL,
    "maxDistanceMiles" DECIMAL(65,30),
    "maxRouteMinutes" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "activeDays" TEXT[],
    "cutoffMinutes" INTEGER NOT NULL,
    "leadTimeMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotTemplate" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "fulfillmentMode" "FulfillmentMode" NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "capacityPoints" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cutoffMinutes" INTEGER NOT NULL,
    "leadTimeMinutes" INTEGER NOT NULL,

    CONSTRAINT "SlotTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotHold" (
    "id" TEXT NOT NULL,
    "slotTemplateId" TEXT NOT NULL,
    "cartId" TEXT,
    "orderId" TEXT,
    "capacityPoints" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotHold_pkey" PRIMARY KEY ("id")
);

-- Manual invariant not expressible in Prisma schema: every hold belongs to exactly one owner.
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_exactly_one_owner_check"
CHECK (
    ("cartId" IS NOT NULL AND "orderId" IS NULL)
    OR ("cartId" IS NULL AND "orderId" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "ShippingRateQuote" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "serviceLevel" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "addressHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShippingRateQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "locationId" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreLocation_squareLocationId_key" ON "StoreLocation"("squareLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreLocation_slug_key" ON "StoreLocation"("slug");

-- CreateIndex
CREATE INDEX "SquareItemVariation_itemId_idx" ON "SquareItemVariation"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "SquareInventoryCount_variationId_squareLocationId_state_key" ON "SquareInventoryCount"("variationId", "squareLocationId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Department_slug_key" ON "Department"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_slug_key" ON "Holiday"("slug");

-- CreateIndex
CREATE INDEX "ProductDepartmentAssignment_squareVariationId_idx" ON "ProductDepartmentAssignment"("squareVariationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDepartmentAssignment_departmentId_squareVariationId_key" ON "ProductDepartmentAssignment"("departmentId", "squareVariationId");

-- CreateIndex
CREATE INDEX "ProductHolidayAssignment_squareVariationId_idx" ON "ProductHolidayAssignment"("squareVariationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductHolidayAssignment_holidayId_squareVariationId_key" ON "ProductHolidayAssignment"("holidayId", "squareVariationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOverride_squareVariationId_key" ON "ProductOverride"("squareVariationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOverride_slug_key" ON "ProductOverride"("slug");

-- CreateIndex
CREATE INDEX "WebsiteProductPlacement_placementType_placementTargetSlug_idx" ON "WebsiteProductPlacement"("placementType", "placementTargetSlug");

-- CreateIndex
CREATE INDEX "WebsiteProductPlacement_squareVariationId_idx" ON "WebsiteProductPlacement"("squareVariationId");

-- CreateIndex
CREATE INDEX "CmsContentVersion_entityType_entityId_status_idx" ON "CmsContentVersion"("entityType", "entityId", "status");

-- CreateIndex
CREATE INDEX "CmsContentVersion_createdById_idx" ON "CmsContentVersion"("createdById");

-- CreateIndex
CREATE INDEX "CmsContentVersion_publishedById_idx" ON "CmsContentVersion"("publishedById");

-- CreateIndex
CREATE INDEX "CmsContentVersion_rollbackOfVersionId_idx" ON "CmsContentVersion"("rollbackOfVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "CmsContentVersion_entityType_entityId_versionNumber_key" ON "CmsContentVersion"("entityType", "entityId", "versionNumber");

-- CreateIndex
CREATE INDEX "ProductImagePreference_catalogObjectId_idx" ON "ProductImagePreference"("catalogObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_sessionId_key" ON "Cart"("sessionId");

-- CreateIndex
CREATE INDEX "CartItem_cartId_idx" ON "CartItem"("cartId");

-- CreateIndex
CREATE INDEX "CartItem_squareVariationId_idx" ON "CartItem"("squareVariationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderMirror_squareOrderId_key" ON "OrderMirror"("squareOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderMirror_squarePaymentId_key" ON "OrderMirror"("squarePaymentId");

-- CreateIndex
CREATE INDEX "OrderItemMirror_orderId_idx" ON "OrderItemMirror"("orderId");

-- CreateIndex
CREATE INDEX "OrderItemMirror_squareVariationId_idx" ON "OrderItemMirror"("squareVariationId");

-- CreateIndex
CREATE INDEX "FulfillmentTask_orderId_idx" ON "FulfillmentTask"("orderId");

-- CreateIndex
CREATE INDEX "FulfillmentTask_locationId_idx" ON "FulfillmentTask"("locationId");

-- CreateIndex
CREATE INDEX "DeliveryZone_locationId_idx" ON "DeliveryZone"("locationId");

-- CreateIndex
CREATE INDEX "SlotTemplate_locationId_idx" ON "SlotTemplate"("locationId");

-- CreateIndex
CREATE INDEX "SlotHold_slotTemplateId_idx" ON "SlotHold"("slotTemplateId");

-- CreateIndex
CREATE INDEX "SlotHold_cartId_idx" ON "SlotHold"("cartId");

-- CreateIndex
CREATE INDEX "SlotHold_orderId_idx" ON "SlotHold"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_locationId_idx" ON "AdminUser"("locationId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- AddForeignKey
ALTER TABLE "SquareItemVariation" ADD CONSTRAINT "SquareItemVariation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SquareCatalogObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquareInventoryCount" ADD CONSTRAINT "SquareInventoryCount_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "SquareItemVariation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDepartmentAssignment" ADD CONSTRAINT "ProductDepartmentAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDepartmentAssignment" ADD CONSTRAINT "ProductDepartmentAssignment_squareVariationId_fkey" FOREIGN KEY ("squareVariationId") REFERENCES "SquareItemVariation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductHolidayAssignment" ADD CONSTRAINT "ProductHolidayAssignment_holidayId_fkey" FOREIGN KEY ("holidayId") REFERENCES "Holiday"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductHolidayAssignment" ADD CONSTRAINT "ProductHolidayAssignment_squareVariationId_fkey" FOREIGN KEY ("squareVariationId") REFERENCES "SquareItemVariation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOverride" ADD CONSTRAINT "ProductOverride_squareVariationId_fkey" FOREIGN KEY ("squareVariationId") REFERENCES "SquareItemVariation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteProductPlacement" ADD CONSTRAINT "WebsiteProductPlacement_squareVariationId_fkey" FOREIGN KEY ("squareVariationId") REFERENCES "ProductOverride"("squareVariationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsContentVersion" ADD CONSTRAINT "CmsContentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsContentVersion" ADD CONSTRAINT "CmsContentVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsContentVersion" ADD CONSTRAINT "CmsContentVersion_rollbackOfVersionId_fkey" FOREIGN KEY ("rollbackOfVersionId") REFERENCES "CmsContentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImagePreference" ADD CONSTRAINT "ProductImagePreference_catalogObjectId_fkey" FOREIGN KEY ("catalogObjectId") REFERENCES "SquareCatalogObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_squareVariationId_fkey" FOREIGN KEY ("squareVariationId") REFERENCES "SquareItemVariation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemMirror" ADD CONSTRAINT "OrderItemMirror_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderMirror"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemMirror" ADD CONSTRAINT "OrderItemMirror_squareVariationId_fkey" FOREIGN KEY ("squareVariationId") REFERENCES "SquareItemVariation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentTask" ADD CONSTRAINT "FulfillmentTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderMirror"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentTask" ADD CONSTRAINT "FulfillmentTask_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotTemplate" ADD CONSTRAINT "SlotTemplate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_slotTemplateId_fkey" FOREIGN KEY ("slotTemplateId") REFERENCES "SlotTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotHold" ADD CONSTRAINT "SlotHold_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderMirror"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
