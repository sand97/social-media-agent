import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class MigrateDto {
  @ApiProperty()
  @IsOptional()
  token: string;
}
