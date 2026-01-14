import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethodType } from '@prisma/client';
import { IsEnum, IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreatePaymentMethodDto {
  @ApiProperty({
    description: 'Payment method type',
    enum: PaymentMethodType,
    example: 'MOBILE_MONEY',
  })
  @IsEnum(PaymentMethodType)
  type: PaymentMethodType;

  @ApiProperty({
    description: 'Mobile money number (required if type is MOBILE_MONEY)',
    example: '+237699999999',
    required: false,
  })
  @IsString()
  @IsOptional()
  mobileMoneyNumber?: string;

  @ApiProperty({
    description: 'Mobile money provider name (e.g., MTN, Orange)',
    example: 'MTN',
    required: false,
  })
  @IsString()
  @IsOptional()
  mobileMoneyName?: string;

  @ApiProperty({
    description: 'Whether proof of transfer is required',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  requiresProof?: boolean;
}
