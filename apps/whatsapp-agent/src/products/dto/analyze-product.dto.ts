import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class AnalyzeProductDto {
  @ApiProperty({
    description: 'Nom du produit',
    example: 'T-shirt en coton bio',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Description du produit',
    example: 'Un t-shirt confortable en coton biologique, parfait pour l\'été',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Catégorie du produit',
    example: 'Vêtements',
  })
  @IsOptional()
  @IsString()
  category?: string;
}
