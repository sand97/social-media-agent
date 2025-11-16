import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RequestPairingCodeDto {
  @ApiProperty({
    description: 'Phone number to pair with WhatsApp',
    example: '1234567890',
  })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}
