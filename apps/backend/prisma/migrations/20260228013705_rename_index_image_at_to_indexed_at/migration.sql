/*
  Warnings:

  - You are about to drop the column `indexImageAt` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Product" DROP COLUMN "indexImageAt",
ADD COLUMN     "indexedAt" TIMESTAMP(3);
