import { WhatsAppAgentStatus, ConnectionStatus } from '@app/generated/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateAgentStatusDto {
  @ApiProperty({
    enum: WhatsAppAgentStatus,
    description: 'The new status of the agent',
    example: WhatsAppAgentStatus.RUNNING,
  })
  @IsEnum(WhatsAppAgentStatus)
  status: WhatsAppAgentStatus;

  @ApiProperty({
    enum: ConnectionStatus,
    description: 'The connection status of WhatsApp',
    required: false,
    example: ConnectionStatus.CONNECTED,
  })
  @IsEnum(ConnectionStatus)
  @IsOptional()
  connectionStatus?: ConnectionStatus;
}
