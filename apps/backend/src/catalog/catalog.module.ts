import { Module, forwardRef } from '@nestjs/common';

import { MinioModule } from '../minio/minio.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppAgentModule } from '../whatsapp-agent/whatsapp-agent.module';

import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [
    MinioModule,
    PrismaModule,
    forwardRef(() => WhatsAppAgentModule),
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
