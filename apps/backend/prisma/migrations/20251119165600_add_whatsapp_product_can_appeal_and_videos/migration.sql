-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "videos" JSONB,
ADD COLUMN     "whatsappProductCanAppeal" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "currency" DROP DEFAULT;
