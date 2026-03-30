-- AlterTable
ALTER TABLE "public"."ProvisioningServer" ADD COLUMN     "cloudflareRecordIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "public"."WhatsAppAgent" ADD COLUMN     "subdomain" TEXT;
