import { ApiProperty } from '@nestjs/swagger';

export class ImportWhatsAppDataResponseDto {
  @ApiProperty({ description: 'Business information imported from WhatsApp' })
  businessInfo: any;

  @ApiProperty({ description: 'Number of products imported from catalog' })
  productsImported: number;

  @ApiProperty({ description: 'Number of contacts imported' })
  contactsImported: number;
}
