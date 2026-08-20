ALTER TABLE "CheckoutAttempt"
ADD COLUMN "checkoutVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "splitCheckoutContext" JSONB;
