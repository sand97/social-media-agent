/*
  Warnings:

  - You are about to drop the column `openingHours` on the `BusinessInfo` table. All the data in the column will be lost.
  - You are about to drop the column `images` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."BusinessInfo" DROP COLUMN "openingHours",
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "businessHours" JSONB,
ADD COLUMN     "categories" JSONB,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "isBusiness" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "profileName" TEXT,
ADD COLUMN     "profileOptions" JSONB,
ADD COLUMN     "tag" TEXT,
ADD COLUMN     "whatsappId" TEXT;

-- AlterTable
ALTER TABLE "public"."Product" DROP COLUMN "images",
ADD COLUMN     "availability" TEXT,
ADD COLUMN     "checkmark" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "collectionId" TEXT,
ADD COLUMN     "imageHashes" TEXT[],
ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSanctioned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxAvailable" INTEGER,
ADD COLUMN     "retailerId" TEXT,
ADD COLUMN     "reviewStatus" JSONB,
ADD COLUMN     "url" TEXT;

-- CreateTable
CREATE TABLE "public"."Collection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "whatsappCollectionId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "originalUrl" TEXT,
    "imageType" TEXT NOT NULL DEFAULT 'main',
    "imageIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_id_key" ON "public"."Collection"("id");

-- CreateIndex
CREATE INDEX "Collection_userId_idx" ON "public"."Collection"("userId");

-- CreateIndex
CREATE INDEX "Collection_whatsappCollectionId_idx" ON "public"."Collection"("whatsappCollectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_id_key" ON "public"."ProductImage"("id");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "public"."ProductImage"("productId");

-- CreateIndex
CREATE INDEX "ProductImage_imageType_idx" ON "public"."ProductImage"("imageType");

-- CreateIndex
CREATE INDEX "BusinessInfo_whatsappId_idx" ON "public"."BusinessInfo"("whatsappId");

-- CreateIndex
CREATE INDEX "Product_collectionId_idx" ON "public"."Product"("collectionId");

-- AddForeignKey
ALTER TABLE "public"."Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "public"."Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
