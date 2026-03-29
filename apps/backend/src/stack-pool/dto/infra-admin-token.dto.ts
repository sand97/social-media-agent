import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class InfraAdminTokenDto {
  @ApiPropertyOptional({
    description:
      "Token d'administration infra attendu par PasswordGuard(INFRA_ADMIN_TOKEN)",
    example: 'your-infra-admin-token',
  })
  @IsOptional()
  @IsString()
  token?: string;
}
