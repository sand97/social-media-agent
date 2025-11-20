import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean } from 'class-validator';

export class AddMetadataDto {
  @ApiProperty({
    description: 'Metadata key',
    example: 'size',
  })
  @IsString()
  key: string;

  @ApiProperty({
    description: 'Metadata value',
    example: 'Large',
  })
  @IsString()
  value: string;

  @ApiProperty({
    description: 'Whether the metadata is visible to customers',
    example: true,
  })
  @IsBoolean()
  isVisible: boolean;
}
