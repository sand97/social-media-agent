import { Module } from '@nestjs/common';

import { MinioModule } from '../minio/minio.module';
import { PrismaModule } from '../prisma/prisma.module';

import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [MinioModule, PrismaModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
