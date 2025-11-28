import { HealthModule } from '@app/health/health.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { BackendClientModule } from './backend-client/backend-client.module';
import { CatalogModule } from './catalog/catalog.module';
import { ConnectorModule } from './connector/connector.module';
import { LangChainModule } from './langchain/langchain.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { QueueModule } from './queue/queue.module';
import { SecurityModule } from './security/security.module';
import { ToolsModule } from './tools/tools.module';
import { WebhookModule } from './webhook/webhook.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    QueueModule,
    SecurityModule,
    HealthModule,
    ConnectorModule,
    BackendClientModule,
    CatalogModule, // Catalog sync with embeddings
    ToolsModule,
    LangChainModule,
    WebhookModule,
    ProductsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
