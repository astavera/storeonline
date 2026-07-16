CREATE TABLE "WebsiteBrand" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "logoUrl" TEXT,
    "imageAlt" TEXT,
    "squareVendorIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "featuredOnHomepage" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WebsiteBrand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductBrandAssignment" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "squareVariationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductBrandAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebsiteBrand_slug_key" ON "WebsiteBrand"("slug");
CREATE UNIQUE INDEX "ProductBrandAssignment_brandId_squareVariationId_key" ON "ProductBrandAssignment"("brandId", "squareVariationId");
CREATE INDEX "ProductBrandAssignment_squareVariationId_idx" ON "ProductBrandAssignment"("squareVariationId");

ALTER TABLE "ProductBrandAssignment"
ADD CONSTRAINT "ProductBrandAssignment_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "WebsiteBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductBrandAssignment"
ADD CONSTRAINT "ProductBrandAssignment_squareVariationId_fkey"
FOREIGN KEY ("squareVariationId") REFERENCES "SquareItemVariation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
