import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  IsUrl,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateBusinessInfoDto {
  @ApiProperty({
    description: 'Business name',
    example: 'My Business',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Business description',
    example: 'We provide quality products and services',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Business address',
    example: '123 Main Street',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({
    description: 'Business city',
    example: 'Douala',
    required: false,
  })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({
    description: 'Business country',
    example: 'Cameroon',
    required: false,
  })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({
    description: 'Business website',
    example: 'https://mybusiness.com',
    required: false,
  })
  @IsUrl()
  @IsOptional()
  website?: string;

  @ApiProperty({
    description: 'Opening hours in JSON format',
    example: {
      monday: '09:00-18:00',
      tuesday: '09:00-18:00',
      wednesday: '09:00-18:00',
      thursday: '09:00-18:00',
      friday: '09:00-18:00',
      saturday: '09:00-14:00',
      sunday: 'closed',
    },
    required: false,
  })
  @IsObject()
  @IsOptional()
  openingHours?: Record<string, string>;

  @ApiProperty({
    description: 'Additional phone numbers',
    example: ['+237699999999', '+237600000000'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  phoneNumbers?: string[];
}
