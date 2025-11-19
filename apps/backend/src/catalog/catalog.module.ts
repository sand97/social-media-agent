import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { MinioModule } from '../minio/minio.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [MinioModule, PrismaModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
