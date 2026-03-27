/*
  Warnings:

  - A unique constraint covering the columns `[serverId,stackSlot]` on the table `WhatsAppAgent` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."StackAssignmentStatus" AS ENUM ('FREE', 'RESERVED', 'ALLOCATED', 'RELEASING', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."VpsProvisioningStatus" AS ENUM ('REQUESTED', 'PROVISIONING', 'READY', 'DEGRADED', 'RELEASE_REQUESTED', 'RELEASED', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."ProvisioningWorkflowType" AS ENUM ('PROVISION_CAPACITY', 'RELEASE_CAPACITY');

-- CreateEnum
CREATE TYPE "public"."ProvisioningWorkflowStatus" AS ENUM ('PENDING', 'DISPATCHED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- AlterTable
ALTER TABLE "public"."WhatsAppAgent" ADD COLUMN     "allocatedAt" TIMESTAMP(3),
ADD COLUMN     "assignmentStatus" "public"."StackAssignmentStatus" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "releaseReason" TEXT,
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "reservationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "serverId" TEXT,
ADD COLUMN     "stackLabel" TEXT,
ADD COLUMN     "stackSlot" INTEGER;

-- CreateTable
CREATE TABLE "public"."ProvisioningServer" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'hetzner',
    "providerServerId" TEXT,
    "name" TEXT NOT NULL,
    "serverType" TEXT NOT NULL,
    "location" TEXT,
    "networkId" TEXT,
    "publicIpv4" TEXT,
    "publicIpv6" TEXT,
    "privateIpv4" TEXT,
    "privateSubnet" TEXT,
    "provisioningStatus" "public"."VpsProvisioningStatus" NOT NULL DEFAULT 'REQUESTED',
    "plannedStacksCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvisioningServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProvisioningWorkflowRun" (
    "id" TEXT NOT NULL,
    "type" "public"."ProvisioningWorkflowType" NOT NULL,
    "status" "public"."ProvisioningWorkflowStatus" NOT NULL DEFAULT 'PENDING',
    "githubWorkflowFile" TEXT NOT NULL,
    "githubRef" TEXT,
    "githubRunId" TEXT,
    "githubRunUrl" TEXT,
    "requestedByUserId" TEXT,
    "serverId" TEXT,
    "requestedPhoneNumber" TEXT,
    "pairingToken" TEXT,
    "targetDeviceType" TEXT,
    "requestedVpsCount" INTEGER NOT NULL DEFAULT 0,
    "requestedStacksPerVps" INTEGER NOT NULL DEFAULT 2,
    "totalJobs" INTEGER NOT NULL DEFAULT 3,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "currentStage" TEXT,
    "errorMessage" TEXT,
    "payload" JSONB,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvisioningWorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProvisioningServer_id_key" ON "public"."ProvisioningServer"("id");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisioningServer_providerServerId_key" ON "public"."ProvisioningServer"("providerServerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisioningServer_name_key" ON "public"."ProvisioningServer"("name");

-- CreateIndex
CREATE INDEX "ProvisioningServer_provisioningStatus_idx" ON "public"."ProvisioningServer"("provisioningStatus");

-- CreateIndex
CREATE INDEX "ProvisioningServer_providerServerId_idx" ON "public"."ProvisioningServer"("providerServerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisioningWorkflowRun_id_key" ON "public"."ProvisioningWorkflowRun"("id");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisioningWorkflowRun_githubRunId_key" ON "public"."ProvisioningWorkflowRun"("githubRunId");

-- CreateIndex
CREATE INDEX "ProvisioningWorkflowRun_status_idx" ON "public"."ProvisioningWorkflowRun"("status");

-- CreateIndex
CREATE INDEX "ProvisioningWorkflowRun_type_idx" ON "public"."ProvisioningWorkflowRun"("type");

-- CreateIndex
CREATE INDEX "ProvisioningWorkflowRun_pairingToken_idx" ON "public"."ProvisioningWorkflowRun"("pairingToken");

-- CreateIndex
CREATE INDEX "ProvisioningWorkflowRun_requestedByUserId_idx" ON "public"."ProvisioningWorkflowRun"("requestedByUserId");

-- CreateIndex
CREATE INDEX "ProvisioningWorkflowRun_serverId_idx" ON "public"."ProvisioningWorkflowRun"("serverId");

-- CreateIndex
CREATE INDEX "WhatsAppAgent_assignmentStatus_idx" ON "public"."WhatsAppAgent"("assignmentStatus");

-- CreateIndex
CREATE INDEX "WhatsAppAgent_serverId_idx" ON "public"."WhatsAppAgent"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAgent_serverId_stackSlot_key" ON "public"."WhatsAppAgent"("serverId", "stackSlot");

-- AddForeignKey
ALTER TABLE "public"."WhatsAppAgent" ADD CONSTRAINT "WhatsAppAgent_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."ProvisioningServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProvisioningWorkflowRun" ADD CONSTRAINT "ProvisioningWorkflowRun_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProvisioningWorkflowRun" ADD CONSTRAINT "ProvisioningWorkflowRun_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "public"."ProvisioningServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
