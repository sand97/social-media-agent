import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class SearchByKeywordsDto {
  @ApiProperty({
    description: 'List of keywords to match against retailer_id',
    example: ['aston-villa-domicile', '24749453701396976'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  keywords: string[];

  @ApiProperty({
    description: 'User ID to filter products',
    example: 'clx123456',
    required: true,
  })
  @IsString()
  user_id: string;

}
