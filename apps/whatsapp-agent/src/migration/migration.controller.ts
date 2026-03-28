import PasswordGuard from '@app/guards/password.guard';
import { MigrateDto } from '@app/migration/migration.dto';
import { MigrationService } from '@app/migration/migration.service';
import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('migration')
@Controller('migration')
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}
  @UseInterceptors(ClassSerializerInterceptor)
  @UseGuards(PasswordGuard())
  @Post('deploy')
  public async migrate(@Body() _: MigrateDto): Promise<any> {
    const result = await this.migrationService.deployPrismaMigration();

    return {
      result,
    };
  }
}
