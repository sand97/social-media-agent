import { VpsProvisioningStatus } from '@app/generated/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import { InfraAdminTokenDto } from './infra-admin-token.dto';

export const INFRA_SERVER_CONTRACT_STATES = ['active', 'terminated'] as const;

export type InfraServerContractState =
  (typeof INFRA_SERVER_CONTRACT_STATES)[number];

export class ListProvisioningServersDto extends InfraAdminTokenDto {
  @ApiPropertyOptional({
    default: 1,
    description: 'Page à retourner',
    example: 1,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: 20,
    description: 'Nombre de VPS par page',
    example: 20,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional({
    description: 'Filtrer selon létat contractuel du VPS',
    enum: INFRA_SERVER_CONTRACT_STATES,
    example: 'active',
  })
  @IsOptional()
  @IsIn(INFRA_SERVER_CONTRACT_STATES)
  contractState?: InfraServerContractState;

  @ApiPropertyOptional({
    description: 'Filtrer selon le statut technique du provisioning',
    enum: VpsProvisioningStatus,
    example: VpsProvisioningStatus.READY,
  })
  @IsOptional()
  @IsEnum(VpsProvisioningStatus)
  provisioningStatus?: VpsProvisioningStatus;

  @ApiPropertyOptional({
    description: 'Filtrer les VPS demandés à partir de cette date ISO',
    example: '2026-03-28T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  requestedFrom?: string;

  @ApiPropertyOptional({
    description: 'Filtrer les VPS demandés jusquà cette date ISO',
    example: '2026-03-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  requestedTo?: string;
}
