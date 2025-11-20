import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsDateString } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({
    description: 'Conversation ID',
    example: 'clxxx123456789',
  })
  @IsString()
  conversationId: string;

  @ApiProperty({
    description: 'Customer name',
    example: 'John Doe',
  })
  @IsString()
  customerName: string;

  @ApiProperty({
    description: 'Customer phone number',
    example: '237612345678',
  })
  @IsString()
  customerPhone: string;

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
  })
  products: any;

  @ApiProperty({
    description: 'Total amount',
    example: 999.99,
  })
  @IsNumber()
  totalAmount: number;

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
}
