import { HealthModule } from '@app/health/health.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ConnectorModule } from './connector/connector.module';
import { LangChainModule } from './langchain/langchain.module';
import { ProductsModule } from './products/products.module';
import { WebhookModule } from './webhook/webhook.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HealthModule,
    ConnectorModule,
    LangChainModule,
    WebhookModule,
    ProductsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
