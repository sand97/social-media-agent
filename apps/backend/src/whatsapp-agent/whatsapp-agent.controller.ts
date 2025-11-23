import { WhatsAppAgent } from '@app/generated/client';
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

import { JwtAuthGuard } from '../guards/jwt-auth.guard';

import { UpdateAgentConfigDto } from './dto/update-agent-config.dto';
import { UpdateAgentStatusDto } from './dto/update-agent-status.dto';
import { ValidateContactDto } from './dto/validate-contact.dto';
import { WhatsAppAgentService } from './whatsapp-agent.service';

@ApiTags('whatsapp-agents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('whatsapp-agents')
export class WhatsAppAgentController {
  constructor(private readonly whatsappAgentService: WhatsAppAgentService) {}

  @Get('me')
  @ApiOperation({ summary: "Get current user's WhatsApp agent" })
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

  @Get('labels')
  @ApiOperation({ summary: 'Get all WhatsApp labels for current user' })
  @ApiResponse({
    status: 200,
    description: 'Returns all WhatsApp labels',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          hexColor: { type: 'string' },
          colorIndex: { type: 'number' },
          count: { type: 'number' },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'WhatsApp agent not found',
  })
  async getLabels(@Request() req): Promise<
    Array<{
      id: string;
      name: string;
      hexColor: string;
      colorIndex: number;
      count: number;
    }>
  > {
    const userId = req.user.userId || req.user.id;
    return this.whatsappAgentService.getLabels(userId);
  }

  @Post('contacts/validate')
  @ApiOperation({ summary: 'Validate if a phone number exists on WhatsApp' })
  @ApiResponse({
    status: 201,
    description: 'Returns validation result',
    schema: {
      type: 'object',
      properties: {
        exists: { type: 'boolean' },
        phoneNumber: { type: 'string' },
        contactId: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'WhatsApp agent not found',
  })
  async validateContact(
    @Request() req,
    @Body() dto: ValidateContactDto,
  ): Promise<{
    exists: boolean;
    phoneNumber: string;
    contactId?: string;
  }> {
    const userId = req.user.userId || req.user.id;
    return this.whatsappAgentService.validateContact(userId, dto.phoneNumber);
  }

  @Patch('config')
  @ApiOperation({ summary: 'Update agent configuration' })
  @ApiResponse({
    status: 200,
    description: 'Agent configuration updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'WhatsApp agent not found',
  })
  async updateAgentConfig(
    @Request() req,
    @Body() dto: UpdateAgentConfigDto,
  ): Promise<WhatsAppAgent> {
    const userId = req.user.userId || req.user.id;
    return this.whatsappAgentService.updateAgentConfig(userId, dto);
  }
}
