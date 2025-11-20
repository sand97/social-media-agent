import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ProvisionAgentDto {
  @ApiProperty({
    description: 'User ID for whom to provision the agent',
    example: 'clm1234567890',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;
}
