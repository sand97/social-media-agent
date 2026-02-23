import { Prisma } from '@app/generated/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { UpdateAgentInternalDto } from './dto/update-agent-internal.dto';

@Injectable()
export class WhatsAppAgentInternalService {
  constructor(private readonly prisma: PrismaService) {}

  async getAgentSnapshot(agentId: string, userId: string) {
    const [agent, managementGroup] = await Promise.all([
      this.prisma.whatsAppAgent.findUnique({
        where: { id: agentId },
      }),
      this.prisma.group.findFirst({
        where: {
          userId,
          OR: [
            { usage: { contains: 'gestion', mode: 'insensitive' } },
            { usage: { contains: 'management', mode: 'insensitive' } },
            { usage: { contains: 'admin', mode: 'insensitive' } },
          ],
        },
        select: {
          whatsappGroupId: true,
          name: true,
          usage: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!agent) {
      throw new NotFoundException('WhatsApp agent not found');
    }

    return {
      agent,
      managementGroup: {
        managementGroupId: managementGroup?.whatsappGroupId || null,
        name: managementGroup?.name || null,
        usage: managementGroup?.usage || null,
      },
    };
  }

  async updateAgentSnapshot(
    agentId: string,
    userId: string,
    dto: UpdateAgentInternalDto,
  ) {
    const updateData: Prisma.WhatsAppAgentUpdateInput = {};

    if (dto.customDescriptionPrompt !== undefined) {
      updateData.customDescriptionPrompt = dto.customDescriptionPrompt;
      updateData.promptGeneratedAt = new Date();
    }

    if (dto.promptBasedOnProductsCount !== undefined) {
      updateData.promptBasedOnProductsCount = dto.promptBasedOnProductsCount;
    }

    if (dto.syncImageStatus !== undefined) {
      updateData.syncImageStatus = dto.syncImageStatus;

      if (dto.syncImageStatus === 'DONE') {
        updateData.lastImageSyncDate = new Date();
        updateData.lastImageSyncError = null;
      }

      if (dto.syncImageStatus === 'SYNCING') {
        updateData.lastImageSyncError = null;
      }

      if (dto.syncImageStatus === 'FAILED') {
        updateData.lastImageSyncError = dto.syncImageError || null;
      }
    }

    if (dto.syncImageError !== undefined && dto.syncImageStatus === undefined) {
      updateData.lastImageSyncError = dto.syncImageError;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('At least one updatable field is required');
    }

    await this.prisma.whatsAppAgent.update({
      where: { id: agentId },
      data: updateData,
    });

    return this.getAgentSnapshot(agentId, userId);
  }
}
