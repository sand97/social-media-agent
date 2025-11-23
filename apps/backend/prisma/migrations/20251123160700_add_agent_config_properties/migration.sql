-- AlterTable
ALTER TABLE "public"."WhatsAppAgent" ADD COLUMN     "labelsToNotReply" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "productionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "testLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "testPhoneNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[];
