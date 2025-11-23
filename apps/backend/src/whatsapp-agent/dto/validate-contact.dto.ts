import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ValidateContactDto {
  @ApiProperty({
    description: 'Phone number to validate',
    example: '+237612345678',
  })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}
