import { Module } from '@nestjs/common';

import { MinioModule } from '../minio/minio.module';

import { CatalogService } from './catalog.service';

@Module({
  imports: [MinioModule],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
