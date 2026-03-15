import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SupportFeedbackSentryDto {
  @ApiProperty({
    description: 'Public Sentry DSN used for support feedback',
    example:
      'https://549db520247ca4aa7f69f7e3eb5775f6@o1063428.ingest.us.sentry.io/4511042903539712',
  })
  @IsString()
  @IsNotEmpty()
  dsn: string;

  @ApiPropertyOptional({ description: 'Frontend Sentry environment' })
  @IsOptional()
  @IsString()
  environment?: string;

  @ApiPropertyOptional({ description: 'Frontend release identifier' })
  @IsOptional()
  @IsString()
  release?: string;
}
