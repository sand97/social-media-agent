import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AgentContext } from '../common/decorators/agent-context.decorator';
import { AgentInternalGuard } from '../common/guards/agent-internal.guard';
import type { AgentRequestContext } from '../common/guards/agent-internal.guard';

import { UpdateAgentInternalDto } from './dto/update-agent-internal.dto';
import { WhatsAppAgentInternalService } from './whatsapp-agent-internal.service';

@ApiTags('whatsapp-agents')
@ApiBearerAuth()
@Controller('agent-internal/agents')
@UseGuards(AgentInternalGuard)
export class WhatsAppAgentInternalController {
  constructor(
    private readonly whatsappAgentInternalService: WhatsAppAgentInternalService,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: "Lire l'état interne complet de l'agent",
    description:
      "Endpoint interne backend, appelé par le whatsapp-agent pour récupérer l'objet WhatsAppAgent complet (cache local côté agent) et le groupe de gestion associé.",
  })
  @ApiResponse({
    status: 200,
    description: "Snapshot complet de l'agent retourné",
  })
  @ApiResponse({
    status: 401,
    description: 'JWT inter-services invalide ou absent',
  })
  async getAgentSnapshot(@AgentContext() context: AgentRequestContext) {
    return this.whatsappAgentInternalService.getAgentSnapshot(
      context.agentId,
      context.userId,
    );
  }

  @Patch('me')
  @ApiOperation({
    summary: "Mettre à jour l'état interne de l'agent",
    description:
      "Endpoint interne backend unique pour les mises à jour venant du whatsapp-agent. Toutes les propriétés sont optionnelles (prompt, statut de sync image, erreur sync).",
  })
  @ApiResponse({
    status: 200,
    description: "Snapshot agent mis à jour et retourné",
  })
  @ApiResponse({
    status: 401,
    description: 'JWT inter-services invalide ou absent',
  })
  async updateAgentSnapshot(
    @AgentContext() context: AgentRequestContext,
    @Body() dto: UpdateAgentInternalDto,
  ) {
    return this.whatsappAgentInternalService.updateAgentSnapshot(
      context.agentId,
      context.userId,
      dto,
    );
  }
}
