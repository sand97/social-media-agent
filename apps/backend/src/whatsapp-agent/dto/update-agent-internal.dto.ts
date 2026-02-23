import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateAgentInternalDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  customDescriptionPrompt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  promptBasedOnProductsCount?: number;

  @IsOptional()
  @IsIn(['SYNCING', 'DONE', 'FAILED'])
  syncImageStatus?: 'SYNCING' | 'DONE' | 'FAILED';

  @ValidateIf((dto) => dto.syncImageStatus === 'FAILED' || dto.syncImageError !== undefined)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  syncImageError?: string;
}
