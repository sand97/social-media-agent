import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateConversationDto {
  @ApiProperty({
    description: 'Contact name',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiProperty({
    description: 'Whether the conversation requires manual response',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  requiresManualResponse?: boolean;
}
