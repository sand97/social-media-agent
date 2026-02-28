import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    description: 'ID WhatsApp du destinataire',
    example: '237657888690@c.us',
  })
  @IsString()
  to: string;

  @ApiProperty({
    description: 'Contenu du message texte',
    example: 'Bonjour, comment puis-je vous aider ?',
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'ID du message à citer (optionnel)',
    example: 'true_237657888690@c.us_3EB0A7E0',
    required: false,
  })
  @IsOptional()
  @IsString()
  quotedMessageId?: string;

  @ApiProperty({
    description:
      'Nom de session (accepté pour compatibilité, ignoré côté connector)',
    example: 'whatsapp-agent-session',
    required: false,
  })
  @IsOptional()
  @IsString()
  sessionName?: string;
}
