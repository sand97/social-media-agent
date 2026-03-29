import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { InfraAdminTokenDto } from './infra-admin-token.dto';

export class ProvisionStackCapacityDto extends InfraAdminTokenDto {
  @ApiPropertyOptional({
    description: 'Nombre de VPS a provisionner',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  vpsCount?: number;

  @ApiPropertyOptional({
    description: 'Nombre de stacks a creer par VPS',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  stacksPerVps?: number;

  @ApiPropertyOptional({
    description: 'Type de serveur Hetzner',
    example: 'cpx22',
  })
  @IsOptional()
  @IsString()
  serverType?: string;

  @ApiPropertyOptional({
    description: 'Localisation Hetzner',
    example: 'nbg1',
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description: "Numéro utilisateur à prioriser pour l'allocation",
    example: '+237612345678',
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Pairing token frontend pour pousser les états WebSocket',
  })
  @IsOptional()
  @IsString()
  pairingToken?: string;

  @ApiPropertyOptional({
    description: "Type d'appareil de la session en attente",
    enum: ['mobile', 'desktop'],
  })
  @IsOptional()
  @IsIn(['mobile', 'desktop'])
  deviceType?: 'mobile' | 'desktop';

  @ApiPropertyOptional({
    description: 'Raison métier ou opérationnelle',
    example: 'keep-minimum-free-stacks',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
