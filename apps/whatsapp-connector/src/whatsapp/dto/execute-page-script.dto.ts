import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExecutePageScriptDto {
  @ApiProperty({
    description:
      'JavaScript code to execute in the WhatsApp Web page context',
    example: `
      const collections = await window.WPP.catalog.getCollections(
        window.WPP.conn?.getMyUserId()?._serialized || '',
        50,
        100
      );
      return collections;
    `,
  })
  @IsString()
  @IsNotEmpty()
  script: string;
}
