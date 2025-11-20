import { MigrationController } from '@app/migration/migration.controller';
import { MigrationService } from '@app/migration/migration.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [MigrationService],
  controllers: [MigrationController],
})
export class MigrationModule {}
