-- Extend Store Admin roles without removing legacy operational values that may
-- still be referenced by historical fulfillment records.
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'MERCHANDISER';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'MARKETING_CONTENT';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'CUSTOMER_SUPPORT';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'ANALYST_VIEWER';

CREATE TYPE "AdminUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED');
CREATE TYPE "AdminLocationScopeMode" AS ENUM ('ALL', 'LOCATIONS');
CREATE TYPE "OperationsRole" AS ENUM ('OPERATIONS_MANAGER', 'STORE_STAFF', 'FULFILLMENT', 'DELIVERY', 'WAREHOUSE');
CREATE TYPE "OperationsAccessStatus" AS ENUM ('NONE', 'PENDING', 'ACTIVE', 'REVOKING', 'FAILED', 'UNAVAILABLE');
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');
CREATE TYPE "NotificationTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED');

ALTER TABLE "AdminUser"
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "status" "AdminUserStatus" NOT NULL DEFAULT 'INVITED',
  ADD COLUMN "locationScopeMode" "AdminLocationScopeMode" NOT NULL DEFAULT 'ALL',
  ADD COLUMN "mfaSecretEncrypted" TEXT,
  ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "invitedAt" TIMESTAMP(3),
  ADD COLUMN "activatedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "operationsRole" "OperationsRole",
  ADD COLUMN "operationsLocationIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "operationsAccessStatus" "OperationsAccessStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "operationsExternalSubject" TEXT,
  ADD COLUMN "operationsRequestedAt" TIMESTAMP(3),
  ADD COLUMN "operationsLastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "operationsSyncError" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "AdminUserLocationScope" (
  "adminUserId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminUserLocationScope_pkey" PRIMARY KEY ("adminUserId", "locationId")
);

CREATE TABLE "AdminSession" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "authVersion" INTEGER NOT NULL,
  "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "idleExpiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" TEXT,
  CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminRecoveryCode" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "AdminRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminUserInvitation" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdById" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminUserInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationTemplateVersion" (
  "id" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
  "subject" TEXT NOT NULL,
  "bodyText" TEXT NOT NULL,
  "variables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "NotificationTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDeliveryEvent" (
  "id" TEXT NOT NULL,
  "templateVersionId" TEXT,
  "eventType" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "recipientHash" TEXT NOT NULL,
  "provider" TEXT,
  "providerMessageId" TEXT,
  "status" "NotificationDeliveryStatus" NOT NULL,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");
CREATE UNIQUE INDEX "AdminRecoveryCode_codeHash_key" ON "AdminRecoveryCode"("codeHash");
CREATE UNIQUE INDEX "AdminUserInvitation_tokenHash_key" ON "AdminUserInvitation"("tokenHash");
CREATE UNIQUE INDEX "NotificationTemplateVersion_templateKey_version_key" ON "NotificationTemplateVersion"("templateKey", "version");
CREATE UNIQUE INDEX "NotificationDeliveryEvent_providerMessageId_key" ON "NotificationDeliveryEvent"("providerMessageId");
CREATE INDEX "AdminUser_status_role_idx" ON "AdminUser"("status", "role");
CREATE INDEX "AdminUser_operationsAccessStatus_idx" ON "AdminUser"("operationsAccessStatus");
CREATE INDEX "AdminUserLocationScope_locationId_idx" ON "AdminUserLocationScope"("locationId");
CREATE INDEX "AdminSession_adminUserId_revokedAt_idx" ON "AdminSession"("adminUserId", "revokedAt");
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
CREATE INDEX "AdminSession_idleExpiresAt_idx" ON "AdminSession"("idleExpiresAt");
CREATE INDEX "AdminRecoveryCode_adminUserId_usedAt_idx" ON "AdminRecoveryCode"("adminUserId", "usedAt");
CREATE INDEX "AdminUserInvitation_adminUserId_expiresAt_idx" ON "AdminUserInvitation"("adminUserId", "expiresAt");
CREATE INDEX "AdminUserInvitation_createdById_idx" ON "AdminUserInvitation"("createdById");
CREATE INDEX "NotificationTemplateVersion_templateKey_status_version_idx" ON "NotificationTemplateVersion"("templateKey", "status", "version");
CREATE INDEX "NotificationDeliveryEvent_eventType_status_createdAt_idx" ON "NotificationDeliveryEvent"("eventType", "status", "createdAt");
CREATE INDEX "NotificationDeliveryEvent_templateVersionId_createdAt_idx" ON "NotificationDeliveryEvent"("templateVersionId", "createdAt");

ALTER TABLE "AdminUserLocationScope"
  ADD CONSTRAINT "AdminUserLocationScope_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminUserLocationScope"
  ADD CONSTRAINT "AdminUserLocationScope_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "StoreLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminSession"
  ADD CONSTRAINT "AdminSession_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminRecoveryCode"
  ADD CONSTRAINT "AdminRecoveryCode_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminUserInvitation"
  ADD CONSTRAINT "AdminUserInvitation_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminUserInvitation"
  ADD CONSTRAINT "AdminUserInvitation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationDeliveryEvent"
  ADD CONSTRAINT "NotificationDeliveryEvent_templateVersionId_fkey"
  FOREIGN KEY ("templateVersionId") REFERENCES "NotificationTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
