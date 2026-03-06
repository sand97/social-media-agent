import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class UploadImageDto {
  @ApiProperty({
    description: 'Product ID',
    example: '25095720553426064',
  })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    description: 'Client ID (WhatsApp ID)',
    example: '237697020290@c.us',
  })
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @ApiProperty({
    description: 'Image index',
    example: 0,
  })
  @IsNumber()
  imageIndex: number;

  @ApiProperty({
    description: 'Image type (main or additional)',
    example: 'main',
  })
  @IsString()
  @IsNotEmpty()
  imageType: string;

  @ApiProperty({
    description: 'Original CDN URL',
    example: 'https://media.frns1-1.fna.whatsapp.net/...',
  })
  @IsString()
  @IsOptional()
  originalUrl?: string;
}
