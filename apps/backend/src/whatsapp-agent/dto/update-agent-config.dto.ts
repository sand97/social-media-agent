import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateAgentConfigDto {
  @ApiProperty({
    description: 'Phone numbers for test mode (AI only responds to these)',
    example: ['+237612345678', '+237698765432'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  testPhoneNumbers?: string[];

  @ApiProperty({
    description:
      'Label names for test mode (AI only responds to contacts with these labels)',
    example: ['Test', 'VIP'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  testLabels?: string[];

  @ApiProperty({
    description:
      'Label names to exclude in production mode (AI will not respond to contacts with these labels)',
    example: ['DoNotReply', 'Blocked'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  labelsToNotReply?: string[];

  @ApiProperty({
    description: 'Enable production mode for the AI agent',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  productionEnabled?: boolean;
}
