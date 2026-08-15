-- Customer accounts are separate from AdminUser. This migration adds only
-- storefront identity, passwordless login, sessions, and consent history.

CREATE TABLE "CustomerAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "squareCustomerId" TEXT,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "marketingEmailConsent" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsentAt" TIMESTAMP(3),
    "marketingConsentSource" TEXT,
    "marketingConsentVersion" TEXT,
    "marketingUnsubscribedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerLoginChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "termsVersion" TEXT NOT NULL,
    "marketingConsentRequested" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsentVersion" TEXT,
    "source" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerSession" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerConsentEvent" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerConsentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerAccount_email_key" ON "CustomerAccount"("email");
CREATE UNIQUE INDEX "CustomerAccount_squareCustomerId_key" ON "CustomerAccount"("squareCustomerId");
CREATE INDEX "CustomerAccount_squareCustomerId_idx" ON "CustomerAccount"("squareCustomerId");
CREATE INDEX "CustomerAccount_createdAt_idx" ON "CustomerAccount"("createdAt");
CREATE INDEX "CustomerLoginChallenge_email_createdAt_idx" ON "CustomerLoginChallenge"("email", "createdAt");
CREATE INDEX "CustomerLoginChallenge_expiresAt_idx" ON "CustomerLoginChallenge"("expiresAt");
CREATE UNIQUE INDEX "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");
CREATE INDEX "CustomerSession_customerAccountId_expiresAt_idx" ON "CustomerSession"("customerAccountId", "expiresAt");
CREATE INDEX "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");
CREATE INDEX "CustomerConsentEvent_customerAccountId_occurredAt_idx" ON "CustomerConsentEvent"("customerAccountId", "occurredAt");
CREATE INDEX "CustomerConsentEvent_consentType_occurredAt_idx" ON "CustomerConsentEvent"("consentType", "occurredAt");

ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerConsentEvent" ADD CONSTRAINT "CustomerConsentEvent_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
