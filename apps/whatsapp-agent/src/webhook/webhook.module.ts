import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { LangChainModule } from '../langchain/langchain.module';
import { BackendClientModule } from '../backend-client/backend-client.module';

@Module({
  imports: [LangChainModule, BackendClientModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
