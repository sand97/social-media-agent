import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { WhatsAppAgentService } from './whatsapp-agent.service';
import { UpdateAgentStatusDto } from './dto/update-agent-status.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { WhatsAppAgent } from '@app/generated/client';

@ApiTags('whatsapp-agents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('whatsapp-agents')
export class WhatsAppAgentController {
  constructor(
    private readonly whatsappAgentService: WhatsAppAgentService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user\'s WhatsApp agent' })
  @ApiResponse({
    status: 200,
    description: 'Returns the WhatsApp agent for the current user',
  })
  @ApiResponse({
    status: 404,
    description: 'WhatsApp agent not found for this user',
  })
  async getMyAgent(@Request() req): Promise<WhatsAppAgent> {
    const userId = req.user.userId || req.user.id;
    const agent = await this.whatsappAgentService.getAgentForUser(userId);

    if (!agent) {
      throw new NotFoundException('WhatsApp agent not found for this user');
    }

    return agent;
  }

  @Post('provision')
  @ApiOperation({ summary: 'Provision a WhatsApp agent for the current user' })
  @ApiResponse({
    status: 201,
    description: 'WhatsApp agent successfully provisioned',
  })
  @ApiResponse({
    status: 409,
    description: 'WhatsApp agent already exists for this user',
  })
  async provisionAgent(@Request() req): Promise<WhatsAppAgent> {
    const userId = req.user.userId || req.user.id;
    return this.whatsappAgentService.provisionAgent(userId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update agent status' })
  @ApiParam({
    name: 'id',
    description: 'WhatsApp agent ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Agent status successfully updated',
  })
  @ApiResponse({
    status: 404,
    description: 'WhatsApp agent not found',
  })
  async updateAgentStatus(
    @Param('id') id: string,
    @Body() updateAgentStatusDto: UpdateAgentStatusDto,
  ): Promise<WhatsAppAgent> {
    return this.whatsappAgentService.updateAgentStatus(
      id,
      updateAgentStatusDto.status,
      updateAgentStatusDto.connectionStatus,
    );
  }

  @Get(':id/health')
  @ApiOperation({ summary: 'Check agent health' })
  @ApiParam({
    name: 'id',
    description: 'WhatsApp agent ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the health status of the agent',
  })
  @ApiResponse({
    status: 404,
    description: 'WhatsApp agent not found',
  })
  async checkAgentHealth(
    @Param('id') id: string,
  ): Promise<{ healthy: boolean; status?: string; error?: string }> {
    return this.whatsappAgentService.checkAgentHealth(id);
  }
}
