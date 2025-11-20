import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateDeliveryLocationDto {
  @ApiProperty({
    description: 'Country name',
    example: 'Cameroon',
  })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({
    description: 'City name',
    example: 'Douala',
  })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({
    description: 'Location name or zone identifier',
    example: 'Downtown',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Delivery price for this location',
    example: 5000,
  })
  @IsNumber()
  @IsNotEmpty()
  price: number;
}
