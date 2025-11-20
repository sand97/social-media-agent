import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({
    description: 'WhatsApp chat ID',
    example: '237612345678@c.us',
  })
  @IsString()
  whatsappChatId: string;

  @ApiProperty({
    description: 'Contact name',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiProperty({
    description: 'Contact phone number',
    example: '237612345678',
  })
  @IsString()
  contactNumber: string;
}
