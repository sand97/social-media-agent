import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from '@app/health/health.module';
import { ConnectorModule } from './connector/connector.module';
import { LangChainModule } from './langchain/langchain.module';
import { WebhookModule } from './webhook/webhook.module';
import { ProductsModule } from './products/products.module';

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
