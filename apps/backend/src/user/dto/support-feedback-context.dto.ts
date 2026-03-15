import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SupportFeedbackContextDto {
  @ApiPropertyOptional({ description: 'Application area' })
  @IsOptional()
  @IsString()
  appArea?: string;

  @ApiPropertyOptional({ description: 'Detected plan label' })
  @IsOptional()
  @IsString()
  currentPlan?: string;

  @ApiPropertyOptional({ description: 'Current route pathname' })
  @IsOptional()
  @IsString()
  route?: string;

  @ApiPropertyOptional({ description: 'User timezone' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ description: 'Current page absolute URL' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ description: 'User identifier from frontend context' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Context score value' })
  @IsOptional()
  @IsString()
  contextScore?: string;
}
