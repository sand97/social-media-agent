/*
  Warnings:

  - You are about to drop the column `avatarUrl` on the `BusinessInfo` table. All the data in the column will be lost.
  - You are about to drop the column `businessHours` on the `BusinessInfo` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `BusinessInfo` table. All the data in the column will be lost.
  - You are about to drop the column `isBusiness` on the `BusinessInfo` table. All the data in the column will be lost.
  - You are about to drop the column `phoneNumbers` on the `BusinessInfo` table. All the data in the column will be lost.
  - You are about to drop the column `profileName` on the `BusinessInfo` table. All the data in the column will be lost.
  - You are about to drop the column `profileOptions` on the `BusinessInfo` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `BusinessInfo` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `BusinessInfo` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappId` on the `BusinessInfo` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Collection` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Collection` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Collection` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappCollectionId` on the `Collection` table. All the data in the column will be lost.
  - You are about to drop the column `aiSuggestions` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `collectionId` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `imageHashes` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `isHidden` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `isSanctioned` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `maxAvailable` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `retailerId` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `reviewStatus` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappProductCanAppeal` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappProductId` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `ProductImage` table. All the data in the column will be lost.
  - You are about to drop the column `imageIndex` on the `ProductImage` table. All the data in the column will be lost.
  - You are about to drop the column `imageType` on the `ProductImage` table. All the data in the column will be lost.
  - You are about to drop the column `originalUrl` on the `ProductImage` table. All the data in the column will be lost.
  - You are about to drop the column `productId` on the `ProductImage` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `ProductMetadata` table. All the data in the column will be lost.
  - You are about to drop the column `isVisible` on the `ProductMetadata` table. All the data in the column will be lost.
  - You are about to drop the column `productId` on the `ProductMetadata` table. All the data in the column will be lost.
  - You are about to drop the column `suggestedByAI` on the `ProductMetadata` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `ProductMetadata` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[user_id]` on the table `BusinessInfo` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updated_at` to the `BusinessInfo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `BusinessInfo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Collection` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `Collection` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `product_id` to the `ProductImage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `product_id` to the `ProductMetadata` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `ProductMetadata` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."BusinessInfo" DROP CONSTRAINT "BusinessInfo_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Collection" DROP CONSTRAINT "Collection_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Product" DROP CONSTRAINT "Product_collectionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Product" DROP CONSTRAINT "Product_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProductImage" DROP CONSTRAINT "ProductImage_productId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProductMetadata" DROP CONSTRAINT "ProductMetadata_productId_fkey";

-- DropIndex
DROP INDEX "public"."BusinessInfo_userId_idx";

-- DropIndex
DROP INDEX "public"."BusinessInfo_userId_key";

-- DropIndex
DROP INDEX "public"."BusinessInfo_whatsappId_idx";

-- DropIndex
DROP INDEX "public"."Collection_userId_idx";

-- DropIndex
DROP INDEX "public"."Collection_whatsappCollectionId_idx";

-- DropIndex
DROP INDEX "public"."Product_collectionId_idx";

-- DropIndex
DROP INDEX "public"."Product_userId_idx";

-- DropIndex
DROP INDEX "public"."Product_whatsappProductId_idx";

-- DropIndex
DROP INDEX "public"."ProductImage_imageType_idx";

-- DropIndex
DROP INDEX "public"."ProductImage_productId_idx";

-- DropIndex
DROP INDEX "public"."ProductMetadata_productId_idx";

-- AlterTable
ALTER TABLE "public"."BusinessInfo" DROP COLUMN "avatarUrl",
DROP COLUMN "businessHours",
DROP COLUMN "createdAt",
DROP COLUMN "isBusiness",
DROP COLUMN "phoneNumbers",
DROP COLUMN "profileName",
DROP COLUMN "profileOptions",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
DROP COLUMN "whatsappId",
ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "business_hours" JSONB,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_business" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone_numbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "profile_name" TEXT,
ADD COLUMN     "profile_options" JSONB,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "user_id" TEXT NOT NULL,
ADD COLUMN     "whatsapp_id" TEXT;

-- AlterTable
ALTER TABLE "public"."Collection" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
DROP COLUMN "whatsappCollectionId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "user_id" TEXT NOT NULL,
ADD COLUMN     "whatsapp_collection_id" TEXT;

-- AlterTable
ALTER TABLE "public"."Product" DROP COLUMN "aiSuggestions",
DROP COLUMN "collectionId",
DROP COLUMN "createdAt",
DROP COLUMN "imageHashes",
DROP COLUMN "isHidden",
DROP COLUMN "isSanctioned",
DROP COLUMN "maxAvailable",
DROP COLUMN "retailerId",
DROP COLUMN "reviewStatus",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
DROP COLUMN "whatsappProductCanAppeal",
DROP COLUMN "whatsappProductId",
ADD COLUMN     "ai_suggestions" JSONB,
ADD COLUMN     "capability_to_review_status" JSONB DEFAULT '[]',
ADD COLUMN     "collection_id" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "image_hashes_for_whatsapp" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "is_hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_sanctioned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_available" INTEGER,
ADD COLUMN     "retailer_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "user_id" TEXT NOT NULL,
ADD COLUMN     "whatsapp_product_can_appeal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsapp_product_id" TEXT;

-- AlterTable
ALTER TABLE "public"."ProductImage" DROP COLUMN "createdAt",
DROP COLUMN "imageIndex",
DROP COLUMN "imageType",
DROP COLUMN "originalUrl",
DROP COLUMN "productId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "image_index" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "image_type" TEXT NOT NULL DEFAULT 'main',
ADD COLUMN     "original_url" TEXT,
ADD COLUMN     "product_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."ProductMetadata" DROP COLUMN "createdAt",
DROP COLUMN "isVisible",
DROP COLUMN "productId",
DROP COLUMN "suggestedByAI",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_visible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "product_id" TEXT NOT NULL,
ADD COLUMN     "suggested_by_ai" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BusinessInfo_user_id_key" ON "public"."BusinessInfo"("user_id");

-- CreateIndex
CREATE INDEX "BusinessInfo_user_id_idx" ON "public"."BusinessInfo"("user_id");

-- CreateIndex
CREATE INDEX "BusinessInfo_whatsapp_id_idx" ON "public"."BusinessInfo"("whatsapp_id");

-- CreateIndex
CREATE INDEX "Collection_user_id_idx" ON "public"."Collection"("user_id");

-- CreateIndex
CREATE INDEX "Collection_whatsapp_collection_id_idx" ON "public"."Collection"("whatsapp_collection_id");

-- CreateIndex
CREATE INDEX "Product_user_id_idx" ON "public"."Product"("user_id");

-- CreateIndex
CREATE INDEX "Product_collection_id_idx" ON "public"."Product"("collection_id");

-- CreateIndex
CREATE INDEX "Product_whatsapp_product_id_idx" ON "public"."Product"("whatsapp_product_id");

-- CreateIndex
CREATE INDEX "ProductImage_product_id_idx" ON "public"."ProductImage"("product_id");

-- CreateIndex
CREATE INDEX "ProductImage_image_type_idx" ON "public"."ProductImage"("image_type");

-- CreateIndex
CREATE INDEX "ProductMetadata_product_id_idx" ON "public"."ProductMetadata"("product_id");

-- AddForeignKey
ALTER TABLE "public"."BusinessInfo" ADD CONSTRAINT "BusinessInfo_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Collection" ADD CONSTRAINT "Collection_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductImage" ADD CONSTRAINT "ProductImage_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductMetadata" ADD CONSTRAINT "ProductMetadata_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
