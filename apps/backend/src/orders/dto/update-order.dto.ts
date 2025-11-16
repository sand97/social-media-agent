import { IsString, IsNumber, IsOptional, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '@app/generated/client';

export class UpdateOrderDto {
  @ApiProperty({
    description: 'Customer name',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiProperty({
    description: 'Customer phone number',
    example: '237612345678',
    required: false,
  })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiProperty({
    description: 'Products (JSON array)',
    example: [
      {
        productId: 'clxxx123',
        name: 'iPhone 15 Pro',
        quantity: 1,
        price: 999.99,
      },
    ],
    required: false,
  })
  @IsOptional()
  products?: any;

  @ApiProperty({
    description: 'Total amount',
    example: 999.99,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @ApiProperty({
    description: 'Delivery location ID',
    example: 'clxxx789',
    required: false,
  })
  @IsOptional()
  @IsString()
  deliveryLocationId?: string;

  @ApiProperty({
    description: 'Payment method ID',
    example: 'clxxx456',
    required: false,
  })
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @ApiProperty({
    description: 'Promise date for the order',
    example: '2025-11-20T10:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  promiseDate?: string;

  @ApiProperty({
    description: 'Order status',
    enum: OrderStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
