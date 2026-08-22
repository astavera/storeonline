CREATE TYPE "CustomerPrivacyRequestType" AS ENUM ('DATA_EXPORT', 'DELETION');
CREATE TYPE "CustomerPrivacyRequestStatus" AS ENUM ('REQUESTED', 'IN_REVIEW', 'COMPLETED', 'REJECTED');

CREATE TABLE "CustomerNote" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "authorAdminUserId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerPrivacyRequest" (
  "id" TEXT NOT NULL,
  "customerAccountId" TEXT NOT NULL,
  "requestType" "CustomerPrivacyRequestType" NOT NULL,
  "status" "CustomerPrivacyRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedById" TEXT,
  "resolvedById" TEXT,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "CustomerPrivacyRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerNote_customerAccountId_createdAt_idx" ON "CustomerNote"("customerAccountId", "createdAt");
CREATE INDEX "CustomerNote_authorAdminUserId_idx" ON "CustomerNote"("authorAdminUserId");
CREATE INDEX "CustomerPrivacyRequest_customerAccountId_createdAt_idx" ON "CustomerPrivacyRequest"("customerAccountId", "createdAt");
CREATE INDEX "CustomerPrivacyRequest_status_requestType_idx" ON "CustomerPrivacyRequest"("status", "requestType");
CREATE INDEX "CustomerPrivacyRequest_requestedById_idx" ON "CustomerPrivacyRequest"("requestedById");
CREATE INDEX "CustomerPrivacyRequest_resolvedById_idx" ON "CustomerPrivacyRequest"("resolvedById");

ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_authorAdminUserId_fkey" FOREIGN KEY ("authorAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerPrivacyRequest" ADD CONSTRAINT "CustomerPrivacyRequest_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerPrivacyRequest" ADD CONSTRAINT "CustomerPrivacyRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerPrivacyRequest" ADD CONSTRAINT "CustomerPrivacyRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
