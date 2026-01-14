import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  Matches,
  IsOptional,
  IsIn,
} from 'class-validator';

export class RequestPairingDto {
  @ApiProperty({
    description: 'Phone number in E.164 format',
    example: '+15551234567',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
  phoneNumber: string;

  @ApiProperty({
    description: 'Device type (mobile or desktop)',
    example: 'mobile',
    required: false,
    enum: ['mobile', 'desktop'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['mobile', 'desktop'])
  deviceType?: 'mobile' | 'desktop';
}
