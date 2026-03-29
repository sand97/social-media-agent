import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

import { InfraAdminTokenDto } from './infra-admin-token.dto';

export class ReleaseStackDto extends InfraAdminTokenDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serverId?: string;

  @ApiPropertyOptional({
    example: 'manual-release',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Supprimer aussi le VPS si plus aucune stack utile ne reste dessus',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  deleteServerWhenEmpty?: boolean;
}
