import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsISO8601 } from 'class-validator';

export class LogOperationDto {
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
  userMessage: string;

  @ApiProperty({
    description: 'Agent response',
    example: 'Bonjour ! Je vais vous aider avec votre commande.',
  })
  @IsString()
  agentResponse: string;

  @ApiProperty({
    description: 'Operation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  @IsISO8601()
  timestamp: string;
}
