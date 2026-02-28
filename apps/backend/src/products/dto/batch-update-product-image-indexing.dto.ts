import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
  @IsBoolean()
  textIndexed?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  indexedImageIds?: string[];
}

export class BatchUpdateProductImageIndexingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageIndexingUpdateDto)
  updates!: ProductImageIndexingUpdateDto[];
}
