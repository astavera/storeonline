CREATE TABLE "AdminPasswordReset" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminPasswordReset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminPasswordReset_tokenHash_key" ON "AdminPasswordReset"("tokenHash");
CREATE INDEX "AdminPasswordReset_adminUserId_expiresAt_idx" ON "AdminPasswordReset"("adminUserId", "expiresAt");
CREATE INDEX "AdminPasswordReset_expiresAt_consumedAt_idx" ON "AdminPasswordReset"("expiresAt", "consumedAt");

ALTER TABLE "AdminPasswordReset"
  ADD CONSTRAINT "AdminPasswordReset_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
