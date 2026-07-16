ALTER TABLE "ProductOverride"
ADD COLUMN "ageGroups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "websiteSurfaces" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ProductOverride"
ALTER COLUMN "webVisible" SET DEFAULT false;

UPDATE "ProductOverride"
SET "webVisible" = false
WHERE "webStatus" = 'NEEDS_PLACEMENT';
