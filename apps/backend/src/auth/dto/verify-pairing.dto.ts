import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class VerifyPairingDto {
  @ApiProperty({
    description: 'Phone number in E.164 format',
    example: '+15551234567',
  })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({
    description: 'WhatsApp profile information',
    example: { name: 'John Doe', picture: 'https://...' },
  })
  @IsObject()
  @IsNotEmpty()
  whatsappProfile: any;
}
