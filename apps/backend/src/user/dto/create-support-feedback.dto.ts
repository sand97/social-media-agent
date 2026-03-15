import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { SupportFeedbackContextDto } from './support-feedback-context.dto';
import { SupportFeedbackSentryDto } from './support-feedback-sentry.dto';

export class CreateSupportFeedbackDto {
  @ApiProperty({ description: 'Support request category', example: 'bug' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({
    description: 'Reply email used in Sentry feedback',
    example: 'client@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Support message body',
    example: 'Le formulaire support reste bloque apres validation.',
  })
  @IsString()
  @MinLength(20)
  message: string;

  @ApiProperty({
    description: 'Display name sent to support',
    example: 'Jean Dupont',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Optional support subject',
    example: 'Bug sur la page Support',
  })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({
    description: 'Additional non-sensitive frontend context',
    type: SupportFeedbackContextDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SupportFeedbackContextDto)
  context?: SupportFeedbackContextDto;

  @ApiProperty({
    description: 'Sentry relay configuration',
    type: SupportFeedbackSentryDto,
  })
  @ValidateNested()
  @Type(() => SupportFeedbackSentryDto)
  sentry: SupportFeedbackSentryDto;
}
