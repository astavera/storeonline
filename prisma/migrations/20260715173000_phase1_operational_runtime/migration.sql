ALTER TABLE "WebhookInboxEvent"
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN "lockedAt" TIMESTAMP(3),
ADD COLUMN "lockToken" TEXT;

ALTER TYPE "BalloonDraftStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';

ALTER TABLE "BalloonOrderDraft"
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "requestDetails" JSONB;

ALTER TABLE "SquareItemVariation"
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "SquareItemVariation_deletedAt_idx"
ON "SquareItemVariation"("deletedAt");

CREATE INDEX "WebhookInboxEvent_provider_status_nextAttemptAt_idx"
ON "WebhookInboxEvent"("provider", "status", "nextAttemptAt");

CREATE INDEX "WebhookInboxEvent_status_lockedAt_idx"
ON "WebhookInboxEvent"("status", "lockedAt");

CREATE TABLE "AdminRateLimitBucket" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "windowMs" INTEGER NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminRateLimitBucket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminRateLimitBucket_values_check"
    CHECK ("windowMs" > 0 AND "count" > 0 AND "expiresAt" > "windowStartedAt")
);

CREATE UNIQUE INDEX "AdminRateLimitBucket_scope_keyHash_windowStartedAt_key"
ON "AdminRateLimitBucket"("scope", "keyHash", "windowStartedAt");

CREATE INDEX "AdminRateLimitBucket_expiresAt_idx"
ON "AdminRateLimitBucket"("expiresAt");

CREATE TABLE "SquareCatalogSyncState" (
  "environment" TEXT NOT NULL,
  "latestTime" TEXT,
  "lastStartedAt" TIMESTAMP(3),
  "lastCompletedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "lockedAt" TIMESTAMP(3),
  "lockToken" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SquareCatalogSyncState_pkey" PRIMARY KEY ("environment"),
  CONSTRAINT "SquareCatalogSyncState_lock_check"
    CHECK (("lockedAt" IS NULL AND "lockToken" IS NULL) OR ("lockedAt" IS NOT NULL AND "lockToken" IS NOT NULL))
);

-- A worker must be stopped while this migration runs. Any lease that existed
-- before durable lease columns were introduced is made retryable; payloads and
-- attempt counters remain intact.
UPDATE "WebhookInboxEvent"
SET
  "status" = 'FAILED',
  "nextAttemptAt" = CURRENT_TIMESTAMP,
  "lockedAt" = NULL,
  "lockToken" = NULL,
  "error" = LEFT(COALESCE("error" || ' ', '') || 'Recovered during durable lease migration.', 1000)
WHERE "status" = 'PROCESSING';

UPDATE "WebhookInboxEvent"
SET "nextAttemptAt" = CURRENT_TIMESTAMP
WHERE "status" = 'FAILED' AND "nextAttemptAt" IS NULL;

UPDATE "WebhookInboxEvent"
SET
  "nextAttemptAt" = NULL,
  "lockedAt" = NULL,
  "lockToken" = NULL
WHERE "status" NOT IN ('FAILED', 'PROCESSING');

ALTER TABLE "WebhookInboxEvent"
ADD CONSTRAINT "WebhookInboxEvent_processing_lease_check"
CHECK (
  ("status" = 'PROCESSING' AND "lockedAt" IS NOT NULL AND "lockToken" IS NOT NULL AND "lastAttemptAt" IS NOT NULL)
  OR
  ("status" <> 'PROCESSING' AND "lockedAt" IS NULL AND "lockToken" IS NULL)
) NOT VALID;

ALTER TABLE "WebhookInboxEvent"
ADD CONSTRAINT "WebhookInboxEvent_retry_schedule_check"
CHECK (
  ("status" = 'FAILED' AND "nextAttemptAt" IS NOT NULL)
  OR
  ("status" <> 'FAILED' AND "nextAttemptAt" IS NULL)
) NOT VALID;
