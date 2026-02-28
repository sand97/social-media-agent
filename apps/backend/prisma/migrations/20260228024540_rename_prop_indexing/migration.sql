/*
  Warnings:

  - You are about to drop the column `indexedAt` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Product" DROP COLUMN "indexedAt",
ADD COLUMN     "needsTextIndexing" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."ProductImage" ADD COLUMN     "needsImageIndexing" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "whatsapp_image_hash" TEXT;

-- CreateIndex
CREATE INDEX "Product_user_id_needsTextIndexing_idx" ON "public"."Product"("user_id", "needsTextIndexing");

-- CreateIndex
CREATE INDEX "ProductImage_product_id_needsImageIndexing_idx" ON "public"."ProductImage"("product_id", "needsImageIndexing");

-- CreateIndex
CREATE INDEX "ProductImage_product_id_whatsapp_image_hash_idx" ON "public"."ProductImage"("product_id", "whatsapp_image_hash");
