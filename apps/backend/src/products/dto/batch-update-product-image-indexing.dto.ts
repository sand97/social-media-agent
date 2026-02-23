import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ProductImageIndexingUpdateDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  coverImageDescription?: string;

  @IsOptional()
  @IsDateString()
  indexDescriptionAt?: string;

  @IsOptional()
  @IsDateString()
  indexImageAt?: string;
}

export class BatchUpdateProductImageIndexingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageIndexingUpdateDto)
  updates!: ProductImageIndexingUpdateDto[];
}
