import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional } from 'class-validator';

export class ExecuteMethodDto {
  @ApiProperty({
    description: 'Nom de la méthode à exécuter sur le client WhatsApp',
    example: 'sendMessage',
  })
  @IsString()
  method: string;

  @ApiProperty({
    description: "Paramètres à passer à la méthode (dans l'ordre)",
    example: ['123456789@c.us', 'Hello World!'],
    required: false,
    isArray: true,
  })
  @IsArray()
  @IsOptional()
  parameters?: any[];
}
