-- CreateEnum
CREATE TYPE "public"."SyncStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "public"."WhatsAppAgent" ADD COLUMN     "syncProgress" JSONB,
ADD COLUMN     "syncStatus" "public"."SyncStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "public"."OnboardingThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "context" TEXT,
    "needs" JSONB,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ThreadMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingThread_id_key" ON "public"."OnboardingThread"("id");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingThread_userId_key" ON "public"."OnboardingThread"("userId");

-- CreateIndex
CREATE INDEX "OnboardingThread_userId_idx" ON "public"."OnboardingThread"("userId");

-- CreateIndex
CREATE INDEX "OnboardingThread_status_idx" ON "public"."OnboardingThread"("status");

-- CreateIndex
CREATE INDEX "OnboardingThread_score_idx" ON "public"."OnboardingThread"("score");

-- CreateIndex
CREATE UNIQUE INDEX "ThreadMessage_id_key" ON "public"."ThreadMessage"("id");

-- CreateIndex
CREATE INDEX "ThreadMessage_threadId_idx" ON "public"."ThreadMessage"("threadId");

-- CreateIndex
CREATE INDEX "ThreadMessage_role_idx" ON "public"."ThreadMessage"("role");

-- CreateIndex
CREATE INDEX "ThreadMessage_createdAt_idx" ON "public"."ThreadMessage"("createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppAgent_syncStatus_idx" ON "public"."WhatsAppAgent"("syncStatus");

-- AddForeignKey
ALTER TABLE "public"."OnboardingThread" ADD CONSTRAINT "OnboardingThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ThreadMessage" ADD CONSTRAINT "ThreadMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."OnboardingThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
