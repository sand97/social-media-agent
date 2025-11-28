import { ConnectorModule } from '@app/connector/connector.module';
import { PageScriptModule } from '@app/page-scripts/page-script.module';
import { PrismaModule } from '@app/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { CatalogSearchService } from './catalog-search.service';
import { CatalogSyncService } from './catalog-sync.service';
import { EmbeddingsService } from './embeddings.service';

/**
 * Module for catalog management with semantic search
 * - Syncs WhatsApp catalog to local DB
 * - Generates embeddings for semantic search
 * - Provides intelligent search with fallback
 */
@Module({
  imports: [
    PrismaModule,
    ConnectorModule,
    ConfigModule,
    EventEmitterModule,
    PageScriptModule,
  ],
  providers: [EmbeddingsService, CatalogSyncService, CatalogSearchService],
  exports: [CatalogSearchService, CatalogSyncService],
})
export class CatalogModule {}
