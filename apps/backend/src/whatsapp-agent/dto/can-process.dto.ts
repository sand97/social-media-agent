import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsISO8601 } from 'class-validator';

export class CanProcessDto {
  @ApiProperty({
    description: 'WhatsApp chat ID',
    example: '237657888690@c.us',
  })
  @IsString()
  chatId: string;

  @ApiProperty({
    description: 'User message',
    example: 'Bonjour, je voudrais commander un produit',
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'Message timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  @IsISO8601()
  timestamp: string;
}

export class AuthorizedGroupDto {
  @ApiProperty({
    description: 'WhatsApp group ID',
    example: '12345678@g.us',
  })
  whatsappGroupId: string;

  @ApiProperty({
    description: 'Usage description of the group',
    example: 'Support client',
  })
  usage: string;
}

export class CanProcessResponseDto {
  @ApiProperty({
    description: 'Whether the agent can process this message',
    example: true,
  })
  allowed: boolean;

  @ApiProperty({
    description: 'Reason if not allowed',
    example: 'Agent not configured',
    required: false,
  })
  reason?: string;

  @ApiProperty({
    description: 'Agent context (business instructions)',
    example: 'Vous êtes un assistant commercial...',
    required: false,
  })
  agentContext?: string;

  @ApiProperty({
    description: 'Management group ID for forwarding',
    example: '12345678@g.us',
    required: false,
  })
  managementGroupId?: string;

  @ApiProperty({
    description: 'Agent ID',
    example: 'clx123456',
    required: false,
  })
  agentId?: string;

  @ApiProperty({
    description: 'List of authorized groups',
    type: [AuthorizedGroupDto],
    required: false,
  })
  authorizedGroups?: AuthorizedGroupDto[];
}
